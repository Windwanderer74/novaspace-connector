// SPDX-License-Identifier: AGPL-3.0-or-later
import { registerCalendarOccurrenceTools } from './mcp-calendar-occurrences';
import { registerCalendarInvitationTools } from './mcp-calendar-invitations';
import { registerCalendarPlanningTools } from './mcp-calendar-planning';
import { registerCalendarSeriesTools } from './mcp-calendar-series';
import { registerCalendarExchangeTools } from './mcp-calendar-exchange';
import {registerCalendarComfortTools} from './mcp-calendar-comfort';
import {registerCalendarSeriesCareTools} from './mcp-calendar-series-care';
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireScope, scopeMetadata } from "./access";
import { CALENDAR_READ_SCOPE, CALENDAR_WRITE_SCOPE } from "./oauth";
import { readCalendarEvent, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./calendar-write";

const result = (data: object) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> });
const text = (max: number) => z.string().max(max).refine(s => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s), "Ungültige Steuerzeichen");
const time = z.iso.datetime({ offset: true, precision: 0 }).describe("Datum/Uhrzeit mit Sekunden und eindeutigem UTC-Offset. Für Europe/Berlin den Offset des konkreten Datums beachten; Speicherung erfolgt als UTC-Zeitpunkt.");
const date=z.iso.date().describe('Ganztagsdatum YYYY-MM-DD; endDate ist exklusiv, für einen Tag der Folgetag.');
const calendarPath = z.string().min(1).describe("Kalenderkennung aus calendar_list");
const eventPath = z.string().min(1).describe("Unveränderte Ereigniskennung aus einem Lese-/Anlageergebnis");
const etag = z.string().min(1).describe("Aktueller starker ETag aus calendar_read_event; bei Konflikt neu lesen und Änderung neu beurteilen");
const alarm = z.object({minutesBefore:z.number().int().min(0).max(40320),related:z.enum(['START','END']).optional()}).strict();
const extra={timeZone:z.string().min(1).max(100).optional(),url:z.string().max(2048).optional(),status:z.enum(['CONFIRMED','TENTATIVE','CANCELLED']).optional(),classification:z.enum(['PUBLIC','PRIVATE','CONFIDENTIAL']).optional(),transparency:z.enum(['OPAQUE','TRANSPARENT']).optional(),categories:z.array(text(100).min(1)).max(20).optional(),addReminders:z.array(alarm).max(5).optional()};
const writeAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

