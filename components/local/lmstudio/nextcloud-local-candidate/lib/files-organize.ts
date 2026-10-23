// SPDX-License-Identifier: AGPL-3.0-or-later
import { davFetch, davDestination, nextcloudIdentity, filePath, fileMetadata } from './nextcloud-read';

export function checkedFilePath(path: string) {
  if (!path.startsWith('/') || path === '/' || path.endsWith('/') || path.includes('//') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(p => p === '.' || p === '..')) throw new Error('Eindeutiger absoluter Dateipfad erforderlich.');
  return path;
}
export function checkedEtag(etag: string) {
  if (!/^"[^"\x00-\x20\x7f]+"$/.test(etag)) throw new Error('Aktueller starker ETag erforderlich.');
  return etag;
}
const parentPath = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
const note = 'MOVE ohne Überschreiben und ohne DELETE-Aufruf. verified bestätigt Quellpfad, Zielpfad, Datei-ID und Objekttyp; keine neu berechnete Inhaltsprüfsumme. Bei unklarem Ergebnis beide Pfade mit files_stat prüfen; nicht blind wiederholen.';

export async function statFile(path: string) {
  if (path !== '/') checkedFilePath(path);
  const account = await nextcloudIdentity();
  const file = await fileMetadata(account, path);
  return { account: account.uid, path, exists: file !== null, ...file };
}

export async function moveFile(path: string, destination: string, fileId: string, etag: string) {
  checkedFilePath(path); checkedFilePath(destination); checkedEtag(etag);
  if (!/^\d+$/.test(fileId) || path === destination || destination.startsWith(path + '/')) throw new Error('Unzulässige Datei-ID oder Zielposition.');
  const account = await nextcloudIdentity();
  const before = await fileMetadata(account, path);
  if (!before || before.fileId !== fileId || before.etag !== etag) throw new Error('Quellidentität oder Version geändert. Neu lesen; kein Verschiebeversuch.');
  const permission = parentPath(path) === parentPath(destination) ? 'N' : 'V';
  if (!before.permissions.includes(permission)) throw new Error('Umbenennungs-/Verschieberecht an der Quelle fehlt.');
  const parent = await fileMetadata(account, parentPath(destination));
  if (!parent || parent.type !== 'folder' || !parent.permissions.includes(before.type === 'folder' ? 'K' : 'C')) throw new Error('Zielordner fehlt oder Anlegerecht fehlt.');
  if (await fileMetadata(account, destination)) throw new Error('Ziel existiert bereits. Es wird nichts überschrieben.');
  let moveAccepted: boolean | null = null;
  let moveStatus: number | null = null;
  try {
    const response = await davFetch(filePath(account.filesHome, path), { method: 'MOVE', headers: { Destination: davDestination(filePath(account.filesHome, destination)), Overwrite: 'F', 'If-Match': etag } });
    moveStatus = response.status;
    await response.body?.cancel();
    if (moveStatus === 201) moveAccepted = true;
    else if (moveStatus >= 500) moveAccepted = null;
    else throw new Error(`Verschieben abgelehnt: HTTP ${moveStatus}. Beide Pfade neu prüfen.`);
  } catch (error) {
    if (moveStatus !== null && moveStatus < 500) throw error;
  }
  try {
    const source = await fileMetadata(account, path);
    const target = await fileMetadata(account, destination);
    const verified = source === null && target?.fileId === before.fileId && target?.type === before.type;
    return { account: account.uid, sourcePath: path, destinationPath: destination, sourceFileId: before.fileId, sourceEtag: before.etag, moveAccepted, moveStatus, sourceExists: source !== null, target, verified, note, ...(!verified || moveAccepted === null ? { warning: 'Schreibantwort oder Rückprüfung unklar. Beide Pfade prüfen; nicht erneut verschieben.' } : {}) };
  } catch {
    return { account: account.uid, sourcePath: path, destinationPath: destination, sourceFileId: before.fileId, moveAccepted, moveStatus, verified: false, warning: 'Verschiebeversuch erfolgt; Rückprüfung fehlgeschlagen. Beide Pfade prüfen.', note };
  }
}

export async function renameFile(path: string, newName: string, fileId: string, etag: string) {
  checkedFilePath(path);
  if (!newName || newName === '.' || newName === '..' || /[\/\\\x00-\x1f\x7f]/.test(newName) || new TextEncoder().encode(newName).length > 255) throw new Error('Ein einzelner gültiger neuer Dateiname ist erforderlich.');
  return moveFile(path, (parentPath(path) === '/' ? '' : parentPath(path)) + '/' + newName, fileId, etag);
}
