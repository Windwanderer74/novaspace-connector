// SPDX-License-Identifier: AGPL-3.0-or-later
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { requireScope, scopeMetadata } from './access';
import { githubBridge } from './github-bridge';
const READ = 'github:read', WRITE = 'github:write';
const text = (n: number) => z.string().refine(s => !s.includes('\0') && !/[\uD800-\uDFFF]/u.test(s) && new TextEncoder().encode(s).length <= n);
const repository = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/).refine(s => !s.toLowerCase().endsWith('.git'));
const result = (d: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(d) }], structuredContent: d });
export function registerGithubTools(server: McpServer) {
  const read = { ...scopeMetadata(READ), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } };
  const registerRead = (name: string, description: string, operation: string, schema: z.ZodObject<any>) => server.registerTool(name, {
    ...read, title: name, description, inputSchema: schema,
  }, async (a, c) => requireScope(c, READ) ?? result(await githubBridge({ ...a, operation })));
  registerRead('github_connection_status', 'Prüft den persönlichen GitHub-Zugang im bestätigten Nextcloud-Konto. Nennt Konto, GitHub-Login und Brückenversion; keine Zugangsdaten. Cloud: github:read; zusätzlich muss der Deck-Bereich dieser Verbindung aktiv sein.', 'status', z.object({}).strict());
  registerRead('github_list_repositories', 'Listet eigene GitHub-Repositories über den in Nextcloud gespeicherten persönlichen Zugang. Maximal 50 je Seite; kein Zugriff über globale Installationstoken.', 'repositories', z.object({ page: z.number().int().min(1).max(100).default(1) }).strict());
  registerRead('github_read_presentation', 'Liest Repository-Zustand und README.md oder bestätigt einen fehlenden Zielnamen. Grundlage für genau eine gezielte Änderung. Repositoryname ohne Eigentümer; der Eigentümer wird aus dem persönlichen GitHub-Zugang bestimmt.', 'presentation_read', z.object({ repository }).strict());
  registerRead('github_deck_sync_status', 'Liest bestehende persönliche Deck-GitHub-Zuordnungen mit Board, Richtung, Ziel und Versionsnachweis. Ändert weder Zuordnung noch Sichtbarkeit und löst keinen Abgleich aus.', 'sync_status', z.object({}).strict());
  const write = { ...scopeMetadata(WRITE, READ), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } };
  const identity = { expectedAccount: text(255).min(1), expectedGithubLogin: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/) };
  server.registerTool('github_write_presentation', { ...write, title: 'Öffentliche GitHub-Präsentation schreiben',
    description: 'Legt nach ausdrücklich bestätigter Veröffentlichung ein eigenes öffentliches Repository mit README an oder ändert dessen README mit frischer SHA. Vorher github_read_presentation und Kontostatus lesen. Erstellt keine Softwarelizenz und veröffentlicht keinen Programmquellcode. Keine Sichtbarkeitsänderung bestehender Repositories. Nach unknown oder teilweiser Anlage frisch lesen, niemals automatisch wiederholen. Benötigt github:read und github:write sowie native GitHub-Rechte; die vorhandene Deck-Freigabe muss Änderungen erlauben.',
    inputSchema: z.object({ ...identity, repository, expectedSha: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(), expectedRepositoryId: z.number().int().positive().nullable(), expectedRepositoryAbsent: z.boolean(), acknowledgePublic: z.literal(true), readme: text(8192).min(1), description: text(350).default('') }).strict(),
  }, async (a, c) => requireScope(c, WRITE) ?? requireScope(c, READ) ?? result(await githubBridge({ ...a, operation: 'presentation_write' })));
  server.registerTool('github_deck_sync_run', { ...write, title: 'Gewählten Deck-GitHub-Abgleich auslösen',
    description: 'Löst genau einen vorhandenen eigenen Abgleich nach frischem github_deck_sync_status aus. Board, Mapping und Einstellungen werden vorgeprüft. Je nach Richtung können Inhalte nach GitHub gelangen oder Deck geändert werden; acknowledgeSync ausdrücklich setzen. Kein erneutes Einrichten und keine automatische Wiederholung nach unbestätigtem Ergebnis. Native App-Sperren und Fehler bleiben maßgeblich; Settingsprüfung und externer Abgleich sind nicht atomar.',
    inputSchema: z.object({ ...identity, mappingId: z.number().int().positive(), boardId: z.number().int().positive(), expectedVersion: z.string().regex(/^[0-9a-f]{64}$/), acknowledgeSync: z.literal(true) }).strict(),
  }, async (a, c) => requireScope(c, WRITE) ?? requireScope(c, READ) ?? result(await githubBridge({ ...a, operation: 'sync_run' })));
}
