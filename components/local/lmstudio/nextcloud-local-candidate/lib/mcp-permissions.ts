// SPDX-License-Identifier: AGPL-3.0-or-later
import type { McpServer } from '@modelcontextprotocol/server';
import { hasGatewayPrincipal, currentGatewayPrincipal, readRegistryState } from './platform-registry';
import { appForTool, parseConnectionPolicy, permissionDenial, withConnectionPolicy } from './connection-policy';

/** Wrap every registration, so an advertised tool cannot bypass the connection's policy. */
export function enforceConnectionPermissions(server: McpServer) {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: Record<string, unknown>, callback: (...args: any[]) => any) =>
    register(name, config as any, async (...args: any[]) => {
      if (!hasGatewayPrincipal() || name === 'nextcloud_capabilities') return callback(...args);
      let state: Awaited<ReturnType<typeof readRegistryState>>;
      try { state = await readRegistryState(currentGatewayPrincipal()); }
      catch { return { isError: true, content: [{ type: 'text', text: 'Der aktuelle App-Freigabestatus ist technisch nicht bestätigt. Keine neue Anmeldung auslösen; Statusprüfung wiederholen.' }], structuredContent: { outcome: 'registry_unverified', reauthenticationRequired: false, retryable: true } }; }
      if (state.registered && !state.active) return { isError: true, content: [{ type: 'text', text: 'Verbindung widerrufen oder Zugang geändert. Freigabestatus prüfen; keine automatische Neuanmeldung.' }], structuredContent: { outcome: 'connection_unavailable', reauthenticationRequired: false } };
      const policy = parseConnectionPolicy(state.accessPolicy);
      const app = appForTool(name);
      if (!app && name !== 'nextcloud_account') return { isError: true, content: [{ type: 'text', text: 'Für dieses Werkzeug ist kein geprüfter App-Bereich zugeordnet.' }], structuredContent: { outcome: 'tool_policy_unmapped', reauthenticationRequired: false } };
      const readOnly = (config.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint === true;
      const denied = permissionDenial(policy, app, !readOnly);
      if (denied) return denied;
      return withConnectionPolicy(policy, () => callback(...args));
    })) as typeof server.registerTool;
}
