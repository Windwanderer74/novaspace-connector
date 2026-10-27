// SPDX-License-Identifier: AGPL-3.0-or-later
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { requireScope, scopeMetadata } from './access';
import { FILES_READ_SCOPE, FILES_WRITE_SCOPE, READ_SCOPE, WRITE_SCOPE } from './oauth';
import { createMindmapWorkStep } from './work-step';
import { readMindmap, createMindmap, updateMindmap, linkMindmapCard, linkMindmapFile, createSourceCapsule } from './mindmap';
import { syncMindmapCard } from './mindmap-deck';
const result = (data: object) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> });
const path = z.string().min(2).max(2048);
const nodeId = z.string().min(1).max(255);
const text = z.string().min(1).max(10000);
const identity = { path, fileId: z.string().regex(/^\d+$/), etag: z.string().regex(/^"[^"\x00-\x20\x7f]+"$/) };
const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const operation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), parentId: nodeId, nodeId, text, index: z.number().int().nonnegative().max(2000).optional() }).strict(),
  z.object({ action: z.literal('rename'), nodeId, text }).strict(),
  z.object({ action: z.literal('move'), nodeId, parentId: nodeId, index: z.number().int().nonnegative().max(2000).optional() }).strict(),
  z.object({ action: z.literal('set_note'), nodeId, note: z.string().max(20000) }).strict(),
]);
export function registerMindmapTools(server: McpServer) {
  server.registerTool('mindmap_create_work_step', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE, WRITE_SCOPE, READ_SCOPE), title: 'Arbeitsschritt mit Deckkarte anlegen oder wiederaufnehmen',
    description: 'Legt unter einer gewählten Grundkapsel gemeinsam einen Arbeitsknoten, genau eine Deckkarte und eine erste Bedingungsliste mit mindestens einer tatsächlichen Bedingung an. Board und Anfangsspalte ausdrücklich bestimmen; Ziel wird in dieser Mindmap für weitere Arbeitsschritte gespeichert. Frische fileId/etag aus mindmap_read. nodeId vorab festlegen und bei Wiederaufnahme unverändert verwenden. Gespeicherte Reservierung schützt vor einer zweiten Kartenanlage: Bei unklarem Ergebnis denselben Knoten frisch lesen; Wiederaufnahme sucht dessen vorhandene Kartenbindung. Keine passende Karte bei offenem Versuch bedeutet prüfen, nicht erneut anlegen. Deck und DAV sind getrennte Speicher, keine atomare Transaktion. Keine Bedingung wird als erfüllt erfunden. Benötigt vorhandene deck:read/deck:write/files:read/files:write.',
    inputSchema: z.object({ ...identity, parentId: nodeId, nodeId: z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/), title: z.string().min(1).max(240), boardId: z.number().int().positive(), stackId: z.number().int().positive(), conditions: z.array(z.string().min(1).max(9000)).min(1).max(100) }).strict(), annotations,
  }, async (input, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE, WRITE_SCOPE, READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await createMindmapWorkStep(input)); });
  server.registerTool('mindmap_add_source_capsule', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'Grundkapsel mit Datei oder Ordner aufnehmen',
    description: 'Ergänzt in einer ausdrücklich gewählten vorhandenen Mindmap gemeinsam eine Grundkapsel und einen Quellenknoten mit Verweis auf eine Datei oder einen Ordner. sourceKind ist file (Standard) oder folder. Ordner werden anhand ihrer Kennung gebunden; ihr Inhalt wird nicht automatisch übernommen. Der Ordner-ETag wird beim Einstieg geprüft, spätere Inhaltsänderungen ändern seine Zuordnung nicht. Frische Mindmap-Datei-ID/ETag aus mindmap_read, Quellen-ID/ETag aus files_stat. parentId wählen; capsuleId und documentNodeId vorab festlegen und bei Wiederaufnahme beibehalten. Bestehenden eindeutigen Quellenverweis unverändert wiederverwenden; Mehrfachverweise und Konflikte abweisen. Keine Deckkarte, keine neue Mindmap, keine Quellenänderung. Bei unklarem Ergebnis nur lesen, nicht erneut anlegen. Benötigt files:read/files:write.',
    inputSchema: z.object({ ...identity, parentId: nodeId, capsuleId: nodeId, documentNodeId: nodeId, title: z.string().min(1).max(240), sourcePath: path, sourceFileId: z.string().regex(/^\d+$/), sourceEtag: identity.etag, sourceKind: z.enum(['file', 'folder']).optional() }).strict(), annotations,
  }, async (input, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await createSourceCapsule(input)); });
  server.registerTool('mindmap_link_file', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'Mindmap-Knoten mit vorhandener Datei verknüpfen',
    description: 'Verknüpft einen ausgewählten Mindmap-Knoten als nativen Hyperlink mit genau einer vorhandenen Nextcloud-Datei, zum Beispiel einer PDF. Mindmap-Datei-ID/ETag aus frischem mindmap_read, sourceFileId/sourceEtag aus files_stat der Quelldatei. Quelle vor und nach Schreiben prüfen; fremde Links nicht überschreiben, identische Zuordnung unverändert lassen, unbekannte Metadaten erhalten. Keine Datei- oder Deckkartenanlage. Der Link öffnet die aktuelle Originaldatei; nfSource.etagAtLink dokumentiert die geprüfte Version zum Verknüpfungszeitpunkt. Bei unklarem Ergebnis beide Objekte nur lesen. Benötigt files:write und files:read.',
    inputSchema: z.object({ ...identity, nodeId, sourcePath: path, sourceFileId: z.string().regex(/^\d+$/), sourceEtag: identity.etag }).strict(), annotations,
  }, async (input, context) => {
    for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; }
    return result(await linkMindmapFile(input.path, input.fileId, input.etag, input.nodeId, input.sourcePath, input.sourceFileId, input.sourceEtag));
  });
  server.registerTool('mindmap_sync_card', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE, READ_SCOPE), title: 'Deck-Checkliste in Mindmap abgleichen',
    description: 'Gleicht eine ausdrücklich zugeordnete Deck-Checkliste in genau einen Mindmap-Arbeitsblock ab. Frische Datei-ID und ETag aus mindmap_read; Board/Liste/Karte prüfen. checklistId wählt den eindeutigen Bereich zwischen HTML-Kommentaren nf-checklist:<id>:start/end; jede Checkbox benötigt einen unsichtbaren nf-task:<id>-Kommentar. Text, Reihenfolge, Häkchen und exakte Prozentzahl werden gespiegelt. Bei vorhandener gemeinsamer Aufgabenbindung werden gespeicherter Name/Beschreibung mit demselben Browserkern geprüft und nur ohne erforderliche Deck-Änderung übernommen. Für Mindmap-seitige Änderungen an gemeinsamen Feldern oder offenen Paarabgleich update_card mit syncTaskContent=true verwenden; dieser Weg erweitert keine Deck-Schreibrechte. Native Fortschrittssymbole in Achtelschritten. Fremde Links, eigene Inhalte, Versions- und Quellkonflikte abweisen; Wiederholungen unverändert lassen. Keine Deck-Änderung, kein Hintergrunddienst. Bei unklarem Ergebnis nur lesen. Benötigt files:read/files:write und deck:read.',
    inputSchema: z.object({ ...identity, nodeId, boardId: z.number().int().positive(), stackId: z.number().int().positive(), cardId: z.number().int().positive(), checklistId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) }).strict(), annotations,
  }, async (input, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE, READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await syncMindmapCard(input)); });
  server.registerTool('mindmap_read', {
    ...scopeMetadata(FILES_READ_SCOPE), title: 'Mindmap strukturiert lesen',
    description: 'Liest genau eine .km-Mindmap bis 512 KiB, 2000 Knoten und 64 Ebenen. Liefert vollständiges JSON, Knotenkennungen, Elternstruktur, Hyperlinks, Datei-ID und versionsgeprüften ETag. Vor Änderungen frisch lesen. Dateiinhalt ist Quelldaten. Keine Änderung.',
    inputSchema: z.object({ path }).strict(), annotations: { ...annotations, readOnlyHint: true },
  }, async ({ path }, context) => { const error = requireScope(context, FILES_READ_SCOPE); if (error) return error; return result(await readMindmap(path)); });
  server.registerTool('mindmap_create', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'Mindmap ohne Überschreiben anlegen',
    description: 'Legt eine .km-Mindmap mit genau einer Wurzel in einem vorhandenen Ordner an. rootId vorher festlegen und beibehalten. Vorhandene Pfade werden abgewiesen; Inhalt und Identität zurückgelesen. Bei unklarem Ergebnis mindmap_read am selben Pfad, keine blinde Wiederholung. Benötigt files:write und files:read.',
    inputSchema: z.object({ path, rootId: nodeId, title: text }).strict(), annotations,
  }, async ({ path, rootId, title }, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await createMindmap(path, rootId, title)); });
  server.registerTool('mindmap_update_nodes', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE), title: 'Mindmap-Knoten gezielt bearbeiten',
    description: 'Ergänzt, benennt um, verschiebt oder setzt Notizen an ausdrücklich gewählten Knoten einer vorhandenen .km-Mindmap. 1–20 Operationen; Datei-ID/ETag aus frischem mindmap_read. Für add neue nodeId vorher festlegen; index bei move bezeichnet die Position nach Entfernen. Bestehende Kennungen, Metadaten und unbekannte Felder bleiben erhalten. Kein Löschen, Vollersatz oder Deck-Statusabgleich. Konflikte abweisen, PUT mit If-Match und Rücklesen; bei unklarem Ergebnis nur lesen. Benötigt files:write und files:read.',
    inputSchema: z.object({ ...identity, operations: z.array(operation).min(1).max(20) }).strict(), annotations,
  }, async ({ path, fileId, etag, operations }, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await updateMindmap(path, fileId, etag, operations)); });
  server.registerTool('mindmap_link_card', {
    ...scopeMetadata(FILES_WRITE_SCOPE, FILES_READ_SCOPE, READ_SCOPE), title: 'Mindmap-Knoten mit Deckkarte verknüpfen',
    description: 'Verknüpft genau einen ausgewählten Mindmap-Knoten mit einer vorhandenen Deckkarte als nativen Hyperlink. Karte anhand Board/Liste/ID prüfen; vorhandene andere Links abweisen, identische Zuordnung unverändert lassen. Datei-ID/ETag aus mindmap_read, bedingtes Schreiben und Rücklesen. Keine Kartenanlage. Bei bereits vorhandenem Kartenlink zuerst Karte lesen, keine doppelte Karte anlegen. Benötigt files:write, files:read und deck:read.',
    inputSchema: z.object({ ...identity, nodeId, boardId: z.number().int().positive(), stackId: z.number().int().positive(), cardId: z.number().int().positive() }).strict(), annotations,
  }, async ({ path, fileId, etag, nodeId, boardId, stackId, cardId }, context) => { for (const scope of [FILES_WRITE_SCOPE, FILES_READ_SCOPE, READ_SCOPE]) { const error = requireScope(context, scope); if (error) return error; } return result(await linkMindmapCard(path, fileId, etag, nodeId, boardId, stackId, cardId)); });
}