export function registerCalendarTools(server: McpServer) {
  registerCalendarComfortTools(server);
  registerCalendarSeriesCareTools(server);
  registerCalendarPlanningTools(server);
  registerCalendarSeriesTools(server);
  registerCalendarOccurrenceTools(server);
  registerCalendarExchangeTools(server);
  registerCalendarInvitationTools(server);
  server.registerTool("calendar_read_event", {
    ...scopeMetadata(CALENDAR_READ_SCOPE), title: "Einzelnen Nextcloud-Termin lesen",
    description: "Liest genau ein unaufgelöstes Kalenderobjekt einschließlich ETag und Originalinhalt. Meldet found=false nur bei bestätigtem Fehlen. Vor Änderungen verwenden; keine Serienauflösung. Benötigt calendar:read.",
    inputSchema: z.object({ calendarPath, eventPath }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input, context) => { const error = requireScope(context, CALENDAR_READ_SCOPE); if (error) return error; return result(await readCalendarEvent(input.calendarPath, input.eventPath)); });

  server.registerTool("calendar_create_event", {
    ...scopeMetadata(CALENDAR_WRITE_SCOPE), title: "Nextcloud-Termin anlegen",
    description: "Legt einen einzelnen zeitgebundenen oder ganztägigen Termin ohne Teilnehmer/Einladungen an und liest ihn zurück. eventId vor dem ersten Versuch festlegen und bei unklarem Ergebnis beibehalten: zuerst dieselbe eventPath lesen, niemals blind eine neue ID verwenden. Vorhandene Objekte werden nicht überschrieben. Optionale lokale DISPLAY-Erinnerung oder addReminders für bis5 Alarme. URL, STATUS, CLASS, TRANSP und Kategorien möglich. timeZone mit vollständigem Zeitpaar prüft IANA-Offset und passende native VTIMEZONE. Keine Zusage tatsächlicher Erinnerungszustellung. Zeitgebunden start/end mit Offset; ganztägig startDate/endDate mit exklusivem Ende. Genau eine vollständige Variante verwenden. Keine Serien. verified bestätigt das Rücklesen; den zurückgegebenen Inhalt mit dem Auftrag abgleichen. Benötigt calendar:write.",
    inputSchema: z.object({ ...extra,calendarPath, eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/), title: text(500).min(1), start: time.optional(), end: time.optional(), startDate:date.optional(),endDate:date.optional(), description: text(10000).optional(), location: text(1000).optional(), reminderMinutes: z.number().int().min(0).max(40320).nullable().optional() }),
    annotations: { ...writeAnnotations, destructiveHint: false },
  }, async ({ calendarPath, eventId, ...input }, context) => { const error = requireScope(context, CALENDAR_WRITE_SCOPE); if (error) return error; return result(await createCalendarEvent(calendarPath, eventId, input)); });

  server.registerTool("calendar_update_event", {
    ...scopeMetadata(CALENDAR_WRITE_SCOPE), title: "Nextcloud-Termin bearbeiten oder verschieben",
    description: "Ändert Titel/Beschreibung/Ort oder Start und Ende eines einzelnen Termins mit aktuellem ETag. Beim Verschieben beide Zeitpunkte angeben. UID, fremde Eigenschaften und vorhandene DISPLAY-Erinnerungen bleiben erhalten. Ganztag über startDate/endDate mit exklusivem Ende. Mit reminderMinutes eine einfache lokale DISPLAY-Erinnerung setzen/ändern, null entfernt sie. Alternativ reminderEdits mit nullbasierten Indizes aus frischem Original und addReminders: einzelne lokale DISPLAY-Alarme gezielt ändern/entfernen/ergänzen, übrige erhalten, maximal10. Nicht mit reminderMinutes mischen. Zusatzfelder URL, STATUS, CLASS, TRANSP, Kategorien; leere URL/Kategorien entfernt. timeZone plus vollständiges Start/Ende prüft IANA-Offset und vollständige native VTIMEZONE, Zeitlücken/Unstimmigkeiten stoppen. Serien und Einladungen bleiben getrennt. Konflikte nicht übergehen. Liest das Ergebnis zurück; Inhalt prüfen. Benötigt calendar:write.",
    inputSchema: z.object({ ...extra,reminderEdits:z.array(z.object({index:z.number().int().min(0).max(9),minutesBefore:z.number().int().min(0).max(40320).nullable(),related:z.enum(['START','END']).optional()}).strict()).max(10).optional(),calendarPath, eventPath, etag, title: text(500).min(1).optional(), start: time.optional(), end: time.optional(), startDate:date.optional(),endDate:date.optional(),reminderMinutes:z.number().int().min(0).max(40320).nullable().optional(), description: text(10000).optional(), location: text(1000).optional() }),
    annotations: writeAnnotations,
  }, async ({ calendarPath, eventPath, etag, ...patch }, context) => { const error = requireScope(context, CALENDAR_WRITE_SCOPE); if (error) return error; return result(await updateCalendarEvent(calendarPath, eventPath, etag, patch)); });

  server.registerTool("calendar_delete_event", {
    ...scopeMetadata(CALENDAR_WRITE_SCOPE), title: "Einzelnen Nextcloud-Termin löschen",
    description: "Entfernt genau einen ausgewählten Einzeltermin mit aktuellem ETag und prüft anschließend dessen Abwesenheit. Serien und Einladungen werden abgelehnt. Nur bei konkretem Löschauftrag oder zur vereinbarten Bereinigung des eigenen Testtermins verwenden. Benötigt calendar:write.",
    inputSchema: z.object({ calendarPath, eventPath, etag }), annotations: writeAnnotations,
  }, async (input, context) => { const error = requireScope(context, CALENDAR_WRITE_SCOPE); if (error) return error; return result(await deleteCalendarEvent(input.calendarPath, input.eventPath, input.etag)); });
}
