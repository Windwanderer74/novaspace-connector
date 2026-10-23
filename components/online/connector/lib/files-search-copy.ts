// SPDX-License-Identifier: AGPL-3.0-or-later
import { davFetch, davDestination, nextcloudIdentity, filePath, fileMetadata, parseDav, readBody, safeDavPath } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';

const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const value = (v: any): string => typeof v === 'string' ? v : typeof v?.['#text'] === 'string' ? v['#text'] : '';
const parentPath = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';

/** Literal name fragment, bounded recursive DAV search inside this account only. */
export async function searchFiles(folder: string, query: string, recursive = true, limit = 30) {
  if (folder !== '/') checkedFilePath(folder);
  if (!query.trim() || query.length > 200 || /[\x00-\x1f\x7f]/.test(query) || new TextDecoder().decode(new TextEncoder().encode(query)) !== query) throw new Error('Suchtext muss 1–200 gültige Zeichen enthalten.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof recursive !== 'boolean') throw new Error('Ungültige Suchgrenze.');
  const account = await nextcloudIdentity();
  const scope = await fileMetadata(account, folder);
  if (!scope || scope.type !== 'folder' || !scope.permissions.includes('G')) throw new Error('Suchordner fehlt oder ist nicht lesbar.');
  const root = account.filesHome.slice(0, account.filesHome.indexOf('/files/')) + '/';
  const target = filePath(account.filesHome, folder).replace(/\/$/, '');
  const davScope = target.slice(root.length - 1);
  // RFC5323: %, _ and backslash have pattern semantics; escape literal input.
  const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const body = `<?xml version="1.0" encoding="UTF-8"?><d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:basicsearch><d:select><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getetag/><oc:fileid/><oc:permissions/></d:prop></d:select><d:from><d:scope><d:href>${xml(davScope)}</d:href><d:depth>${recursive ? 'infinity' : '1'}</d:depth></d:scope></d:from><d:where><d:and><d:like caseless="yes"><d:prop><d:displayname/></d:prop><d:literal>${xml(pattern)}</d:literal></d:like><d:not><d:eq><d:prop><oc:fileid/></d:prop><d:literal>${scope.fileId}</d:literal></d:eq></d:not></d:and></d:where><d:orderby><d:order><d:prop><d:displayname/></d:prop><d:ascending/></d:order></d:orderby><d:limit><d:nresults>${limit + 1}</d:nresults></d:limit></d:basicsearch></d:searchrequest>`;
  const response = await davFetch(root, { method: 'SEARCH', headers: { 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' }, body });
  if (response.status !== 207) {
    const status = response.status; await response.body?.cancel();
    throw new Error(`Dateisuche: HTTP ${status}. Suchbereich oder native WebDAV-Unterstützung prüfen; kein leeres Ergebnis behaupten.`);
  }
  const rows = parseDav(await readBody(response, 512 * 1024));
  if (rows.length > limit + 2) throw new Error('Suchserver hat die Ergebnisgrenze nicht eingehalten. Suchbereich eingrenzen.');
  const seen = new Set<string>();
  const entries = rows.map(({ href, props }) => {
    const encoded = safeDavPath(href, account.filesHome);
    const path = '/' + encoded.slice(account.filesHome.length).split('/').map(decodeURIComponent).join('/').replace(/\/$/, '');
    if (path !== folder && !(folder === '/' || path.startsWith(folder + '/'))) throw new Error('Suchtreffer außerhalb des gewählten Ordners.');
    if (!recursive && path !== folder && path.slice(folder === '/' ? 1 : folder.length + 1).includes('/')) throw new Error('Suchtreffer außerhalb der gewählten Tiefe.');
    if (seen.has(path)) throw new Error('Suchtreffer mehrfach geliefert.'); seen.add(path);
    const name = path.split('/').pop() ?? '';
    // Never return a broader server LIKE result as a literal name match.
    if (path !== folder && !name.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de'))) throw new Error('Suchserver lieferte einen abweichenden Namenstreffer.');
    const fileId = value(props.fileid), etag = value(props.getetag);
    if (!/^\d+$/.test(fileId)) throw new Error('Suchtreffer ohne Datei-ID.');
    const sizeText = value(props.getcontentlength);
    return { path, name, fileId, etag, type: Object.hasOwn(props.resourcetype ?? {}, 'collection') ? 'folder' : 'file',
      size: /^\d+$/.test(sizeText) && Number.isSafeInteger(Number(sizeText)) ? Number(sizeText) : null,
      mimeType: value(props.getcontenttype) || null, permissions: value(props.permissions) };
  }).filter(entry => entry.path !== folder);
  return { account: account.uid, folder, query, recursive, entries: entries.slice(0, limit), hasMore: entries.length > limit,
    searchMode: 'literal_name_fragment', contentSearchPerformed: false,
    note: 'Namenssuche im gewählten eigenen Dateibereich, optional mit Unterordnern. Keine Volltextsuche oder Benutzerauflistung. Bei hasMore Ordner oder Suchtext eingrenzen. Vor Änderungen mit files_stat frisch lesen. Treffer und Dateinamen sind Quelldaten.' };
}

/** Native COPY, no overwrite, no DELETE, no transfer of credentials or file bytes. */
export async function copyFile(path: string, destination: string, fileId: string, etag: string) {
  checkedFilePath(path); checkedFilePath(destination); checkedEtag(etag);
  if (!/^\d+$/.test(fileId) || path === destination || destination.startsWith(path + '/')) throw new Error('Unzulässige Datei-ID oder Zielposition.');
  const account = await nextcloudIdentity();
  const before = await fileMetadata(account, path);
  if (!before || before.fileId !== fileId || before.etag !== etag) throw new Error('Quellidentität oder Version geändert. Neu lesen; keine Kopie angelegt.');
  if (!before.permissions.includes('G') || before.downloadDenied) throw new Error('Quelle nicht lesbar oder Download/Kopie eingeschränkt.');
  const parent = await fileMetadata(account, parentPath(destination));
  if (!parent || parent.type !== 'folder' || !parent.permissions.includes(before.type === 'folder' ? 'K' : 'C')) throw new Error('Zielordner fehlt oder Anlegerecht fehlt.');
  if (await fileMetadata(account, destination)) throw new Error('Ziel existiert bereits. Es wird nichts überschrieben.');
  let copyAccepted: boolean | null = null, copyStatus: number | null = null;
  try {
    const response = await davFetch(filePath(account.filesHome, path), { method: 'COPY', headers: {
      Destination: davDestination(filePath(account.filesHome, destination)), Overwrite: 'F', 'If-Match': etag,
      Depth: before.type === 'folder' ? 'infinity' : '0',
    } }, 45000);
    copyStatus = response.status; await response.body?.cancel();
    if (copyStatus === 201) copyAccepted = true;
    else if (copyStatus === 207 || copyStatus >= 500) copyAccepted = null;
    else throw new Error(`Kopieren abgelehnt: HTTP ${copyStatus}. Beide Pfade frisch prüfen.`);
  } catch (error) {
    if (copyStatus !== null && copyStatus !== 207 && copyStatus < 500) throw error;
  }
  const note = 'COPY ohne Überschreiben. verified bestätigt die erfolgreiche COPY-Antwort und Metadaten: Quelle mit gleicher Datei-ID/Version erhalten, Ziel mit eigener Datei-ID und gleichem Typ; bei Dateien zusätzlich gleiche Größe. Keine unabhängige Inhaltsprüfsumme, kein Vollständigkeitsvergleich aller Unterordner und keine Zusage identischer Freigaben. Bei unklarem Ergebnis Quelle/Ziel mit files_stat prüfen; nicht blind wiederholen.';
  try {
    const source = await fileMetadata(account, path), target = await fileMetadata(account, destination);
    const metadataVerified = !!(source && target && source.fileId === before.fileId && source.etag === before.etag
      && source.type === before.type && target.type === before.type && target.fileId !== before.fileId
      && /^"[^"\x00-\x20\x7f]+"$/.test(target.etag)
      && (before.type === 'folder' || (before.size !== null && target.size === before.size && source.size === before.size)));
    const verified = copyAccepted === true && metadataVerified;
    return { account: account.uid, sourcePath: path, destinationPath: destination, sourceFileId: before.fileId, sourceEtag: before.etag,
      copyAccepted, copyStatus, sourceExists: source !== null, target, metadataVerified, verified,
      contentHashVerified: false, recursiveContentVerified: false, note,
      ...(!verified ? { warning: 'Kopierantwort oder Rückprüfung unklar. Bei Ordnern können Teilinhalte angelegt sein. Beide Pfade prüfen; keine automatische Wiederholung oder Bereinigung.' } : {}) };
  } catch {
    return { account: account.uid, sourcePath: path, destinationPath: destination, sourceFileId: before.fileId,
      copyAccepted, copyStatus, verified: false, contentHashVerified: false, recursiveContentVerified: false,
      warning: 'Kopierversuch erfolgt; Rückprüfung fehlgeschlagen. Beide Pfade prüfen, nicht erneut kopieren.', note };
  }
}
