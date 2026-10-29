// SPDX-License-Identifier: AGPL-3.0-or-later
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { CALENDAR_MEETING_TOOLS } from './mcp-calendar-meetings';
import { CALENDAR_MANAGEMENT_TOOLS } from './mcp-calendar-management';
import { CALENDAR_RECOVERY_TOOLS } from './mcp-calendar-recovery';
import { CALENDAR_LINK_TOOLS } from './mcp-calendar-links';

/** Read the deployed server factory through the SDK's actual tools/list serializer.
 * This stays inside the authenticated capabilities call. No network, credential,
 * native object, or tools/call request is involved. It does not inspect ChatGPT's
 * separately saved catalog or claim that the client has loaded these tools.
 */
export async function readMcpCatalog(createServer: () => McpServer) {
  const handler = createMcpHandler(createServer, { legacy: 'stateless', responseMode: 'auto' });
  const response = await handler.fetch(new Request('https://catalog.invalid/deck-mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'catalog-diagnostic', method: 'tools/list', params: {} }),
  }));
  if (response.status !== 200) throw new Error('catalog_unavailable');
  const raw = await response.text();
  if (raw.length > 2 * 1024 * 1024) throw new Error('catalog_too_large');
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(item => item.id === 'catalog-diagnostic')
    : JSON.parse(raw);
  const tools = json?.result?.tools;
  if (!Array.isArray(tools) || tools.length > 1000 || tools.some(tool => typeof tool?.name !== 'string')) throw new Error('catalog_invalid');
  const names: string[] = tools.map(tool => tool.name);
  const calendar1360 = [...CALENDAR_MEETING_TOOLS, ...CALENDAR_MANAGEMENT_TOOLS, ...CALENDAR_RECOVERY_TOOLS, ...CALENDAR_LINK_TOOLS];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(tools)));
  return {
    diagnosticVersion: '1', checked: true,
    source: 'running_worker_in_process_sdk_tools_list',
    scope: 'Serverausgabe des laufenden Workers; kein Nachweis des in ChatGPT gespeicherten oder aktivierten Werkzeugstands.',
    toolCount: names.length, uniqueToolCount: new Set(names).size,
    nextCursor: json.result.nextCursor ?? null,
    responseBytes: new TextEncoder().encode(raw).byteLength,
    catalogSha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    calendar1360: calendar1360.map(name => ({ name, advertised: names.includes(name), position: names.indexOf(name) + 1 })),
    toolNames: names,
  };
}
