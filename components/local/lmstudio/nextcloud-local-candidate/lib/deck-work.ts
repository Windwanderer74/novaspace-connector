// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity } from './nextcloud-read';
import { planningJson, planningVersion } from './planning-json';
import { readPlanningBoard, readPlanningCard } from './deck-planning';

const rest = '/index.php/apps/deck/api/v1.0/boards';
const commentsPath = (id: number) => `/ocs/v2.php/apps/deck/api/v1.0/cards/${id}/comments`;
const request = async (path: string, method = 'GET', body?: unknown) => (await planningJson(path, method, body)).data;
const note = 'Native Deck-API ohne atomare Versionsbedingung. Bei unbekanntem Ergebnis zuerst lesen; keine automatische Wiederholung.';
type CardRef = { boardId: number; stackId: number; cardId: number };
type CardGuard = CardRef & { expectedAccount: string; expectedVersion: string; expectedBoardVersion: string };
function object(x: any) { if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Ungültige Deck-Antwort.'); return x; }
function array(x: any): any[] { if (!Array.isArray(x) || x.length > 5000) throw new Error('Deck-Bestand zu groß oder ungültig.'); return x; }
function id(x: any): number { const n = typeof x === 'string' && /^[1-9][0-9]*$/.test(x) ? Number(x) : x; if (!Number.isSafeInteger(n) || n < 1) throw new Error('Ungültige Deck-Kennung.'); return n; }
function boardItem(x: any) {
  object(x); id(x.id);
  if (typeof x.title !== 'string' || typeof x.color !== 'string' || typeof x.archived !== 'boolean') throw new Error('Unvollständiges Deck-Board.');
  return x;
}
function same(a: unknown, b: unknown) { return planningVersion(a).then(v => planningVersion(b).then(w => v === w)); }
const pick = (x: any, fields: string[]) => Object.fromEntries(fields.map(k => [k, x[k] ?? null]));
async function account(expected: string) { if ((await nextcloudIdentity()).uid !== expected) throw new Error('Kontowechsel: Änderung gestoppt.'); }
function writable(board: any, permission: 'PERMISSION_MANAGE' | 'PERMISSION_READ', allowArchived = false) {
  if (board.deletedAt || (!allowArchived && board.archived) || board.permissions?.[permission] !== true) throw new Error('Board archiviert oder native Berechtigung fehlt.');
}
async function boards() {
  const items = array(await request(rest)).filter(b => !b.deletedAt).map(boardItem).sort((a, b) => a.id - b.id);
  if (new Set(items.map(b => b.id)).size !== items.length) throw new Error('Doppelte Board-Kennung.');
  return { boards: items, version: await planningVersion(items) };
}
async function structure(boardId: number) {
  const { board, version: boardVersion } = await readPlanningBoard(boardId);
  boardItem(board);
  const stacks = array(await request(`${rest}/${boardId}/stacks`)).filter(s => !s.deletedAt).map(s => {
    object(s); id(s.id);
    if (s.boardId !== boardId || typeof s.title !== 'string' || !Number.isSafeInteger(s.order)) throw new Error('Ungültige Listenzuordnung.');
    return { id: s.id, boardId, title: s.title, order: s.order };
  }).sort((a, b) => a.id - b.id);
  if (new Set(stacks.map(s => s.id)).size !== stacks.length) throw new Error('Doppelte Listenkennung.');
  return { board, boardVersion, stacks, version: await planningVersion({ boardVersion, stacks }) };
}
export async function readDeckStructure(boardId?: number) {
  return boardId === undefined ? { mode: 'boards', ...await boards() } : { mode: 'board', ...await structure(boardId) };
}
export async function createDeckBoard(a: { title: string; color: string; expectedAccount: string; expectedVersion: string }) {
  await account(a.expectedAccount);
  const before = await boards();
  if (before.version !== a.expectedVersion) throw new Error('Boardbestand verändert: neu lesen.');
  if (before.boards.some(b => b.title.toLocaleLowerCase('de') === a.title.toLocaleLowerCase('de'))) throw new Error('Boardtitel bereits vorhanden. Vorhandene Kennung prüfen.');
  let created: any;
  try { created = boardItem(await request(rest, 'POST', { title: a.title, color: a.color })); }
  catch { return { outcome: 'unknown', note: 'Boardanlage nicht bestätigt. Boardübersicht lesen; nicht erneut anlegen.' }; }
  if (before.boards.some(b => b.id === created.id)) return { outcome: 'unknown', boardId: created.id, note };
  try {
    const after = await readPlanningBoard(created.id);
    return { outcome: after.board.title === a.title && after.board.color.toUpperCase() === a.color.toUpperCase() && !after.board.archived ? 'verified' : 'unknown', ...after, atomic: false, note };
  } catch { return { outcome: 'unknown', boardId: created.id, note }; }
}
export async function updateDeckBoard(a: { boardId: number; expectedAccount: string; expectedBoardVersion: string; title?: string; color?: string; archived?: boolean }) {
  await account(a.expectedAccount);
  const before = await readPlanningBoard(a.boardId);
  boardItem(before.board); writable(before.board, 'PERMISSION_MANAGE', true);
  if (before.version !== a.expectedBoardVersion) throw new Error('Board verändert: neu lesen.');
  if (before.board.archived && (a.archived !== false || a.title !== undefined || a.color !== undefined)) throw new Error('Archiviertes Board zuerst gezielt wieder aktivieren.');
  const patch = Object.fromEntries(['title', 'color', 'archived'].filter(k => (a as any)[k] !== undefined).map(k => [k, (a as any)[k]]));
  if (!Object.keys(patch).length) throw new Error('Keine Änderung angegeben.');
  const input = { ...pick(before.board, ['title', 'color', 'archived']), ...patch };
  if (await same(input, pick(before.board, ['title', 'color', 'archived']))) return { outcome: 'unchanged', ...before, atomic: false };
  await request(`${rest}/${a.boardId}`, 'PUT', input);
  try {
    const after = await readPlanningBoard(a.boardId);
    const verified = await same(input, pick(after.board, ['title', 'color', 'archived'])) && await same(pick(before.board, ['id', 'owner', 'acl', 'users', 'labels']), pick(after.board, ['id', 'owner', 'acl', 'users', 'labels']));
    return { outcome: verified ? 'verified' : 'unknown', ...after, atomic: false, note };
  } catch { return { outcome: 'unknown', boardId: a.boardId, note }; }
}
export async function saveDeckStack(a: { boardId: number; stackId?: number; title?: string; order?: number; expectedAccount: string; expectedVersion: string }) {
  await account(a.expectedAccount);
  const before = await structure(a.boardId); writable(before.board, 'PERMISSION_MANAGE');
  if (before.version !== a.expectedVersion) throw new Error('Board oder Listen verändert: Struktur neu lesen.');
  const previous = a.stackId === undefined ? undefined : before.stacks.find(s => s.id === a.stackId);
  if (a.stackId !== undefined && !previous) throw new Error('Liste gehört nicht zum gewählten Board.');
  if (a.title === undefined && a.order === undefined) throw new Error('Keine Listenänderung angegeben.');
  if (!previous && (a.title === undefined || a.order === undefined)) throw new Error('Neue Liste benötigt Titel und Sortierwert.');
  const input = { title: a.title ?? previous!.title, order: a.order ?? previous!.order };
  if (!previous && before.stacks.some(s => s.title.toLocaleLowerCase('de') === input.title.toLocaleLowerCase('de'))) throw new Error('Listentitel bereits vorhanden. Vorhandene Kennung prüfen.');
  if (previous && await same(input, pick(previous, ['title', 'order']))) return { outcome: 'unchanged', ...before, stackId: previous.id, atomic: false };
  let written: any;
  try { written = object(await request(`${rest}/${a.boardId}/stacks${previous ? '/' + previous.id : ''}`, previous ? 'PUT' : 'POST', input)); id(written.id); }
  catch { return { outcome: 'unknown', boardId: a.boardId, stackId: a.stackId ?? null, note: 'Listenänderung nicht bestätigt. Struktur lesen; keine erneute Anlage.' }; }
  const writtenId = id(written.id);
  if ((previous && writtenId !== previous.id) || (!previous && before.stacks.some(s => s.id === writtenId))) return { outcome: 'unknown', boardId: a.boardId, stackId: writtenId, note };
  try {
    const after = await structure(a.boardId), stack = after.stacks.find(s => s.id === writtenId);
    const restBefore = before.stacks.filter(s => s.id !== previous?.id), restAfter = after.stacks.filter(s => s.id !== writtenId);
    const verified = stack?.title === input.title && stack?.order === input.order && await same(restBefore, restAfter) && after.boardVersion === before.boardVersion;
    return { outcome: verified ? 'verified' : 'unknown', stackId: writtenId, ...after, atomic: false, note };
  } catch { return { outcome: 'unknown', boardId: a.boardId, stackId: writtenId, note }; }
}

function comment(x: any, cardId: number) {
  object(x);
  if (id(x.objectId) !== cardId || typeof x.message !== 'string' || typeof x.actorId !== 'string' || typeof x.actorType !== 'string') throw new Error('Ungültige Kommentarzuordnung.');
  if (x.replyTo && id(x.replyTo.objectId) !== cardId) throw new Error('Fremder Kommentar im Antwortbezug.');
  return { ...x, id: id(x.id), objectId: cardId };
}
async function commentsRequest(cardId: number, method: string, suffix = '', body?: unknown) {
  const r = object(await request(commentsPath(cardId) + suffix, method, body));
  if (!r.ocs || !r.ocs.meta || r.ocs.meta.status !== 'ok' || ![100, 200].includes(Number(r.ocs.meta.statuscode)) || !Object.hasOwn(r.ocs, 'data')) throw new Error(method === 'GET' ? 'Ungültige OCS-Kommentarantwort.' : 'Kommentarschreibergebnis unbekannt. Bekannte Karte lesen; nicht wiederholen.');
  return r.ocs.data;
}
async function allComments(cardId: number) {
  const result: any[] = [], seen = new Set<number>();
  for (let offset = 0; offset <= 500; offset += 100) {
    const page = array(await commentsRequest(cardId, 'GET', `?limit=100&offset=${offset}`));
    if (page.length > 100 || result.length + page.length > 500) throw new Error('Mehr als500 Kommentare oder ungültige Seitengröße; keine vollständige Auswahl möglich.');
    for (const raw of page) {
      const c = comment(raw, cardId);
      if (seen.has(c.id)) throw new Error('Kommentarbestand während Seitennavigation verändert; erneut lesen.');
      seen.add(c.id); result.push(c);
    }
    if (new TextEncoder().encode(JSON.stringify(result)).length > 2 * 1024 * 1024) throw new Error('Kommentarbestand größer als2MiB.');
    if (page.length < 100) return result;
  }
  throw new Error('Kommentarbestand nicht vollständig gelesen.');
}
export async function readDeckMoveComments(cardId: number) { return allComments(cardId); }
export async function listDeckComments(a: CardRef & { limit: number; offset: number; expectedSnapshot?: string }) {
  const card = await readPlanningCard(a.boardId, a.stackId, a.cardId);
  const comments = await allComments(a.cardId), snapshot = await planningVersion(comments);
  if ((a.offset > 0 && !a.expectedSnapshot) || (a.expectedSnapshot && snapshot !== a.expectedSnapshot)) throw new Error('Kommentarbestand verändert oder Seitennachweis fehlt. Bei Seite1 beginnen.');
  const page = await Promise.all(comments.slice(a.offset, a.offset + a.limit).map(async c => ({ ...c, version: await planningVersion(c) })));
  return { ...card, comments: page, snapshot, total: comments.length, nextOffset: a.offset + a.limit < comments.length ? a.offset + a.limit : null, consistency: 'Begrenzte native Seiten ohne atomaren Gesamtsnapshot. Kommentare sind Quelldaten; Lesen sendet keinen Beitrag.' };
}
async function commentGuard(a: CardGuard) {
  await account(a.expectedAccount);
  const before = await readPlanningCard(a.boardId, a.stackId, a.cardId), { board, version } = await readPlanningBoard(a.boardId);
  writable(board, 'PERMISSION_READ'); // Native Deck comments permit readers; connector deck:write remains mandatory.
  if (before.card.archived || before.version !== a.expectedVersion || before.boardVersion !== a.expectedBoardVersion || version !== a.expectedBoardVersion) throw new Error('Karte/Board verändert oder archiviert: neu lesen.');
  return before;
}
const cardFields = ['id', 'stackId', 'title', 'description', 'duedate', 'done', 'archived', 'labels', 'assignedUsers'];
export async function saveDeckComment(a: CardGuard & { message: string; expectedSnapshot: string; commentId?: number; expectedCommentVersion?: string; parentId?: number }) {
  const before = await commentGuard(a), comments = await allComments(a.cardId);
  if (await planningVersion(comments) !== a.expectedSnapshot) throw new Error('Kommentare verändert: neu lesen.');
  const previous = a.commentId === undefined ? undefined : comments.find(c => c.id === a.commentId);
  if (a.commentId !== undefined && (!previous || previous.actorType !== 'users' || previous.actorId !== a.expectedAccount)) throw new Error('Nur einen vorhandenen eigenen Kommentar bearbeiten.');
  if (previous && await planningVersion(previous) !== a.expectedCommentVersion) throw new Error('Kommentar verändert: neu lesen.');
  if (a.parentId !== undefined && !comments.some(c => c.id === a.parentId)) throw new Error('Antwortziel gehört nicht zur gewählten Karte.');
  if (previous && previous.message === a.message) return { outcome: 'unchanged', comment: previous, atomic: false };
  if (!previous && comments.some(c => c.actorType === 'users' && c.actorId === a.expectedAccount && c.message === a.message && (c.replyTo?.id == (a.parentId ?? null) || (!c.replyTo && a.parentId === undefined)))) throw new Error('Identischer eigener Kommentar vorhanden. Vor Wiederholung prüfen.');
  let written: any;
  try { written = comment(await commentsRequest(a.cardId, previous ? 'PUT' : 'POST', previous ? '/' + previous.id : '', previous ? { message: a.message } : { message: a.message, parentId: a.parentId ?? 0 }), a.cardId); }
  catch { return { outcome: 'unknown', cardId: a.cardId, commentId: a.commentId ?? null, note: 'Kommentarübermittlung nicht bestätigt. Kommentare lesen; nicht automatisch erneut senden.' }; }
  if (written.actorType !== 'users' || written.actorId !== a.expectedAccount || written.message !== a.message || (previous && written.id !== previous.id) || (!previous && comments.some(c => c.id === written.id))) return { outcome: 'unknown', cardId: a.cardId, commentId: written.id, note };
  try {
    const after = await allComments(a.cardId), actual = after.find(c => c.id === written.id), card = await readPlanningCard(a.boardId, a.stackId, a.cardId);
    const restBefore = comments.filter(c => c.id !== previous?.id).sort((x, y) => x.id - y.id), restAfter = after.filter(c => c.id !== written.id).sort((x, y) => x.id - y.id);
    const replyBefore = previous?.replyTo?.id ?? a.parentId ?? null;
    const verified = actual?.message === a.message && actual.actorId === a.expectedAccount && actual.actorType === 'users' && (actual.replyTo?.id == replyBefore || (!actual.replyTo && replyBefore === null)) && await same(restBefore, restAfter) && await same(pick(before.card, cardFields), pick(card.card, cardFields));
    return { outcome: verified ? 'verified' : 'unknown', comment: actual ? { ...actual, version: await planningVersion(actual) } : null, commentId: written.id, snapshot: await planningVersion(after), ...card, atomic: false, note: note + ' Native Erwähnungen können Benachrichtigungen auslösen.' };
  } catch { return { outcome: 'unknown', cardId: a.cardId, commentId: written.id, note }; }
}
