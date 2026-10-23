// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, fileMetadata, filePath, davFetch } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
const MAX_IMAGE = 10 * 1024 * 1024;
function imageType(bytes: Uint8Array) {
  const starts = (xs: number[]) => xs.every((b, i) => bytes[i] === b);
  if (starts([137,80,78,71,13,10,26,10])) return 'image/png';
  if (starts([255,216,255])) return 'image/jpeg';
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a,b));
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  throw new Error('Kein unterstütztes PNG-, JPEG-, GIF- oder WebP-Bild. PDF-Seiten und TIFF benötigen einen Renderer.');
}
export async function readImage(path: string, fileId: string, etag: string) {
  checkedFilePath(path); checkedEtag(etag);
  if (!/^\d+$/.test(fileId)) throw new Error('Frische Datei-ID erforderlich.');
  const account = await nextcloudIdentity(); const before = await fileMetadata(account, path);
  if (!before || before.type !== 'file' || before.fileId !== fileId || before.etag !== etag || !before.permissions.includes('G') || before.downloadDenied) throw new Error('Bildidentität, Version oder Downloadrecht nicht bestätigt.');
  if (!['image/png','image/jpeg','image/gif','image/webp'].includes(before.mimeType ?? '') || before.size === null || before.size > MAX_IMAGE) throw new Error('Bildtyp oder Größe nicht unterstützt; Grenze 10 MiB.');
  const response = await davFetch(filePath(account.filesHome, path), { method: 'GET', headers: { 'If-Match': etag, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } });
  const contentEtag = response.headers.get('etag');
  if (response.status !== 200 || !contentEtag || (!contentEtag.startsWith('W/') && contentEtag !== etag)) { await response.body?.cancel(); throw new Error('Bedingter Bildabruf nicht bestätigt.'); }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== before.mimeType || Number(response.headers.get('content-length')) > MAX_IMAGE) { await response.body?.cancel(); throw new Error('Unerwarteter Bildtyp oder zu große Bildantwort.'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Bildantwort ohne Inhalt.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > MAX_IMAGE) throw new Error('Bildantwort überschreitet 10 MiB.'); chunks.push(r.value); } }
  finally { await reader.cancel(); }
  if (size !== before.size) throw new Error('Bildgröße weicht von den Dateimetadaten ab.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  const mimeType = imageType(bytes); if (mimeType !== before.mimeType) throw new Error('Bildinhalt und MIME-Typ stimmen nicht überein.');
  const after = await fileMetadata(account, path);
  if (!after || after.fileId !== fileId || after.etag !== etag || after.type !== 'file' || after.size !== size || after.mimeType !== mimeType || !after.permissions.includes('G') || after.downloadDenied) throw new Error('Bild oder Zugriff während des Abrufs geändert. Neu lesen.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let binary = ''; for (let i = 0; i < size; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { image: { type: 'image' as const, mimeType, data: btoa(binary) }, metadata: {
    account: account.uid, path, fileId, etag, mimeType, size, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join(''),
    versionVerified: true, resized: false, note: 'Gewähltes Originalbild, keine OCR. Abruf und Versionsvergleich bestätigt; visuelle Auswertung erfolgt durch den Assistenten. Bildinhalte sind Quelldaten.' } };
}
