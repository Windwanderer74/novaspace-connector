// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity } from './nextcloud-read';
import { readPlanningBoard } from './deck-planning';
import { planningJson, planningVersion } from './planning-json';

type Flags = { permissionEdit: boolean; permissionShare: boolean; permissionManage: boolean };
type Guard = { boardId: number; expectedAccount: string; expectedBoardVersion: string; expectedSharesVersion: string };
type Recipient = { recipientType: 'user' | 'group'; recipientId: string };
const note = 'Deck-Freigaben haben keine atomare Versionsbedingung. Bei unknown dieselbe Board-/Freigabekennung lesen, nicht automatisch wiederholen. Native Benachrichtigungen sind möglich.';
const flagNames = ['permissionEdit', 'permissionShare', 'permissionManage'] as const;
const nativeFlags = { permissionEdit: 'PERMISSION_EDIT', permissionShare: 'PERMISSION_SHARE', permissionManage: 'PERMISSION_MANAGE' } as const;

function identity(x: any): string | null {
  if (typeof x === 'string') return x;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (typeof x.uid === 'string' && typeof x.primaryKey === 'string' && x.uid !== x.primaryKey) throw new Error('Widersprüchliche Deck-Identität.');
  return typeof x.uid === 'string' ? x.uid : typeof x.primaryKey === 'string' ? x.primaryKey : null;
}
function nativeId(x: unknown): number {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 1) throw new Error('Ungültige native Deck-Kennung.');
  return x;
}
function acl(x: any, boardId: number) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || x.boardId !== boardId || !Number.isInteger(x.type)) throw new Error('Ungültige Board-/Freigabezuordnung.');
  for (const key of flagNames) if (typeof x[key] !== 'boolean') throw new Error('Unvollständige Freigaberechte.');
  const recipientId = identity(x.participant);
  return { id: nativeId(x.id), boardId, type: x.type as number, recipientType: x.type === 0 ? 'user' : x.type === 1 ? 'group' : 'unsupported', recipientId,
    permissionEdit: x.permissionEdit as boolean, permissionShare: x.permissionShare as boolean, permissionManage: x.permissionManage as boolean,
    supported: (x.type === 0 || x.type === 1) && recipientId !== null && recipientId.length > 0 };
}
async function snapshot(boardId: number) {
  const { board, version: boardVersion } = await readPlanningBoard(nativeId(boardId));
  if (board.permissions?.PERMISSION_READ !== true || !Array.isArray(board.acl) || board.acl.length > 100) throw new Error('Boardfreigaben nicht vollständig lesbar oder mehr als100Einträge.');
  const shares = board.acl.map((a: any) => acl(a, boardId)).sort((a: any, b: any) => a.id - b.id);
  if (new Set(shares.map((a: any) => a.id)).size !== shares.length) throw new Error('Doppelte Freigabekennung.');
  const owner = identity(board.owner);
  const sharesVersion = await planningVersion({ boardId, owner, shares });
  return { board, boardVersion, sharesVersion, owner, shares };
}
function response(s: Awaited<ReturnType<typeof snapshot>>) {
  return { boardId: s.board.id, title: s.board.title, owner: s.owner, archived: Boolean(s.board.archived), boardVersion: s.boardVersion,
    sharesVersion: s.sharesVersion, shares: s.shares, nativePermissions: s.board.permissions, atomic: false,
    personalShareRevokeRemovesAssignments: true, otherAccessMayRemain: true, note };
}
export async function readDeckBoardShares(boardId: number) { return response(await snapshot(boardId)); }
async function guarded(a: Guard, permission: 'PERMISSION_SHARE' | 'PERMISSION_MANAGE') {
  if ((await nextcloudIdentity()).uid !== a.expectedAccount) throw new Error('Kontowechsel: Freigabeänderung gestoppt.');
  const s = await snapshot(a.boardId);
  if (s.boardVersion !== a.expectedBoardVersion || s.sharesVersion !== a.expectedSharesVersion) throw new Error('Board oder Freigaben verändert: neu lesen.');
  if (s.board.archived || s.board.deletedAt || s.board.externalId || !s.owner || s.board.permissions?.[permission] !== true) throw new Error('Board archiviert, extern oder native Freigabeberechtigung fehlt.');
  return s;
}
function recipient(a: Recipient) {
  if (!['user', 'group'].includes(a.recipientType) || typeof a.recipientId !== 'string' || !a.recipientId.trim() || a.recipientId !== a.recipientId.trim()
    || a.recipientId.length > 255 || /[\x00-\x1f\x7f]/.test(a.recipientId)) throw new Error('Exakte lokale Nutzer-/Gruppenkennung erforderlich.');
}
function flags(a: Flags) { for (const key of flagNames) if (typeof a[key] !== 'boolean') throw new Error('Freigaberechte müssen ausdrücklich boolesch sein.'); }
function grantable(s: Awaited<ReturnType<typeof snapshot>>, desired: Flags, previous?: Flags) {
  flags(desired);
  for (const key of flagNames) if (desired[key] && desired[key] !== previous?.[key] && s.board.permissions?.[nativeFlags[key]] !== true) throw new Error('Gewünschtes Recht darf nativ nicht weitergegeben werden.');
}
function target(s: Awaited<ReturnType<typeof snapshot>>, shareId: number, a: Guard & Recipient) {
  recipient(a);
  const item = s.shares.find((x: any) => x.id === nativeId(shareId));
  if (!item?.supported || item.recipientType !== a.recipientType || item.recipientId !== a.recipientId) throw new Error('Freigabe gehört nicht zum ausgewählten Board/Empfänger oder ist nicht unterstützt.');
  if (item.type === 0 && [s.owner, a.expectedAccount].includes(item.recipientId)) throw new Error('Eigentümer und direkte eigene Zugangsfreigabe werden nicht verändert.');
  return item;
}
const stable = (s: Awaited<ReturnType<typeof snapshot>>) => Object.fromEntries(['id', 'title', 'color', 'archived', 'deletedAt', 'owner', 'labels'].map(k => [k, s.board[k] ?? null]));
const same = async (a: unknown, b: unknown) => await planningVersion(a) === await planningVersion(b);
function unknown(boardId: number, shareId?: number) { return { outcome: 'unknown', boardId, shareId: shareId ?? null, atomic: false, note }; }
const path = (boardId: number, shareId?: number) => `/index.php/apps/deck/api/v1.0/boards/${nativeId(boardId)}/acl${shareId === undefined ? '' : '/' + nativeId(shareId)}`;

