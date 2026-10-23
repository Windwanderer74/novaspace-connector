// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, fileMetadata, filePath, davFetch } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { oauthOrigin, signPayload, verifyPayload } from './oauth';
import { createHash } from 'node:crypto';
import { currentGatewayPrincipal, principalFromTransfer, requireTransferPermission } from './platform-registry';
import { ConnectionPolicyDenied } from './connection-policy';

export const MAX_UPLOAD_MIB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * 1024 * 1024;
// An honest explicit identity avoids the hosting-edge rejection of urllib's default.
export const UPLOAD_USER_AGENT = 'NOVAFORGE-FileTransfer/1.0';
const lifetime = 300;
type Account = Awaited<ReturnType<typeof nextcloudIdentity>>;
type UploadClaim = { type: 'upload'; exp: number; uid: string; path: string; parentId: string; size: number; sha256: string; mimeType: string; principal: unknown };
const note = 'Nur Neuanlage ohne Überschreiben. verified bestätigt versionsgebunden zurückgelesene Originalbytes, Größe und SHA-256. Bei unklarem Ergebnis denselben Pfad prüfen; nicht blind erneut hochladen oder einen Ersatznamen wählen.';

function checkedInput(path: string, size: number, sha256: string, mimeType: string) {
  checkedFilePath(path);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES || !/^[a-f0-9]{64}$/.test(sha256) || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mimeType)) throw new Error(`Gültige Größe bis ${MAX_UPLOAD_MIB} MiB, SHA-256 und MIME-Typ erforderlich.`);
  if (/\.pdf$/i.test(path) && mimeType !== 'application/pdf') throw new Error('PDF-Dateien benötigen application/pdf.');
}
async function destination(account: Account, path: string, parentId?: string) {
  const folder = path.slice(0, path.lastIndexOf('/')) || '/';
  const parent = await fileMetadata(account, folder);
  if (!parent || parent.type !== 'folder' || !parent.permissions.includes('C') || (parentId && parent.fileId !== parentId)) throw new Error('Zielordner oder Anlegerecht nicht bestätigt.');
  if (await fileMetadata(account, path)) throw new Error('Ziel existiert bereits. Nichts überschrieben; denselben Pfad prüfen.');
  return parent;
}
export async function prepareFileUpload(path: string, size: number, sha256: string, mimeType: string) {
  checkedInput(path, size, sha256, mimeType);
  const account = await nextcloudIdentity();
  const parent = await destination(account, path);
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  const token = await signPayload({ type: 'upload', exp, uid: account.uid, path, parentId: parent.fileId, size, sha256, mimeType, principal: currentGatewayPrincipal() });
  return { account: account.uid, path, size, sha256, mimeType, overwrite: false, uploadCompleted: false,
    transfer: { method: 'PUT', url: `${oauthOrigin()}/files-upload`, authorization: `Bearer ${token}`, contentType: mimeType,
      userAgent: UPLOAD_USER_AGENT,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'User-Agent': UPLOAD_USER_AGENT, Accept: 'application/json' } },
    expiresAt: new Date(exp * 1000).toISOString(), maxBytes: MAX_UPLOAD_BYTES,
    note: 'Vorbereitung ist noch kein Upload. Originaldatei binär per PUT mit allen transfer.headers übertragen, insbesondere Authorization, Content-Type und dem ausdrücklich benannten User-Agent. Bei Python urllib den User-Agent explizit setzen; die Standardkennung kann vor der Anwendung HTTP 403 / error code 1010 auslösen. Keine Browserkennung vortäuschen. Antwort mit verified, Datei-ID, Größe und SHA-256 prüfen; anschließend separat files_stat und Originaldownload gegenprüfen. Bei 403/1010 Zeit und CF-Ray sichern und denselben Zielpfad prüfen; keine automatische Wiederholung. Die Freigabe erlaubt fünf Minuten nur diese Neuanlage mit diesen Bytes; kein Nextcloud-Passwort enthalten.' };
}
async function exactBytes(body: ReadableStream<Uint8Array> | null, size: number) {
  if (!body) throw new Error('Dateiinhalt fehlt.');
  const reader = body.getReader(); const bytes = new Uint8Array(size); let offset = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (offset + chunk.value.byteLength > size) throw new Error('Datei überschreitet die vorbereitete Größe.');
      bytes.set(chunk.value, offset); offset += chunk.value.byteLength;
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  if (offset !== size) throw new Error('Datei ist unvollständig.');
  return bytes;
}
// nodejs_compat supplies incremental hashing without another full-size digest buffer.
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function exactHash(body: ReadableStream<Uint8Array> | null, size: number) {
  if (!body) throw new Error('Dateiinhalt fehlt.');
  const reader = body.getReader(); const digest = createHash('sha256'); let received = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > size) throw new Error('Rücklesegröße überschritten.');
      digest.update(chunk.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  if (received !== size) throw new Error('Rücklesen unvollständig.');
  return digest.digest('hex');
}
async function verifyUploaded(account: Account, claim: UploadClaim) {
  const before = await fileMetadata(account, claim.path);
  if (!before || before.type !== 'file' || before.size !== claim.size || !before.permissions.includes('G') || before.downloadDenied) throw new Error('Hochgeladene Datei oder Rückleserecht nicht bestätigt.');
  checkedEtag(before.etag);
  const response = await davFetch(filePath(account.filesHome, claim.path), { method: 'GET', headers: { 'If-Match': before.etag, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } }, 60000);
  const contentEtag = response.headers.get('etag');
  if (response.status !== 200 || !contentEtag || (!contentEtag.startsWith('W/') && contentEtag !== before.etag) || !['', 'identity'].includes(response.headers.get('content-encoding') ?? '')) { await response.body?.cancel(); throw new Error('Bedingtes Rücklesen nicht bestätigt.'); }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== claim.size)) { await response.body?.cancel(); throw new Error('Rücklesegröße stimmt nicht.'); }
  const sha256 = await exactHash(response.body, claim.size);
  const after = await fileMetadata(account, claim.path);
  if (!after || after.type !== 'file' || after.fileId !== before.fileId || after.etag !== before.etag || after.size !== claim.size || !after.permissions.includes('G') || after.downloadDenied || sha256 !== claim.sha256) throw new Error('Identität, Version oder SHA-256 nach Upload nicht bestätigt.');
  return { ...after, sha256, versionVerified: true };
}
export async function serveFileUpload(request: Request): Promise<Response> {
  const json = (data: object, status: number) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
  const fail = (status: number, message: string) => json({ uploadCompleted: false, verified: false, error: message }, status);
  if (request.method !== 'PUT') return fail(405, 'Nur PUT für vorbereitete Uploads.');
  if (new URL(request.url).search) return fail(400, 'Uploadfreigabe nur im Authorization-Header.');
  let claim: UploadClaim;
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) || authorization.length > 8192) return fail(401, 'Uploadfreigabe fehlt.');
    claim = await verifyPayload<UploadClaim>(authorization.slice(7), 'upload');
    checkedInput(claim.path, claim.size, claim.sha256, claim.mimeType);
    if (!/^\d+$/.test(claim.parentId) || claim.exp > Math.floor(Date.now() / 1000) + lifetime) return fail(401, 'Uploadfreigabe ungültig.');
    const principal = await principalFromTransfer(claim.principal);
    await requireTransferPermission(principal, 'files:read');
    await requireTransferPermission(principal, 'files:write');
  } catch (error) { return error instanceof ConnectionPolicyDenied ? error.response() : fail(401, 'Uploadfreigabe ungültig oder abgelaufen.'); }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const length = request.headers.get('content-length');
    if ((length !== null && (!/^\d+$/.test(length) || Number(length) !== claim.size)) || request.headers.get('content-type') !== claim.mimeType || !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')) return fail(400, 'Größe oder Inhaltstyp weicht von der Vorbereitung ab.');
    bytes = await exactBytes(request.body, claim.size);
    if (hash(bytes) !== claim.sha256) return fail(400, 'SHA-256 der empfangenen Bytes stimmt nicht.');
    if (/\.pdf$/i.test(claim.path) && String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return fail(400, 'PDF-Kennung fehlt.');
  } catch { return fail(400, 'Dateiinhalt oder Größe nicht bestätigt.'); }
  let account: Account;
  try {
    account = await nextcloudIdentity();
    if (account.uid !== claim.uid) return fail(403, 'Uploadkonto stimmt nicht.');
    await destination(account, claim.path, claim.parentId);
  } catch { return fail(409, 'Zielordner, Recht oder freier Zielpfad nicht bestätigt. Nichts überschrieben.'); }
  let writeAccepted: boolean | null = null; let writeStatus: number | null = null;
  try { const principal = await principalFromTransfer(claim.principal); await requireTransferPermission(principal, 'files:read'); await requireTransferPermission(principal, 'files:write'); }
  catch (error) { return error instanceof ConnectionPolicyDenied ? error.response() : fail(403, 'Verbindung nicht mehr freigegeben.'); }
  try {
    const response = await davFetch(filePath(account.filesHome, claim.path), { method: 'PUT', headers: { 'If-None-Match': '*', 'Content-Type': claim.mimeType }, body: bytes }, 60000);
    writeStatus = response.status; await response.body?.cancel();
    if (writeStatus === 201) writeAccepted = true;
    else if ([409, 412, 405, 423].includes(writeStatus)) return fail(409, `Uploadkonflikt: HTTP ${writeStatus}. Denselben Pfad prüfen; nichts überschreiben.`);
    else if (writeStatus < 500 && ![200, 204].includes(writeStatus)) return fail(502, `Upload abgelehnt: HTTP ${writeStatus}.`);
  } catch { /* Unclear transport: inspect the exact destination, never retry PUT. */ }
  try {
    const result = await verifyUploaded(account, claim);
    return json({ account: account.uid, path: claim.path, ...result, writeAccepted, writeStatus, verified: true, uploadCompleted: true, overwrite: false, note }, 200);
  } catch {
    return json({ account: account.uid, path: claim.path, expectedSize: claim.size, expectedSha256: claim.sha256, writeAccepted, writeStatus, verified: false, uploadCompleted: false, warning: 'Schreibversuch erfolgt, Rückprüfung nicht bestätigt. Denselben Pfad prüfen; nicht automatisch wiederholen.', note }, 202);
  }
}
