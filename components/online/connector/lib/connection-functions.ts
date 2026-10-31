// SPDX-License-Identifier: AGPL-3.0-or-later
import catalogue from './connection-functions.json';

export { catalogue as CONNECTION_FUNCTIONS };
export type FunctionPolicy = {
  version: 1;
  catalogue: string;
  areas: Record<string, 'off' | 'read' | 'write'>;
  allowedTools: string[];
};
const areaIds = catalogue.areas.map(a => a.id).sort();
const tools = new Map(catalogue.tools.map(t => [t.name, t]));
/** An explicit snapshot, never a prefix/wildcard grant for future tools. */
export function parseFunctionPolicy(value: unknown): FunctionPolicy {
  const p = value as FunctionPolicy;
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.version !== 1
    || typeof p.catalogue !== 'string' || !/^[a-f0-9]{64}$/.test(p.catalogue)
    || !p.areas || typeof p.areas !== 'object' || Array.isArray(p.areas)
    || Object.keys(p.areas).sort().join(',') !== areaIds.join(',')
    || Object.values(p.areas).some(v => !['off', 'read', 'write'].includes(v))
    || !Array.isArray(p.allowedTools) || p.allowedTools.length > 1000
    || p.allowedTools.some(n => typeof n !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(n))
    || new Set(p.allowedTools).size !== p.allowedTools.length) throw new Error('Einzelfreigaben nicht bestätigt.');
  return { version: 1, catalogue: p.catalogue, areas: { ...p.areas }, allowedTools: [...p.allowedTools].sort() };
}
export function functionPolicyDenial(policy: FunctionPolicy | undefined, name: string) {
  if (!policy) return undefined; // Existing v1 policy retains its effective ceiling.
  const tool = tools.get(name);
  const mode = tool?.legacy ? 'write' : tool ? policy.areas[tool.area] : 'off';
  const code = !tool || !policy.allowedTools.includes(name) ? 'function_access_disabled'
    : mode === 'off' ? 'function_area_disabled' : !tool.readOnly && mode !== 'write' ? 'function_write_disabled' : undefined;
  if (!code) return undefined;
  const data = { outcome: code, tool: name, area: tool?.area ?? null,
    message: 'Diese Funktion ist für die KI-Verbindung nicht freigegeben: ' + (tool?.title ?? name),
    retryable: false, reauthenticationRequired: false,
    nextStep: 'Die ausgewählte Verbindung unter KI-Verbindungen prüfen. Bereich und Einzelwahl gelten gemeinsam; zusätzliche Rechte bleiben erforderlich.' };
  return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data };
}
