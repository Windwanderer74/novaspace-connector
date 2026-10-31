// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate the native UI catalogue from the actual MCP registrations and the
// accepted LM Studio topic selection. No calls, credentials or network involved.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: `
import { McpServer } from '@modelcontextprotocol/server';
import { createDeckMcpServer } from './lib/mcp';
export { appForTool } from './lib/connection-policy';
export { TOPIC_TOOLS, MAIN_TOPICS, MINDMAP_DECK, NOTES_TRASH } from './ops/release-1363/topics/source/selection';
export { CONNECTOR_VERSION } from './lib/connector-version';
export const definitions = [];
const original = McpServer.prototype.registerTool;
McpServer.prototype.registerTool = function(name, config, callback) {
  definitions.push({ name, title: config.title ?? name, readOnly: config.annotations?.readOnlyHint === true });
  return original.call(this, name, config, callback);
};
try { createDeckMcpServer(); } finally { McpServer.prototype.registerTool = original; }
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: '.sites-runtime/test/connection-catalog-source.mjs' });
const source = await import('../.sites-runtime/test/connection-catalog-source.mjs');
const labels = Object.fromEntries([...String(await readFile('ops/release-1363/topics/source/config.ts')).matchAll(/\.field\('([^']+)','boolean',\{displayName:'([^']+)'/g)].map(m => [m[1], m[2]]));
const parents = { sharing: 'files', trash: 'files', boardShares: 'deck', deckTrash: 'deck', invitationReplies: 'calendar', calendarInvitations: 'calendar', calendarManagement: 'calendar', contactBooks: 'contacts' };
// Human grouping/labels follow accepted Plugin 0.1.26; stored field IDs stay fixed.
Object.assign(labels, { files: 'Dateien', tables: 'Tabellen', calendarInvitations: 'Einladungen', invitationReplies: 'Teilnahmeantworten', sharing: 'Dateifreigaben verwalten', contactBooks: 'Adressbücher verwalten', deckTrash: 'Deck-Papierkorb verwalten', trash: 'Datei-Papierkorb verwalten' });
const communication = new Set(['mail', 'talk', 'announcements']);
const work = new Set(['files', 'deck', 'mindmap', 'tasks', 'contacts', 'notes', 'calendar', 'tables', 'calendarInvitations', 'invitationReplies']);
const areaIds = ['files', 'deck', 'mindmap', 'notes', 'tables', 'tasks', 'calendar', 'contacts', 'calendarInvitations', 'invitationReplies', 'mail', 'talk', 'announcements', 'sharing', 'calendarManagement', 'boardShares', 'contactBooks', 'deckTrash', 'trash'];
if (Object.keys(labels).sort().join(',') !== [...areaIds].sort().join(',')) throw new Error('Accepted topic field IDs changed.');
if (areaIds.length !== 19 || areaIds.some(id => !source.TOPIC_TOOLS[id])) throw new Error('Topic catalogue changed; review explicitly.');
const areas = areaIds.map(id => ({ id, label: labels[id], app: parents[id] ?? id, category: work.has(id) ? 'Arbeit' : communication.has(id) ? 'Kommunikation' : 'Verwaltung', extension: Object.hasOwn(parents, id) }));
const tools = source.definitions.filter(t => !['nextcloud_capabilities', 'nextcloud_account'].includes(t.name)).map(t => {
  const app = source.appForTool(t.name);
  if (!app) throw new Error('Unmapped MCP function: ' + t.name);
  const matches = areas.filter(a => source.TOPIC_TOOLS[a.id].includes(t.name));
  const area = source.NOTES_TRASH.includes(t.name) ? 'trash' : matches.find(a => !a.extension)?.id ?? matches[0]?.id ?? (source.MINDMAP_DECK.includes(t.name) ? 'mindmap' : app);
  return { ...t, app, area, legacy: app === 'inventory' };
}).sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (new Set(tools.map(t => t.name)).size !== tools.length || tools.some(t => !t.legacy && !areaIds.includes(t.area))) throw new Error('Ambiguous function catalogue.');
for (const area of areas) area.write = tools.some(t => t.area === area.id && !t.readOnly);
const body = { version: 1, connectorVersion: source.CONNECTOR_VERSION, areas, tools };
const catalogue = { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
const text = JSON.stringify(catalogue, null, 2) + '\n';
const targets = ['lib/connection-functions.json', '../../nextcloud/platform/app/appinfo/connector-functions.json'];
if (process.argv.includes('--check')) {
  for (const path of targets) if (await readFile(path, 'utf8') !== text) throw new Error('Stale function catalogue: ' + path);
} else for (const path of targets) await writeFile(path, text);
console.log(JSON.stringify({ tools: tools.length, areas: areas.length, hash: catalogue.hash, checked: process.argv.includes('--check') }));