export async function createDeckBoardShare(a: Guard & Recipient & Flags & { acknowledgeBoardAccess: true }) {
  recipient(a); flags(a);
  if (a.acknowledgeBoardAccess !== true) throw new Error('Zugriff auf Board und Karten muss ausdrücklich beauftragt sein.');
  const before = await guarded(a, 'PERMISSION_SHARE');
  if (a.recipientType === 'user' && [before.owner, a.expectedAccount].includes(a.recipientId)) throw new Error('Eigentümer oder eigenes Konto nicht als neue Freigabe anlegen.');
  if (before.shares.some((x: any) => x.recipientType === a.recipientType && x.recipientId === a.recipientId)) throw new Error('Direkte Empfängerfreigabe bereits vorhanden: bekannte Kennung verwenden.');
  grantable(before, a);
  const type = a.recipientType === 'user' ? 0 : 1;
  let written: any;
  try { written = (await planningJson(path(a.boardId), 'POST', { type, participant: a.recipientId, ...Object.fromEntries(flagNames.map(k => [k, a[k]])) })).data; }
  catch { return unknown(a.boardId); }
  try {
    const created = acl(written, a.boardId), after = await snapshot(a.boardId);
    const item = after.shares.find((x: any) => x.id === created.id);
    const matches = item?.type === type && item?.recipientId === a.recipientId && flagNames.every(k => item[k] === a[k]);
    const verified = matches && !before.shares.some((x: any) => x.id === created.id) && after.shares.length === before.shares.length + 1
      && await same(before.shares, after.shares.filter((x: any) => x.id !== created.id)) && await same(stable(before), stable(after));
    return { outcome: verified ? 'verified' : 'unknown', shareId: created.id, ...response(after), notificationMayBeSent: true };
  } catch { return unknown(a.boardId); }
}
export async function updateDeckBoardShare(a: Guard & Recipient & { shareId: number; permissionEdit?: boolean; permissionShare?: boolean; permissionManage?: boolean }) {
  const before = await guarded(a, 'PERMISSION_SHARE'), old = target(before, a.shareId, a);
  const patch = Object.fromEntries(flagNames.filter(k => a[k] !== undefined).map(k => [k, a[k]]));
  if (!Object.keys(patch).length) throw new Error('Keine Freigabeänderung angegeben.');
  const desired: Flags = { ...old, ...patch }; grantable(before, desired, old);
  if (flagNames.every(k => old[k] === desired[k])) return { outcome: 'unchanged', shareId: old.id, ...response(before) };
  try { await planningJson(path(a.boardId, old.id), 'PUT', Object.fromEntries(flagNames.map(k => [k, desired[k]]))); }
  catch { return unknown(a.boardId, old.id); }
  try {
    const after = await snapshot(a.boardId), item = after.shares.find((x: any) => x.id === old.id);
    const expected = { ...old, ...Object.fromEntries(flagNames.map(k => [k, desired[k]])) };
    const verified = await same(item, expected) && await same(before.shares.filter((x: any) => x.id !== old.id), after.shares.filter((x: any) => x.id !== old.id))
      && await same(stable(before), stable(after));
    return { outcome: verified ? 'verified' : 'unknown', shareId: old.id, ...response(after) };
  } catch { return unknown(a.boardId, old.id); }
}
export async function revokeDeckBoardShare(a: Guard & Recipient & { shareId: number; acknowledgeAssignmentRemoval: true }) {
  if (a.acknowledgeAssignmentRemoval !== true) throw new Error('Native Entfernung persönlicher Kartenzuständigkeiten ausdrücklich bestätigen.');
  const before = await guarded(a, 'PERMISSION_MANAGE'), old = target(before, a.shareId, a);
  try { await planningJson(path(a.boardId, old.id), 'DELETE'); }
  catch { return unknown(a.boardId, old.id); }
  try {
    const after = await snapshot(a.boardId);
    const verified = !after.shares.some((x: any) => x.id === old.id) && await same(before.shares.filter((x: any) => x.id !== old.id), after.shares)
      && await same(stable(before), stable(after));
    return { outcome: verified ? 'verified' : 'unknown', shareId: old.id, ...response(after), nativeAssignmentRemoval: old.type === 0,
      assignmentRemovalIndependentlyVerified: false, effectiveAccessRemoved: null,
      consequence: old.type === 0 ? 'Deck entfernt zusätzlich die Kartenzuständigkeiten dieser Person im Board. Andere Zugriffswege können bestehen bleiben.' : 'Gruppenmitglieder können über weitere Freigaben weiterhin zugreifen.' };
  } catch { return unknown(a.boardId, old.id); }
}
