// SPDX-License-Identifier: AGPL-3.0-or-later
import { registerGithubTools } from './mcp-github';
import { registerGroupwareTools } from './mcp-groupware';
import { registerPlanningTools } from './mcp-planning';
import { registerFileTrashTools } from './mcp-file-trash';
import { registerFileShareTools } from './mcp-file-shares';
import {registerGeneralTablesWriteTools} from './mcp-tables-general-write';
import { enforceConnectionPermissions } from './mcp-permissions';
import { registerInventoryTools } from './mcp-inventory';
import { registerMindmapTools } from './mcp-mindmap';
import { registerFilesWriteTools } from "./mcp-files";
import { registerFileContentTools } from "./mcp-file-content";
import { registerTablesWriteTools } from "./mcp-tables-write";
import { registerTablesReadTools } from "./mcp-tables";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  createCard,
  deckBoardUrl,
  getCard,
  listBoards,
  listStacks,
  moveCard,
  updateCard,
  type DeckCard,
} from "./deck";

import { requireScope, scopeMetadata } from "./access";
import { READ_SCOPE, WRITE_SCOPE } from "./oauth";
import { registerNextcloudReadTools } from "./mcp-nextcloud";
import { registerCalendarTools } from "./mcp-calendar";
import { registerAnnouncementsReadTools } from "./mcp-announcements";
import { registerMailReadTools } from "./mcp-mail";
import { registerTalkReadTools } from "./mcp-talk";
import { CONNECTOR_VERSION } from "./connector-version";
import { updateCardInMindmapWorkflow } from './deck-mindmap-workflow';

const DEFAULT_BOARD_ID = 5;

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function compoundCardId(boardId: number, stackId: number, cardId: number) {
  return `card:${boardId}:${stackId}:${cardId}`;
}

function parseCardId(value: string) {
  const match = /^card:(\d+):(\d+):(\d+)$/.exec(value);
  if (!match) throw new Error("Karten-ID muss das Format card:<board>:<stack>:<card> haben.");
  return { boardId: Number(match[1]), stackId: Number(match[2]), cardId: Number(match[3]) };
}

function cardText(card: DeckCard, stackTitle?: string) {
  return [
    `Titel: ${card.title}`,
    stackTitle ? `Liste: ${stackTitle}` : null,
    card.description ? `Beschreibung:\n${card.description}` : null,
    card.duedate ? `Fällig: ${card.duedate}` : null,
    card.done ? `Geprüft/erledigt: ${card.done}` : null,
    card.archived ? "Archiviert: ja" : null,
  ].filter(Boolean).join("\n\n");
}

function cardSummary(card: DeckCard) {
  return {
    id: card.id,
    title: card.title,
    stackId: card.stackId,
    order: card.order ?? null,
    done: card.done ?? null,
    archived: card.archived ?? false,
    duedate: card.duedate ?? null,
  };
}

function stackSummary(stack: Awaited<ReturnType<typeof listStacks>>[number]) {
  const cards = (stack.cards ?? [])
    .filter((card) => !card.deletedAt && !card.archived)
    .map(cardSummary);
  return {
    id: stack.id,
    boardId: stack.boardId,
    title: stack.title,
    order: stack.order,
    cardCount: cards.length,
    cards,
  };
}

async function boardStructure(boardId: number) {
  const boards = await listBoards();
  const board = boards.find((item) => item.id === boardId && !item.deletedAt);
  if (!board) throw new Error(`Aktives Board ${boardId} wurde nicht gefunden.`);
  const stacks = (await listStacks(boardId))
    .filter((stack) => !stack.deletedAt)
    .map(stackSummary);
  return { board, stacks, url: deckBoardUrl(boardId) };
}

