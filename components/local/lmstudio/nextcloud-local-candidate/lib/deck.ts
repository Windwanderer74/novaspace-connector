// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from "./runtime-config";

const API_PREFIX = "/index.php/apps/deck/api/v1.0";

export type DeckBoard = {
  id: number;
  title: string;
  color?: string;
  deletedAt?: number;
  permissions?: Record<string, boolean>;
};

export type DeckStack = {
  id: number;
  boardId: number;
  title: string;
  order: number;
  deletedAt?: number;
  cards?: DeckCard[];
};

export type DeckCard = {
  id: number;
  title: string;
  description?: string | null;
  stackId: number;
  type?: string;
  owner?: string | {
    uid?: string;
    primaryKey?: string;
    displayname?: string;
  };
  order?: number;
  archived?: boolean;
  done?: string | null;
  duedate?: string | null;
  deletedAt?: number;
  lastModified?: number;
};

function ownerId(owner: DeckCard["owner"]): string {
  if (typeof owner === "string") return owner;
  return owner?.uid ?? owner?.primaryKey ?? "";
}

function sameTimestamp(actual: string | null | undefined, expected: string | null): boolean {
  if ((actual ?? null) === expected) return true;
  if (actual == null || expected == null) return false;
  const actualTime = Date.parse(actual);
  const expectedTime = Date.parse(expected);
  return Number.isFinite(actualTime)
    && Number.isFinite(expectedTime)
    && Math.floor(actualTime / 1000) === Math.floor(expectedTime / 1000);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

function config() {
  const runtime = getDeckRuntimeConfig();
  const baseUrl = (runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL)?.replace(/\/$/, "");
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;

  if (!baseUrl || !login || !password) {
    throw new Error("Nextcloud-Zugang ist serverseitig nicht vollständig konfiguriert.");
  }

  const url = new URL(baseUrl);
  if (url.protocol !== "https:") {
    throw new Error("NEXTCLOUD_BASE_URL muss HTTPS verwenden.");
  }

  return { baseUrl: url.origin, login, password };
}

async function deckRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return nextcloudRequest<T>(`${API_PREFIX}${path}`, options);
}

async function nextcloudRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { baseUrl, login, password } = config();
  if (!path.startsWith("/")) throw new Error("Ungültiger Deck-API-Pfad.");

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "OCS-APIRequest": "true",
      Authorization: `Basic ${btoa(`${login}:${password}`)}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  if (!response.ok) {
    const detail = text.slice(0, 500).replace(/\s+/g, " ");
    throw new Error(`Nextcloud Deck antwortete mit HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Nextcloud Deck lieferte keine gültige JSON-Antwort.");
  }
}

export function deckBoardUrl(boardId: number): string {
  const { baseUrl } = config();
  return `${baseUrl}/index.php/apps/deck/#/board/${boardId}`;
}

export async function listBoards(): Promise<DeckBoard[]> {
  return deckRequest<DeckBoard[]>("/boards");
}

export async function listStacks(boardId: number): Promise<DeckStack[]> {
  return deckRequest<DeckStack[]>(`/boards/${boardId}/stacks`);
}

export async function getCard(boardId: number, stackId: number, cardId: number): Promise<DeckCard> {
  const card = await deckRequest<DeckCard>(`/boards/${boardId}/stacks/${stackId}/cards/${cardId}`);
  // Deck may resolve a card by ID despite a stale stack in the URL. A PUT using
  // that URL can move it: reject the mismatch before any write or false metadata.
  if (card.id !== cardId || card.stackId !== stackId) throw new Error('Karten-/Listenkennung ist veraltet. Aktuelle Kartenposition über die Boardstruktur ermitteln; keine Änderung ausgeführt.');
  return card;
}

export async function createCard(input: {
  boardId: number;
  stackId: number;
  title: string;
  description?: string;
  duedate?: string | null;
}): Promise<DeckCard> {
  return deckRequest<DeckCard>(`/boards/${input.boardId}/stacks/${input.stackId}/cards`, {
    method: "POST",
    body: {
      title: input.title,
      type: "plain",
      order: 999,
      description: input.description ?? "",
      duedate: input.duedate ?? null,
    },
  });
}

export async function updateCard(input: {
  boardId: number;
  stackId: number;
  cardId: number;
  title?: string;
  description?: string;
  duedate?: string | null;
  done?: string | null;
  archived?: boolean;
}): Promise<DeckCard> {
  const current = await getCard(input.boardId, input.stackId, input.cardId);
  await deckRequest<DeckCard>(
    `/boards/${input.boardId}/stacks/${input.stackId}/cards/${input.cardId}`,
    {
      method: "PUT",
      body: {
        title: input.title ?? current.title,
        description: input.description ?? current.description ?? "",
        type: current.type ?? "plain",
        owner: ownerId(current.owner),
        order: current.order ?? 999,
        duedate: input.duedate !== undefined ? input.duedate : current.duedate ?? null,
        archived: input.archived ?? current.archived ?? false,
        done: input.done !== undefined ? input.done : current.done ?? null,
      },
    },
  );

  const verified = await getCard(input.boardId, input.stackId, input.cardId);
  const mismatches = [
    verified.id !== current.id || verified.stackId !== current.stackId ? "identity" : null,
    verified.title !== (input.title ?? current.title) ? "title" : null,
    (verified.description ?? "") !== (input.description ?? current.description ?? "") ? "description" : null,
    !sameTimestamp(verified.duedate, input.duedate !== undefined ? input.duedate : current.duedate ?? null) ? "duedate" : null,
    !sameTimestamp(verified.done, input.done !== undefined ? input.done : current.done ?? null) ? "done" : null,
    (verified.archived ?? false) !== (input.archived ?? current.archived ?? false) ? "archived" : null,
  ].filter(Boolean);

  if (mismatches.length > 0) {
    throw new Error(`Deck-Kartenänderung wurde nicht bestätigt (${mismatches.join(", ")}).`);
  }

  return verified;
}

export async function moveCard(input: {
  boardId: number;
  sourceStackId: number;
  targetStackId: number;
  cardId: number;
  order?: number;
}): Promise<DeckCard> {
  if (input.sourceStackId === input.targetStackId) {
    throw new Error("Quell- und Zielliste müssen verschieden sein.");
  }

  const current = await getCard(input.boardId, input.sourceStackId, input.cardId);
  if (current.stackId !== input.sourceStackId) {
    throw new Error(`Karte ${input.cardId} liegt nicht in der angegebenen Quellliste ${input.sourceStackId}.`);
  }

  const stacks = (await listStacks(input.boardId)).filter((stack) => !stack.deletedAt);
  if (!stacks.some((stack) => stack.id === input.targetStackId)) {
    throw new Error(`Aktive Zielliste ${input.targetStackId} wurde in Board ${input.boardId} nicht gefunden.`);
  }

  // Deck 1.16.x ignores the target stack on the documented REST reorder route.
  // The web UI route does not contain the source stack as a conflicting path parameter.
  await nextcloudRequest<DeckCard>(`/index.php/apps/deck/cards/${input.cardId}/reorder`, {
    method: "PUT",
    body: { stackId: input.targetStackId, order: input.order ?? 999 },
  });

  let verified: DeckCard;
  try {
    verified = await getCard(input.boardId, input.targetStackId, input.cardId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Deck-Kartenverschiebung wurde nicht bestätigt: ${detail}`);
  }

  if (verified.stackId !== input.targetStackId) {
    throw new Error(
      `Deck-Kartenverschiebung wurde nicht bestätigt: erwartet Stack ${input.targetStackId}, erhalten ${verified.stackId}.`,
    );
  }

  return verified;
}
