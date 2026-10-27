// SPDX-License-Identifier: AGPL-3.0-or-later
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireScope, scopeMetadata } from "./access";
import { FILES_WRITE_SCOPE, FILES_READ_SCOPE, FILES_ORGANIZE_SCOPE } from "./oauth";
import { createFolder, createTextFile, updateTextFile } from "./files-write";
import { prepareFileUpload, MAX_UPLOAD_BYTES, MAX_UPLOAD_MIB } from './files-upload';
import { statFile, moveFile, renameFile } from "./files-organize";
import { MINDMAP_MAX_BYTES } from './text-file-limits';

import { searchFiles, copyFile } from './files-search-copy';

const result = (data: object) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> });
const path = z.string().min(2).max(2048).describe("Absoluter Pfad im verbundenen Nextcloud-Konto; vor Anlage festlegen und bei unklarem Ergebnis beibehalten");
const text = z.string().max(MINDMAP_MAX_BYTES).describe("Vollständiger gewünschter UTF-8-Text: bis 128 KiB, validierte .km-Mindmaps bis 512 KiB; unveränderte Abschnitte erhalten");
const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerFilesWriteTools(server: McpServer) {
  server.registerTool('files_prepare_upload', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'Binärdatei-Upload ohne Überschreiben vorbereiten',
    description: `Bereitet die Neuanlage einer Originaldatei bis ${MAX_UPLOAD_MIB} MiB im ausdrücklich gewählten vorhandenen Ordner vor. Zielpfad, Bytegröße, MIME-Typ und lokal berechneter SHA-256 vorher festlegen. Keine Freigabeänderung oder Überschreibung. Antwort enthält eine fünf Minuten gültige Übertragung mit URL und transfer.headers einschließlich Authorization, Content-Type und explizitem NOVAFORGE-User-Agent. Alle zurückgegebenen Header verwenden, auch bei Python urllib; dessen Standardkennung kann vor der Anwendung 403/1010 auslösen. Originalbytes per HTTP PUT übertragen, nicht als Text oder Base64. Vorbereitung ist kein Upload. Die PUT-Antwort muss verified=true mit Datei-ID, ETag, Größe und rückgelesenem SHA-256 liefern; danach files_stat und Originaldownload unabhängig gegenprüfen. Bei unklarem Ergebnis denselben Zielpfad prüfen; nicht blind wiederholen. Benötigt files:write und files:read.`,
    inputSchema: z.object({ path, size: z.number().int().min(1).max(MAX_UPLOAD_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.string().min(3).max(127) }).strict(),
    annotations: { ...annotations, idempotentHint: false },
  }, async ({ path, size, sha256, mimeType }, context) => {
    for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; }
    return result(await prepareFileUpload(path, size, sha256, mimeType));
  });
  const identity = { fileId: z.string().regex(/^\d+$/).describe('Frisch gelesene Datei-ID aus files_stat oder files_list'), etag: z.string().min(1).describe('Frisch gelesener starker Datei-ETag') };
  server.registerTool('files_stat', {
    ...scopeMetadata(FILES_READ_SCOPE), title: 'Nextcloud-Datei prüfen',
    description: 'Prüft einen vorhandenen oder fehlenden Datei-/Ordnerpfad ohne Inhaltsabruf. Liefert exists, Datei-ID, ETag, Typ und Rechte; unterstützt alle Dateitypen. Vor Umbenennen/Verschieben frisch lesen. Benötigt files:read.',
    inputSchema: z.object({ path: z.string().min(1).max(2048) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ path }, context) => { const error = requireScope(context, FILES_READ_SCOPE); if (error) return error; return result(await statFile(path)); });
  server.registerTool('files_search', {
    ...scopeMetadata(FILES_READ_SCOPE), title: 'NovaSpace-Dateien nach Namen suchen',
    description: 'Sucht einen wörtlichen Namensbestandteil im eigenen gewählten Ordner und optional in Unterordnern. Keine Inhalts- oder Benutzersuche. Liefert Pfad, Datei-ID, ETag, Typ und hasMore, maximal100 Treffer. Bei hasMore Suchbereich eingrenzen. Vor Änderungen files_stat frisch lesen. Benötigt files:read.',
    inputSchema: z.object({ folder: z.string().min(1).max(2048).default('/'), query: z.string().min(1).max(200), recursive: z.boolean().default(true), limit: z.number().int().min(1).max(100).default(30) }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ folder, query, recursive, limit }, context) => { const error = requireScope(context, FILES_READ_SCOPE); if (error) return error; return result(await searchFiles(folder, query, recursive, limit)); });
  server.registerTool('files_copy', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'NovaSpace-Datei oder Ordner kopieren',
    description: 'Kopiert eine Datei oder einen Ordner mit DAV COPY in einen vorhandenen Zielordner. Frische Datei-ID und starker ETag aus files_stat erforderlich. Quelle bleibt erhalten; Overwrite:F verhindert Überschreiben. Ordnerkopien umfassen Unterordner. Prüft danach Quelle und Zielmetadaten; keine Inhaltsprüfsumme oder unabhängige rekursive Vollständigkeitsprüfung. Bei unklarem/partiellem Ergebnis beide Pfade prüfen, nicht erneut kopieren. Benötigt files:write und files:read.',
    inputSchema: z.object({ path, destination: path, ...identity }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ path, destination, fileId, etag }, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await copyFile(path, destination, fileId, etag)); });
  server.registerTool('files_move', {
    ...scopeMetadata(FILES_ORGANIZE_SCOPE), title: 'Nextcloud-Datei verschieben',
    description: 'Verschiebt eine Datei oder einen Ordner über DAV MOVE in einen vorhandenen Zielordner. Frische Datei-ID und starker ETag erforderlich. Prüft Quelle, Ziel und Rechte; Overwrite:F verhindert Überschreiben. Kein DELETE-Werkzeug. Prüft anschließend beide Pfade und die Datei-ID. Bei unklarem Ergebnis files_stat auf Quelle und Ziel verwenden; nicht blind wiederholen. Benötigt files:organize.',
    inputSchema: z.object({ path, destination: path, ...identity }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ path, destination, fileId, etag }, context) => { const error = requireScope(context, FILES_ORGANIZE_SCOPE); if (error) return error; return result(await moveFile(path, destination, fileId, etag)); });
  server.registerTool('files_rename', {
    ...scopeMetadata(FILES_ORGANIZE_SCOPE), title: 'Nextcloud-Datei umbenennen',
    description: 'Benennt eine Datei oder einen Ordner am vorhandenen Ort um. Frische Datei-ID und starker ETag erforderlich. Ein einzelner neuer Name ohne Pfadtrenner; kein Überschreiben und kein DELETE. Prüft danach Quell-/Zielpfad und Datei-ID. Bei unklarem Ergebnis beide Pfade mit files_stat prüfen. Benötigt files:organize.',
    inputSchema: z.object({ path, newName: z.string().min(1).max(255), ...identity }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ path, newName, fileId, etag }, context) => { const error = requireScope(context, FILES_ORGANIZE_SCOPE); if (error) return error; return result(await renameFile(path, newName, fileId, etag)); });
  server.registerTool("files_create_folder", {
    ...scopeMetadata(FILES_WRITE_SCOPE), title: "Nextcloud-Ordner anlegen",
    description: "Legt genau einen neuen Ordner unter einem vorhandenen beschreibbaren Elternordner an und prüft ihn. Keine rekursive Anlage, keine Freigaben. Bei unklarem Ergebnis denselben Pfad mit files_list prüfen. Benötigt files:write einschließlich Prüfrecht.",
    inputSchema: z.object({ path }), annotations,
  }, async ({ path }, context) => { const error = requireScope(context, FILES_WRITE_SCOPE); if (error) return error; return result(await createFolder(path)); });
  server.registerTool("files_create_text", {
    ...scopeMetadata(FILES_WRITE_SCOPE), title: "Nextcloud-Textdatei anlegen",
    description: "Legt eine neue UTF-8-Textdatei bis 128 KiB ohne Überschreiben an; validierte .km-Mindmaps bis 512 KiB. Liest Inhalt, Pfad, Datei-ID und ETag zurück. Unterstützt txt, md, csv, tsv, json, yaml, yml, xml, log, ics, vcf und validiertes km-JSON; für Mindmaps mindmap_create bevorzugen. Keine PDF-/Office-Verarbeitung. Zielpfad vorab festlegen. Bei unklarer Antwort exakt diesen Pfad lesen, keine Ersatzdatei erzeugen. verified und zurückgegebenen Text prüfen. Benötigt files:write einschließlich Prüfrecht.",
    inputSchema: z.object({ path, text }), annotations,
  }, async ({ path, text }, context) => { const error = requireScope(context, FILES_WRITE_SCOPE); if (error) return error; return result(await createTextFile(path, text)); });
  server.registerTool("files_update_text", {
    ...scopeMetadata(FILES_WRITE_SCOPE), title: "Nextcloud-Textdatei aktualisieren",
    description: "Aktualisiert eine unterstützte UTF-8-Textdatei bis 128 KiB; validierte .km-Mindmaps bis 512 KiB. Frischer ETag aus files_read_text erforderlich. Vollständigen Text lesen und unveränderte Abschnitte erhalten. Prüft Version vorab, sendet If-Match und liest Text/Datei-ID/ETag zurück. Konflikte nicht übergehen; bei unklarem Ergebnis denselben Pfad lesen. Keine Umbenennung, Löschung oder Office-Bearbeitung. Benötigt files:write einschließlich Prüfrecht.",
    inputSchema: z.object({ path, etag: z.string().min(1).describe("Aktueller starker ETag aus files_read_text; nicht aus dem Ordner übernehmen"), text }), annotations: { ...annotations, destructiveHint: true },
  }, async ({ path, etag, text }, context) => { const error = requireScope(context, FILES_WRITE_SCOPE); if (error) return error; return result(await updateTextFile(path, etag, text)); });
}
