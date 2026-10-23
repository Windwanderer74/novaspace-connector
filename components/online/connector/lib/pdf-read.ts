// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { nextcloudIdentity, readBody } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v);

async function bridgeRequest(action: 'health' | 'read', args?: object) {
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Nextcloud-Basisadresse.');
  const basic = btoa(Array.from(new TextEncoder().encode(`${login}:${password}`), b => String.fromCharCode(b)).join(''));
  const response = await fetch(`${url.origin}${url.pathname.replace(/\/$/, '')}/ocs/v2.php/apps/novaforge_pdf/api/v1/${action}?format=json`, {
    method: action === 'health' ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(35000),
    headers: { Authorization: `Basic ${basic}`, 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(args ? { body: JSON.stringify(args) } : {}),
  });
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('PDF-Brücke meldet eine Weiterleitung. Zugangsdaten werden nicht weitergeleitet.'); }
  const status = response.status;
  let envelope;
  try { envelope = JSON.parse(await readBody(response, 512 * 1024)); } catch { throw new Error(`PDF-Brücke: HTTP ${status}, keine gültige Antwort.`); }
  if (!object(envelope) || !object(envelope.ocs) || !object(envelope.ocs.meta) || !object(envelope.ocs.data)) throw new Error('Ungültige OCS-Antwort der PDF-Brücke.');
  const data = envelope.ocs.data;
  if (typeof data.error === 'string' && /^(?:PDF_[A-Z_]+|AUTH_REQUIRED)$/.test(data.error)) throw new Error(`PDF-Brücke: ${data.error} (HTTP ${status}). Technischer Fehler, kein Dokumentinhalt.`);
  if (status !== 200 || envelope.ocs.meta.status !== 'ok' || ![100, 200].includes(Number(envelope.ocs.meta.statuscode))) throw new Error(`PDF-Brücke: HTTP ${status}.`);
  return data;
}

export async function pdfStatus() {
  const account = await nextcloudIdentity();
  const data = await bridgeRequest('health');
  if (data.account !== account.uid || data.selftest !== 'passed' || data.protocol !== 1 || data.ocr !== false || !object(data.limits)) throw new Error('PDF-Selbsttest oder Kontozuordnung nicht bestätigt.');
  return { account: data.account, bridgeVersion: data.bridgeVersion, protocol: data.protocol, parser: data.parser, selftest: data.selftest, limits: data.limits, ocr: false };
}

export async function readPdf(path: string, startPage: number, pageCount: number, expectedFileId?: string, expectedEtag?: string) {
  checkedFilePath(path);
  if (!/\.pdf$/i.test(path)) throw new Error('Ein PDF-Pfad ist erforderlich.');
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > 200 || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 5) throw new Error('Ungültiger PDF-Seitenbereich.');
  if ((expectedFileId === undefined) !== (expectedEtag === undefined) || (startPage > 1 && !expectedFileId)) throw new Error('Für Folgeseiten beide Kennungen aus der ersten PDF-Antwort angeben: expectedFileId und expectedEtag.');
  if (expectedFileId !== undefined && !/^\d+$/.test(expectedFileId)) throw new Error('Ungültige erwartete Datei-ID.');
  if (expectedEtag !== undefined) checkedEtag(expectedEtag);
  const account = await nextcloudIdentity();
  const data = await bridgeRequest('read', { path, startPage, pageCount, ...(expectedFileId !== undefined ? { expectedFileId, expectedEtag } : {}) });
  if (data.account !== account.uid || data.path !== path || typeof data.fileId !== 'string' || !/^\d+$/.test(data.fileId) || typeof data.etag !== 'string' || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256) || typeof data.pageCount !== 'number' || !Number.isInteger(data.pageCount) || data.pageCount < 1 || data.pageCount > 200 || data.startPage !== startPage || !Array.isArray(data.pages) || data.pages.length < 1 || data.pages.length > pageCount || data.endPage !== startPage + data.pages.length - 1 || Number(data.endPage) > data.pageCount || typeof data.sizeBytes !== 'number' || data.sizeBytes < 1 || data.sizeBytes > 20971520 || typeof data.parserWarnings !== 'boolean') throw new Error('PDF-Inhalt, Identität oder Seitenbereich ist nicht bestätigt.');
  checkedEtag(data.etag);
  if (expectedFileId !== undefined && (data.fileId !== expectedFileId || data.etag !== expectedEtag)) throw new Error('PDF-Identität oder Version geändert. Keine Folgeseiten ausgeben.');
  let characters = 0;
  const pages = data.pages.map((p: unknown, i: number) => {
    if (!object(p) || p.page !== startPage + i || typeof p.text !== 'string' || !['text', 'no_text'].includes(String(p.status)) || (p.status === 'no_text') !== (p.text.length === 0)) throw new Error('Ungültige PDF-Seitenantwort.');
    characters += Array.from(p.text).length;
    return { page: p.page, status: p.status, text: p.text };
  });
  if (characters > 24000 || data.textCharacters !== characters || data.nextPage !== (Number(data.endPage) < data.pageCount ? Number(data.endPage) + 1 : null)) throw new Error('PDF-Textumfang oder Fortsetzungskennung widersprüchlich.');
  return { account: account.uid, path, filename: path.split('/').pop(), fileId: data.fileId, etag: data.etag, sha256: data.sha256, sizeBytes: data.sizeBytes, bridgeVersion: data.bridgeVersion, pageCount: data.pageCount, startPage, endPage: data.endPage, nextPage: data.nextPage, pages, parserWarnings: data.parserWarnings, textCharacters: characters, ocr: false, note: 'Gelesen sind ausschließlich die gelieferten PDF-Seiten und deren Textschicht. Keine OCR oder Sichtprüfung. Technische Fehler sind kein Dokumentinhalt. Folgeseiten an dieselbe Datei-ID und denselben ETag binden.' };
}
