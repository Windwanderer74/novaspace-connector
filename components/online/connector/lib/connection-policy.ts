// SPDX-License-Identifier: AGPL-3.0-or-later
import { AsyncLocalStorage } from 'node:async_hooks';

export const APP_ACCESS = {
  files: { label: 'Dateien', write: true }, deck: { label: 'Deck', write: true },
  calendar: { label: 'Kalender', write: true }, mindmap: { label: 'Mindmap', write: true },
  tables: { label: 'Tabellen', write: true }, mail: { label: 'Mail', write: false },
  talk: { label: 'Talk', write: false }, announcements: { label: 'Mitteilungen', write: false },
  inventory: { label: 'Inventory', write: true },
  notes: { label: 'Notizen', write: true }, tasks: { label: 'Aufgaben', write: true }, contacts: { label: 'Kontakte', write: true },
} as const;
export type AppName = keyof typeof APP_ACCESS;
export type AccessMode = 'off' | 'read' | 'write';
export type ConnectionPolicy = { version: 1; configured: boolean; enabled: boolean; apps: Record<AppName, AccessMode> };
export class ConnectionPolicyDenied extends Error {
  constructor(public readonly outcome: string, message: string) { super(message); }
  response() { return Response.json({ outcome: this.outcome, message: this.message, reauthenticationRequired: false,
    nextStep: 'Meine KI-Verbindungen und den Freigabestatus prüfen; keine automatische Neuanmeldung.' }, { status: this.outcome === 'registry_unverified' ? 503 : 403, headers: { 'Cache-Control': 'no-store' } }); }
}
export function inheritedPolicy(): ConnectionPolicy {
  return { version: 1, configured: false, enabled: true, apps: Object.fromEntries(Object.entries(APP_ACCESS).map(([k,v]) => [k,['notes','tasks','contacts'].includes(k) ? 'off' : v.write ? 'write' : 'read'])) as Record<AppName, AccessMode> };
}
export function parseConnectionPolicy(value: unknown): ConnectionPolicy {
  if (value === undefined) return inheritedPolicy(); // Old native app: preserve existing OAuth/native limits.
  const p = value as ConnectionPolicy;
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.version !== 1 || typeof p.configured !== 'boolean'
    || typeof p.enabled !== 'boolean' || !p.apps || typeof p.apps !== 'object' || Array.isArray(p.apps)
    || ![Object.keys(APP_ACCESS),Object.keys(APP_ACCESS).filter(k=>!['tasks','contacts'].includes(k)),Object.keys(APP_ACCESS).filter(k=>!['notes','tasks','contacts'].includes(k))].map(keys=>keys.sort().join(',')).includes(Object.keys(p.apps).sort().join(','))) throw new Error('App-Freigabestatus nicht bestätigt.');
  const apps = { ...p.apps };
  for(const app of ['notes','tasks','contacts'] as const)if(!Object.hasOwn(apps,app))apps[app]='off';
  for (const app of Object.keys(APP_ACCESS) as AppName[]) if (!['off','read','write'].includes(apps[app]) || (!APP_ACCESS[app].write && apps[app] === 'write')) throw new Error('App-Freigabestatus nicht bestätigt.');
  return { version: 1, configured: p.configured, enabled: p.enabled, apps };
}
export function appForScope(scope: string): AppName | undefined {
  if (scope.startsWith('github:')) return 'deck';
  const app = scope.split(':')[0]; return Object.hasOwn(APP_ACCESS, app) ? app as AppName : undefined;
}
export function appForTool(name: string): AppName | undefined {
  if (name.startsWith('github_')) return 'deck';
  if (/^(search|fetch|get_board|get_board_structure|get_stack|list_boards|create_card|update_card|move_card)$/.test(name)) return 'deck';
  if (name.startsWith('documents_')) return 'tables';
  if (name === 'nextcloud_account') return undefined;
  const prefix = name.split('_')[0]; return Object.hasOwn(APP_ACCESS, prefix) ? prefix as AppName : undefined;
}
export function permissionDenial(policy: ConnectionPolicy, app?: AppName, write = false) {
  const code = !policy.enabled ? 'connection_disabled' : app && policy.apps[app] === 'off' ? 'app_access_disabled' : app && write && policy.apps[app] !== 'write' ? 'app_write_disabled' : undefined;
  if (!code) return undefined;
  const message = code === 'connection_disabled' ? 'Der Hauptschalter dieser KI-Verbindung ist ausgeschaltet.'
    : `${APP_ACCESS[app!].label}: ${code === 'app_write_disabled' ? 'Diese Verbindung ist nur zum Lesen freigegeben.' : 'Der Zugriff ist für diese Verbindung ausgeschaltet.'}`;
  const data = { outcome: code, app: app ?? null, message, retryable: false, reauthenticationRequired: false,
    nextStep: 'Freigabestatus unter Meine KI-Verbindungen prüfen. Nur der Nutzer kann die Freigabe ändern; nicht erneut anmelden und keine Rechte selbst erweitern.' };
  return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data };
}
const policies = new AsyncLocalStorage<ConnectionPolicy>();
export const withConnectionPolicy = <T>(policy: ConnectionPolicy, fn: () => T) => policies.run(policy, fn);
export function scopePolicyDenial(scope: string) {
  const p = policies.getStore(), app = appForScope(scope);
  return p ? permissionDenial(p, app, /:(write|organize|share|trash|schedule|manage)$/.test(scope)) : undefined;
}
/** Cross-app foreground workflows also respect a separately disabled Mindmap area. */
export function appPolicyDenial(app: AppName, write = false) {
  const p = policies.getStore(); return p ? permissionDenial(p, app, write) : undefined;
}
export function accessOverview(policy: ConnectionPolicy, scopes: readonly string[]) {
  return Object.entries(APP_ACCESS).map(([app, config]) => {
    const area = app as AppName;
    const reads = area === 'mindmap' ? ['files:read'] : area === 'files' ? ['files:read','files:download','files:pdfread'] : [`${area}:read`];
    const writes = area === 'mindmap' ? ['files:write'] : area === 'files' ? ['files:write','files:organize','files:share','files:trash'] : area === 'deck' ? ['deck:write','deck:share','deck:trash'] : area === 'calendar' ? ['calendar:write','calendar:schedule','calendar:organize','calendar:manage','calendar:share'] : area === 'contacts' ? ['contacts:write','contacts:share','contacts:manage'] : [`${area}:write`];
    const allowed = (s: string) => scopes.includes(s) && !permissionDenial(policy, appForScope(s), /:(write|organize|share|trash|schedule|manage)$/.test(s));
    return { app, label: config.label, maximum: policy.apps[area], connectionEnabled: policy.enabled,
      readAvailable: !permissionDenial(policy, area) && reads.some(allowed),
      writeAvailable: config.write && !permissionDenial(policy, area, true) && writes.some(allowed),
      note: 'Gilt für die Verbindung und erteilte Konnektorrechte. Native Objektfreigaben und erforderliche Zusatzrechte werden beim tatsächlichen Aufruf geprüft.' };
  });
}
