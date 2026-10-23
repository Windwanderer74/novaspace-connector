// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, fileMetadata, filePath, davFetch } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { oauthOrigin, signPayload, verifyPayload } from './oauth';
import { currentGatewayPrincipal, principalFromTransfer, requireTransferPermission } from './platform-registry';
import { ConnectionPolicyDenied } from './connection-policy';

type DownloadPayload = { type: 'download'; exp: number; uid: string; path: string; fileId: string; etag: string; principal: unknown };
const lifetime = 300;

export async function createFileDownload(path: string, fileId: string, etag: string) {
  checkedFilePath(path); checkedEtag(etag);
  if (!/^\d+$/.test(fileId)) throw new Error('Frische Datei-ID erforderlich.');
  const account = await nextcloudIdentity();
  const file = await fileMetadata(account, path);
  if (!file || file.type !== 'file' || file.fileId !== fileId || file.etag !== etag || !file.permissions.includes('G') || file.downloadDenied) throw new Error('Datei, Version oder Downloadrecht nicht bestätigt.');
  const exp = Math.floor(Date.now() / 1000) + lifetime;
  const token = await signPayload({ type: 'download', exp, uid: account.uid, path, fileId, etag, principal: currentGatewayPrincipal() });
  const url = `${oauthOrigin()}/files-download?token=${encodeURIComponent(token)}`;
  return { account: account.uid, path, fileId, etag, name: path.split('/').pop()!, mimeType: file.mimeType ?? 'application/octet-stream', size: file.size, downloadUrl: url, workspaceDownload:{url:`${oauthOrigin()}/files-download`,authorization:`Bearer ${token}`}, expiresAt: new Date(exp * 1000).toISOString(), note: 'Downloadfreigabe gilt fünf Minuten für genau diese Datei und Version. Wer Link oder befristeten Header besitzt, kann die Datei in dieser Zeit herunterladen. Kein Nextcloud-Passwort enthalten. Die Erzeugung bestätigt noch keinen abgeschlossenen Download.' };
}

export async function serveFileDownload(request: Request): Promise<Response> {
  const fail = (status: number) => new Response('Download nicht verfügbar oder abgelaufen.', { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  if (request.method !== 'GET') return fail(405);
  try {
    const queryToken = new URL(request.url).searchParams.get('token');
    const authorization = request.headers.get('authorization');
    if(queryToken && authorization)return fail(400);
    if(authorization && !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return fail(401);
    const token = queryToken ?? authorization?.slice(7);
    if (!token || token.length > 8192) return fail(401);
    const claim = await verifyPayload<DownloadPayload>(token, 'download');
    checkedFilePath(claim.path); checkedEtag(claim.etag);
    if (!/^\d+$/.test(claim.fileId) || claim.exp > Math.floor(Date.now() / 1000) + lifetime) return fail(401);
    await requireTransferPermission(await principalFromTransfer(claim.principal), 'files:download');
    const account = await nextcloudIdentity();
    if (account.uid !== claim.uid) return fail(403);
    const file = await fileMetadata(account, claim.path);
    if (!file || file.type !== 'file' || file.fileId !== claim.fileId || file.etag !== claim.etag || !file.permissions.includes('G') || file.downloadDenied) return fail(409);
    const response = await davFetch(filePath(account.filesHome, claim.path), { method: 'GET', headers: { 'If-Match': claim.etag, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } }, 180000);
    const etag = response.headers.get('etag');
    if (response.status !== 200 || !etag || (!etag.startsWith('W/') && etag !== claim.etag) || !['identity',''].includes(response.headers.get('content-encoding') ?? '')) { await response.body?.cancel(); return fail(response.status === 412 ? 409 : 502); }
    const name = claim.path.split('/').pop()!;
    const encoded = encodeURIComponent(name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    const headers = new Headers({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encoded}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
    const length = response.headers.get('content-length');
    if (length && /^\d+$/.test(length)) headers.set('Content-Length', length);
    return new Response(response.body, { status: 200, headers });
  } catch (error) { return error instanceof ConnectionPolicyDenied ? error.response() : fail(403); }
}
