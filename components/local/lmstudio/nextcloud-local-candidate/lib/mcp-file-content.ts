// SPDX-License-Identifier: AGPL-3.0-or-later
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { requireScope, scopeMetadata } from './access';
import { FILES_PDF_SCOPE, FILES_DOWNLOAD_SCOPE } from './oauth';
import { readPdf, pdfStatus } from './pdf-read';
import { createFileDownload } from './files-download';
import { readImage } from './files-image';
import {readPdfOriginalChunk,PDF_CHUNK_BYTES} from './pdf-original-chunk';

const result = (data: object) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerFileContentTools(server: McpServer) {
  server.registerTool('files_read_pdf_original_chunk',{
    ...scopeMetadata(FILES_DOWNLOAD_SCOPE),title:'PDF-Originalabschnitt übertragen',
    description:'Liest höchstens 512 KiB Originalbytes einer gezielt gewählten PDF-Version innerhalb des authentifizierten Connectors. Bis 512 MiB Gesamtdatei; offset muss ein Vielfaches von 524288 sein. Datei-ID/ETag/Downloadrecht vor und nach bedingtem Range-GET geprüft, Abschnittshash und Base64-Bytes geliefert. Alle Abschnitte lückenlos zusammensetzen, Gesamthash berechnen, Seiten rendern/ansehen und Quelle erneut prüfen. Keine OCR, Originaländerung oder externe Downloadlink-Navigation. Benötigt files:download.',
    inputSchema:z.object({path:z.string().min(2).max(2048),fileId:z.string().regex(/^\d+$/),etag:z.string().min(1),offset:z.number().int().min(0).max(536870911).refine(v=>v%PDF_CHUNK_BYTES===0)}).strict(),annotations,
  },async({path,fileId,etag,offset},context)=>{const error=requireScope(context,FILES_DOWNLOAD_SCOPE);if(error)return error;return result(await readPdfOriginalChunk(path,fileId,etag,offset));});
  server.registerTool('files_prepare_pdf_workspace', {
    ...scopeMetadata(FILES_DOWNLOAD_SCOPE), title: 'PDF zur Seitensichtung bereitstellen',
    description: 'Bereitet genau eine PDF-Version zum tatsächlichen Download und zur Sichtung gewählter Originalseiten im Arbeitsbereich vor. Bis 512 MiB, 1–5 Seiten pro Aufruf; benötigt dort Poppler. Die Antwort ist nur die Vorbereitung: Download, SHA-256, Rendern, Anschauen und erneutes files_stat müssen noch erfolgen. Keine OCR oder Dateiänderung. Benötigt files:download.',
    inputSchema: z.object({ path: z.string().min(2).max(2048), fileId: z.string().regex(/^\d+$/), etag: z.string().min(1), pages: z.array(z.number().int().min(1).max(10000)).min(1).max(5).refine(p=>new Set(p).size===p.length) }).strict(), annotations: { ...annotations, idempotentHint: false },
  }, async ({path,fileId,etag,pages}, context) => {
    const error=requireScope(context,FILES_DOWNLOAD_SCOPE);if(error)return error;
    if(!/\.pdf$/i.test(path))throw new Error('Ein PDF-Pfad ist erforderlich.');
    const file=await createFileDownload(path,fileId,etag);
    if(!Number.isSafeInteger(file.size) || Number(file.size)<1 || Number(file.size)>536870912)throw new Error('PDF-Größe fehlt oder überschreitet 512 MiB.');
    return result({source:{account:file.account,path,fileId,etag,size:file.size},pages,transfer:{tool:'files_read_pdf_original_chunk',firstOffset:0,chunkSize:PDF_CHUNK_BYTES,assembler:'scripts/assemble-pdf-chunk.py'},processor:'scripts/pdf-workbench.py / 1.0.2',downloadCompleted:false,renderCompleted:false,visualInspectionPerformed:false,sourceVersionRecheckRequired:true,ocrPerformed:false,note:'Originalabschnitte mit gleicher Datei-ID/ETag ab offset 0 lesen, jeden Abschnitt prüfen und mit scripts/assemble-pdf-chunk.py lückenlos zusammensetzen. Danach scripts/pdf-workbench.py mit source, receivedOriginalPath, pages und neuem absoluten outputDirectory ausführen. Bilder ansehen und Quelle erneut mit files_stat prüfen. Erst dann Gesamthash und Prüfbefund im Register erfassen. Kein PDF-Inhalt wurde hier gelesen.'});
  });
  server.registerTool('files_read_image', {
    ...scopeMetadata(FILES_DOWNLOAD_SCOPE), title: 'Gewähltes Bild sichten',
    description: 'Lädt ein Originalbild als tatsächlich sichtbaren MCP-Bildinhalt mit SHA-256. PNG, JPEG, GIF und WebP bis 10 MiB; keine PDF-/TIFF-Konvertierung, Skalierung oder OCR. Frische Datei-ID und ETag aus files_stat; Metadaten vor/nach bedingtem GET geprüft. Benötigt files:download.',
    inputSchema: z.object({ path: z.string().min(2).max(2048), fileId: z.string().regex(/^\d+$/), etag: z.string().min(1) }), annotations,
  }, async ({ path, fileId, etag }, context) => {
    const error = requireScope(context, FILES_DOWNLOAD_SCOPE); if (error) return error;
    const data = await readImage(path, fileId, etag);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data.metadata) }, data.image], structuredContent: data.metadata };
  });
  server.registerTool('files_pdf_status', {
    ...scopeMetadata(FILES_PDF_SCOPE), title: 'PDF-Leser prüfen',
    description: 'Prüft den vorhandenen PDF-Brücken-Selbsttest mit zwei bekannten Testseiten unter dem verbundenen Konto. Liefert tatsächliche Version und Grenzen; keine Kundendatei gelesen. Ein Fehler bestätigt keinen funktionsfähigen PDF-Zugang. Benötigt files:pdfread.', inputSchema: z.object({}), annotations,
  }, async (_, context) => { const error = requireScope(context, FILES_PDF_SCOPE); if (error) return error; return result(await pdfStatus()); });
  server.registerTool('files_read_pdf', {
    ...scopeMetadata(FILES_PDF_SCOPE), title: 'PDF-Seiten lesen',
    description: 'Liest die Textschicht von 1–5 tatsächlichen PDF-Seiten über die vorhandene Nextcloud-PDF-Brücke. Maximal 20 MiB, 200 Gesamtseiten und 24000 Textzeichen pro Abruf. Keine OCR. Liefert Seiten, Datei-ID, ETag und SHA-256. Für Folgeseiten beide Kennungen exakt aus der ersten erfolgreichen Antwort angeben; technische Fehler sind kein Dokumentinhalt. Benötigt files:pdfread.',
    inputSchema: z.object({ path: z.string().min(2).max(2048), startPage: z.number().int().min(1).max(200).default(1), pageCount: z.number().int().min(1).max(5).default(1), expectedFileId: z.string().regex(/^\d+$/).optional(), expectedEtag: z.string().min(1).optional() }), annotations,
  }, async ({ path, startPage, pageCount, expectedFileId, expectedEtag }, context) => { const error = requireScope(context, FILES_PDF_SCOPE); if (error) return error; return result(await readPdf(path, startPage, pageCount, expectedFileId, expectedEtag)); });
  server.registerTool('files_download', {
    ...scopeMetadata(FILES_DOWNLOAD_SCOPE), title: 'Nextcloud-Datei herunterladen',
    description: 'Erzeugt einen fünf Minuten gültigen Downloadlink für eine gezielt gewählte Datei und Version. Frische Datei-ID und ETag aus files_stat erforderlich. Alle Dateitypen; Übertragung als Stream. Kein öffentliches Nextcloud-Share und keine Dateiänderung. Link nur für den angeforderten Download verwenden; Inhaber können die Datei bis zum Ablauf abrufen. Bei PDFs bis 512 KiB enthält die Antwort zusätzlich die vollständigen versionsgeprüften Originalbytes als originalChunk mit SHA-256; größere PDFs über files_read_pdf_original_chunk übertragen. Erzeugter Link beweist keinen abgeschlossenen Download. Benötigt files:download.',
    inputSchema: z.object({ path: z.string().min(2).max(2048), fileId: z.string().regex(/^\d+$/), etag: z.string().min(1) }), annotations: { ...annotations, idempotentHint: false },
  }, async ({ path, fileId, etag }, context) => {
    const error = requireScope(context, FILES_DOWNLOAD_SCOPE); if (error) return error;
    const data = await createFileDownload(path, fileId, etag);
    const originalChunk = /\.pdf$/i.test(path) && Number.isSafeInteger(data.size) && Number(data.size) > 0 && Number(data.size) <= PDF_CHUNK_BYTES
      ? await readPdfOriginalChunk(path, fileId, etag, 0) : undefined;
    const output = { ...data, ...(originalChunk ? { originalChunk, originalBytesIncluded: true } : {}) };
    return { content: [{ type: 'text' as const, text: JSON.stringify(output) }, { type: 'resource_link' as const, uri: data.downloadUrl, name: data.name, mimeType: data.mimeType, ...(data.size === null ? {} : { size: data.size }), description: 'Gewähltes Original herunterladen; Link läuft nach fünf Minuten ab.' }], structuredContent: output };
  });
}