export function createDeckMcpServer() {
  const server = new McpServer({ name: "novaforge-deck", title: "NovaSpace Connector", version: CONNECTOR_VERSION });
  enforceConnectionPermissions(server);
  registerPlanningTools(server);
  registerGroupwareTools(server);
  registerInventoryTools(server);
  registerGithubTools(server);
  registerFileShareTools(server);
  registerFileTrashTools(server);

  server.registerTool("search", {
    ...scopeMetadata(READ_SCOPE),
    title: "NOVAFORGE Deck durchsuchen",
    description: "Durchsucht aktive Deck-Boards, Listen und Karten nach einem Text.",
    inputSchema: z.object({ query: z.string().describe("Suchtext") }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query }, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    const needle = query.trim().toLocaleLowerCase("de");
    const boards = (await listBoards()).filter((board) => !board.deletedAt);
    const results: Array<{ id: string; title: string; url: string }> = [];

    for (const board of boards) {
      if (!needle || board.title.toLocaleLowerCase("de").includes(needle)) {
        results.push({ id: `board:${board.id}`, title: board.title, url: deckBoardUrl(board.id) });
      }
      const stacks = await listStacks(board.id);
      for (const stack of stacks.filter((item) => !item.deletedAt)) {
        if (!needle || stack.title.toLocaleLowerCase("de").includes(needle)) {
          results.push({ id: `stack:${board.id}:${stack.id}`, title: `${board.title} / ${stack.title}`, url: deckBoardUrl(board.id) });
        }
        for (const card of (stack.cards ?? []).filter((item) => !item.deletedAt && !item.archived)) {
          const haystack = `${card.title}\n${card.description ?? ""}`.toLocaleLowerCase("de");
          if (!needle || haystack.includes(needle)) {
            results.push({ id: compoundCardId(board.id, stack.id, card.id), title: card.title, url: deckBoardUrl(board.id) });
          }
        }
      }
    }
    return result({ results: results.slice(0, 50) });
  });

  server.registerTool("fetch", {
    ...scopeMetadata(READ_SCOPE),
    title: "Deck-Karte abrufen",
    description: "Ruft eine Deck-Karte über ihre bekannte Kennung vollständig ab, auch wenn sie archiviert ist. Erledigt- und Archivstatus sind getrennt.",
    inputSchema: z.object({ id: z.string().describe("ID aus search") }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ id }, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    const parsed = parseCardId(id);
    const card = await getCard(parsed.boardId, parsed.stackId, parsed.cardId);
    const stacks = await listStacks(parsed.boardId);
    const stackTitle = stacks.find((stack) => stack.id === parsed.stackId)?.title;
    return result({
      id,
      title: card.title,
      description: card.description ?? "",
      text: cardText(card, stackTitle),
      url: deckBoardUrl(parsed.boardId),
      metadata: { boardId: parsed.boardId, stackId: parsed.stackId, cardId: parsed.cardId, done: card.done ?? null, archived: card.archived ?? false, duedate: card.duedate ?? null },
    });
  });

  server.registerTool("get_board", {
    ...scopeMetadata(READ_SCOPE),
    title: "NOVAFORGE-Board lesen",
    description: "Liest Board, Listen und schlanke Kartenübersichten ohne vollständige Beschreibungen.",
    inputSchema: z.object({ boardId: z.number().int().positive().default(DEFAULT_BOARD_ID) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ boardId }, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    return result(await boardStructure(boardId));
  });

  server.registerTool("list_boards", {
    ...scopeMetadata(READ_SCOPE),
    title: "NOVAFORGE-Boards auflisten",
    description: "Listet aktive Deck-Boards ohne Listen- oder Karteninhalte auf.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (_input, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    const boards = (await listBoards())
      .filter((board) => !board.deletedAt)
      .map((board) => ({ id: board.id, title: board.title, color: board.color ?? null, url: deckBoardUrl(board.id) }));
    return result({ boards });
  });

  server.registerTool("get_board_structure", {
    ...scopeMetadata(READ_SCOPE),
    title: "NOVAFORGE-Boardstruktur lesen",
    description: "Liest ein Board mit Listen und schlanken Kartenübersichten ohne vollständige Beschreibungen.",
    inputSchema: z.object({ boardId: z.number().int().positive().default(DEFAULT_BOARD_ID) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ boardId }, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    return result(await boardStructure(boardId));
  });

  server.registerTool("get_stack", {
    ...scopeMetadata(READ_SCOPE),
    title: "NOVAFORGE-Deck-Liste lesen",
    description: "Liest eine einzelne Liste mit schlanken Kartenübersichten.",
    inputSchema: z.object({
      boardId: z.number().int().positive().default(DEFAULT_BOARD_ID),
      stackId: z.number().int().positive(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ boardId, stackId }, context) => {
    const authError = requireScope(context, READ_SCOPE);
    if (authError) return authError;
    const stack = (await listStacks(boardId)).find((item) => item.id === stackId && !item.deletedAt);
    if (!stack) throw new Error(`Aktive Liste ${stackId} wurde in Board ${boardId} nicht gefunden.`);
    return result({ stack: stackSummary(stack), url: deckBoardUrl(boardId) });
  });

  server.registerTool("create_card", {
    ...scopeMetadata(WRITE_SCOPE),
    title: "Deck-Karte anlegen",
    description: "Legt eine neue Karte in einer Liste des NOVAFORGE-Boards an.",
    inputSchema: z.object({
      boardId: z.number().int().positive().default(DEFAULT_BOARD_ID),
      stackId: z.number().int().positive(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      duedate: z.iso.datetime({ offset: true }).nullable().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input, context) => {
    const authError = requireScope(context, WRITE_SCOPE);
    if (authError) return authError;
    return result({ card: await createCard(input), url: deckBoardUrl(input.boardId) });
  });

  server.registerTool("update_card", {
    ...scopeMetadata(WRITE_SCOPE),
    title: "Deck-Karte bearbeiten",
    description: "Ändert gezielt Titel, Beschreibung, Fälligkeit, Erledigtstatus oder Archivstatus einer Karte und liest zurück. Bei ausdrücklich gespeicherter nf-mindmap-Zuordnung werden im selben Arbeitsaufruf das Kreissymbol im Titel und die zugeordnete Mindmap aktualisiert; hierfür zusätzlich deck:read/files:read/files:write erforderlich. Neue Checkbox-Zeilen im gewählten Bereich bekommen interne Kennungen. Bei mindmap.pending ist Deck bereits gespeichert: nur den Abgleich prüfen, die Kartenänderung nicht wiederholen. Andere Karten bleiben im bisherigen Modus. archived und done sind getrennt; unangegebene Felder bleiben erhalten. Vor Änderungen frisch lesen.",
    inputSchema: z.object({
      boardId: z.number().int().positive().default(DEFAULT_BOARD_ID),
      stackId: z.number().int().positive(),
      cardId: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      duedate: z.iso.datetime({ offset: true }).nullable().optional(),
      done: z.iso.datetime({ offset: true }).nullable().optional().describe("Zeitpunkt für geprüft/erledigt; null hebt den Status auf"),
      archived: z.boolean().optional().describe("Archivstatus unabhängig von done: true archivieren, false wieder aktivieren; bekannte Kartenkennung beibehalten"),
    }).refine((value) => value.title !== undefined || value.description !== undefined || value.duedate !== undefined || value.done !== undefined || value.archived !== undefined, { message: "Mindestens ein zu änderndes Feld ist erforderlich." }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input, context) => {
    const authError = requireScope(context, WRITE_SCOPE);
    if (authError) return authError;
    return result({ ...await updateCardInMindmapWorkflow(input, context.http?.authInfo?.scopes ?? []), url: deckBoardUrl(input.boardId) });
  });

  server.registerTool("move_card", {
    ...scopeMetadata(WRITE_SCOPE),
    title: "Deck-Karte verschieben",
    description: "Verschiebt eine Karte innerhalb desselben Boards in eine andere Liste.",
    inputSchema: z.object({
      boardId: z.number().int().positive().default(DEFAULT_BOARD_ID),
      sourceStackId: z.number().int().positive(),
      targetStackId: z.number().int().positive(),
      cardId: z.number().int().positive(),
      order: z.number().int().nonnegative().default(999),
    }).refine((value) => value.sourceStackId !== value.targetStackId, { message: "Quell- und Zielliste müssen verschieden sein." }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input, context) => {
    const authError = requireScope(context, WRITE_SCOPE);
    if (authError) return authError;
    return result({ card: await moveCard(input), url: deckBoardUrl(input.boardId) });
  });

  registerNextcloudReadTools(server);
  registerTalkReadTools(server);
  registerMailReadTools(server);
  registerAnnouncementsReadTools(server);
  registerCalendarTools(server);
  registerFilesWriteTools(server);
  registerFileContentTools(server);
  registerTablesReadTools(server);
  registerTablesWriteTools(server);
  registerGeneralTablesWriteTools(server);
  registerMindmapTools(server);
  return server;
}
