// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Platform foundation 0.1: framework-independent connection policy and action journal.
 * Not connected to the live OAuth/MCP/Nextcloud handlers. Adapters are trusted server code.
 * An AuthProof MUST come from cryptographic credential/session verification, never a body/header label.
 */
export type Channel = 'cloud_connector' | 'local_connector' | 'web';
export type Resource = Readonly<{ type: string; id: string }>;
export type Connection = Readonly<{
  id: string; tenantId: string; ownerUid: string;
  authSubject: string; clientId: string; audience: string;
  channel: Channel; provider: string; displayName: string;
  scopes: readonly string[]; revision: number; revokedAt: string | null;
}>;
export type AuthProof = Readonly<{
  connectionId: string; subject: string; clientId: string; audience: string;
  scopes: readonly string[]; revision: number; expiresAt: number;
}>;
export type Actor = Readonly<{
  tenantId: string; ownerUid: string; connectionId: string;
  channel: Channel; provider: string; displayName: string; revision: number;
}>;
export type Command = Readonly<{
  requestId: string; action: string; resource: Resource; input: unknown;
}>;
export type MutationResult = Readonly<{
  outcome: 'committed' | 'not_committed' | 'unknown';
  verification: 'verified' | 'unverified' | 'changed_afterwards';
  resource?: Resource; changedFields: readonly string[];
}>;
export type State = 'reserved' | 'succeeded' | 'failed' | 'unknown' | 'denied';
export type Entry = Readonly<{
  version: 1; requestId: string; actor: Actor; action: string;
  resource: Resource; resultResource: Resource | null; intentHash: string; startedAt: string; completedAt: string | null;
  state: State; verification: MutationResult['verification'];
  changedFields: readonly string[]; code: string;
}>;
export type Reply = Readonly<{
  entry: Entry; replayed: boolean; journalRecorded: boolean;
  mayHaveChanged: boolean; retryMutation: false;
}>;
export interface Journal {
  /** Atomic unique reservation keyed by (tenantId, requestId), returning its durable current row. */
  reserve(entry: Entry): Promise<{ inserted: boolean; entry: Entry }>;
  /** Atomic reserved -> terminal compare-and-set. Never replace a terminal event. */
  complete(entry: Entry): Promise<Entry>;
}
export interface Operation {
  readonly requiredScopes: readonly string[];
  /** Must use native resource ACLs, in addition to connection scopes. */
  allowed(actor: Actor, resource: Resource): Promise<boolean>;
  /** Must recheck native ACL/version at mutation time. No authority from command.input. */
  mutate(actor: Actor, resource: Resource, input: unknown): Promise<MutationResult>;
}
export interface Dependencies {
  authenticate(request: Request): Promise<AuthProof>;
  connection(id: string): Promise<Connection | null>;
  journal: Journal;
  operations: ReadonlyMap<string, Operation>;
  now(): number;
}
export class PlatformError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'PlatformError'; }
}
function fail(code: string): never { throw new PlatformError(code); }
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const FIELD = /^[A-Za-z][A-Za-z0-9_.]{0,79}$/;
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_IDENTIFIER');
}
function resource(value: unknown): asserts value is Resource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RESOURCE');
  const v = value as Resource;
  if (Object.keys(value).sort().join(',') !== 'id,type') fail('INVALID_RESOURCE');
  id(v.type); id(v.id);
}
function scopes(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(s => typeof s !== 'string' || !/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(s)) || new Set(value).size !== value.length) fail('INVALID_SCOPES');
}
function time(now: number): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) fail('INVALID_CLOCK');
  return new Date(now).toISOString();
}
/** JSON only; rejects ambiguous types/cycles and bounds hashing work. Values are NOT journaled. */
export function canonicalIntent(value: unknown): string {
  const seen = new Set<object>(); let nodes = 0;
  function walk(v: unknown, depth: number): string {
    if (++nodes > 10000 || depth > 20) return fail('INPUT_TOO_COMPLEX');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (!v || typeof v !== 'object' || seen.has(v)) return fail('INVALID_JSON_INPUT');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return fail('INVALID_JSON_INPUT');
    seen.add(v);
    let result: string;
    if (Array.isArray(v)) {
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (Reflect.ownKeys(v).length !== v.length + 1 || Array.from({ length: v.length }, (_, i) => descriptors[String(i)]).some(d => !d || !d.enumerable || !('value' in d))) return fail('INVALID_JSON_INPUT');
      result = '[' + v.map(x => walk(x, depth + 1)).join(',') + ']';
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (Reflect.ownKeys(v).some(k => typeof k !== 'string' || !descriptors[k]?.enumerable || !('value' in descriptors[k]))) return fail('INVALID_JSON_INPUT');
      result = '{' + Object.keys(descriptors).sort().map(k => JSON.stringify(k) + ':' + walk(descriptors[k].value, depth + 1)).join(',') + '}';
    }
    seen.delete(v); return result;
  }
  const encoded = walk(value, 0);
  if (new TextEncoder().encode(encoded).length > 131072) fail('INPUT_TOO_LARGE');
  return encoded;
}
async function hash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
function freezeActor(c: Connection): Actor {
  return Object.freeze({ tenantId: c.tenantId, ownerUid: c.ownerUid, connectionId: c.id, channel: c.channel, provider: c.provider, displayName: c.displayName, revision: c.revision });
}
async function resolve(d: Dependencies, request: Request, required: readonly string[]) {
  const proof = await d.authenticate(request);
  if (!proof || typeof proof !== 'object') fail('AUTHENTICATION_REQUIRED');
  scopes(proof.scopes);
  const p = { ...proof, scopes: [...proof.scopes] };
  id(p.connectionId); id(p.subject); id(p.clientId); scopes(p.scopes);
  if (!Number.isSafeInteger(p.expiresAt) || p.expiresAt <= d.now()) fail('CREDENTIAL_EXPIRED');
  if (!Number.isSafeInteger(p.revision) || p.revision < 1) fail('INVALID_REVISION');
  const raw = await d.connection(p.connectionId);
  if (!raw) fail('CONNECTION_UNAVAILABLE');
  scopes(raw.scopes);
  // Copy adapter data before awaits so a mutable registry object cannot change actor identity.
  const c = { ...raw, scopes: [...raw.scopes] };
  for (const v of [c.id, c.tenantId, c.ownerUid, c.authSubject, c.clientId, c.provider]) id(v);
  scopes(c.scopes);
  if (!['cloud_connector', 'local_connector', 'web'].includes(c.channel) || typeof c.displayName !== 'string' || !c.displayName.trim() || c.displayName.length > 120 || /[\x00-\x1f\x7f]/.test(c.displayName)) fail('INVALID_CONNECTION');
  if (c.revokedAt !== null) fail('CONNECTION_REVOKED');
  if (c.id !== p.connectionId || c.authSubject !== p.subject || c.clientId !== p.clientId || c.audience !== p.audience || !c.audience || c.revision !== p.revision) fail('CONNECTION_BINDING_MISMATCH');
  if (!required.every(s => c.scopes.includes(s) && p.scopes.includes(s))) fail('INSUFFICIENT_SCOPE');
  return freezeActor(c);
}
function reply(entry: Entry, replayed: boolean, journalRecorded: boolean): Reply {
  return { entry, replayed, journalRecorded, mayHaveChanged: ['reserved', 'unknown', 'succeeded'].includes(entry.state), retryMutation: false };
}
function sameActor(a: Actor, b: Actor) {
  return a.tenantId === b.tenantId && a.ownerUid === b.ownerUid && a.connectionId === b.connectionId && a.revision === b.revision;
}
function sameReservation(a: Entry, b: Entry) {
  return a.version === b.version && a.requestId === b.requestId && sameActor(a.actor, b.actor) && a.action === b.action && a.intentHash === b.intentHash && a.resource.type === b.resource.type && a.resource.id === b.resource.id;
}
function result(value: MutationResult) {
  if (!value || !['committed', 'not_committed', 'unknown'].includes(value.outcome) || !['verified', 'unverified', 'changed_afterwards'].includes(value.verification) || !Array.isArray(value.changedFields) || value.changedFields.length > 100 || value.changedFields.some(f => typeof f !== 'string' || !FIELD.test(f)) || new Set(value.changedFields).size !== value.changedFields.length) fail('INVALID_MUTATION_RESULT');
  if (value.resource) resource(value.resource);
  if (value.outcome !== 'committed' && value.verification !== 'unverified') fail('INVALID_MUTATION_RESULT');
  if (value.outcome === 'not_committed' && (value.changedFields.length || value.resource)) fail('INVALID_MUTATION_RESULT');
}

/**
 * The only caller-controlled data is the command; identity is always resolved separately.
 * A journal reservation must succeed BEFORE mutation. Never auto-retry an operation.
 */
export function createPlatformFoundation(d: Dependencies) {
  return {
    async execute(request: Request, rawCommand: Command): Promise<Reply> {
      if (!rawCommand || typeof rawCommand !== 'object' || Object.keys(rawCommand).sort().join(',') !== 'action,input,requestId,resource') fail('INVALID_COMMAND');
      // Snapshot JSON so caller mutation during asynchronous auth/hash cannot change what is executed.
      const command = JSON.parse(canonicalIntent(rawCommand)) as Command;
      if (typeof command.requestId !== 'string' || !UUID.test(command.requestId)) fail('INVALID_REQUEST_ID');
      id(command.action); resource(command.resource);
      const operation = d.operations.get(command.action);
      if (!operation) fail('UNKNOWN_OPERATION');
      scopes(operation.requiredScopes);
      if (!operation.requiredScopes.length) fail('OPERATION_SCOPE_REQUIRED');
      let actor = await resolve(d, request, operation.requiredScopes);
      const draft: Entry = {
        version: 1, requestId: command.requestId, actor, action: command.action,
        resource: Object.freeze({ ...command.resource }), resultResource: null,
        intentHash: await hash(canonicalIntent(command)), startedAt: time(d.now()),
        completedAt: null, state: 'reserved', verification: 'unverified', changedFields: [], code: 'RESERVED',
      };
      // Recheck before reserving: no action on a connection revoked during authentication/hash.
      const freshActor = await resolve(d, request, operation.requiredScopes);
      if (!sameActor(actor, freshActor)) fail('CONNECTION_BINDING_MISMATCH');
      actor = freshActor;
      let reservation;
      try { reservation = await d.journal.reserve(structuredClone(draft)); }
      catch { return fail('JOURNAL_UNAVAILABLE'); }
      const saved = reservation.entry;
      if (!sameReservation(saved, draft)) fail('REQUEST_ID_CONFLICT');
      if (!reservation.inserted) {
        // A reserved entry may represent a process lost after a successful native write.
        // Return it without invoking the native mutation again.
        if (!await operation.allowed(actor, saved.resultResource ?? saved.resource)) fail('RESOURCE_FORBIDDEN');
        return reply(saved, true, true);
      }
      if (saved.state !== 'reserved') fail('INVALID_JOURNAL_RESERVATION');
      if (canonicalIntent(saved) !== canonicalIntent(draft)) fail('INVALID_JOURNAL_RESERVATION');
      const terminal = async (state: Exclude<State, 'reserved'>, code: string, mutation?: MutationResult) => {
        const next: Entry = { ...draft, state, code, completedAt: time(d.now()),
          verification: mutation?.verification ?? 'unverified',
          changedFields: [...(mutation?.changedFields ?? [])],
          resultResource: mutation?.resource ? { ...mutation.resource } : null,
        };
        try {
          const completed = await d.journal.complete(structuredClone(next));
          if (canonicalIntent(completed) !== canonicalIntent(next)) throw Error('Journal readback mismatch');
          return reply(completed, false, true);
        } catch {
          // Preserve the durable reservation; its pending state blocks repeat mutations.
          return reply({ ...next, state: 'unknown', verification: 'unverified', code: 'JOURNAL_COMPLETION_UNKNOWN' }, false, false);
        }
      };
      try {
        const latest = await resolve(d, request, operation.requiredScopes);
        if (!sameActor(actor, latest)) return terminal('denied', 'CONNECTION_BINDING_MISMATCH');
        if (!await operation.allowed(actor, command.resource)) return terminal('denied', 'RESOURCE_FORBIDDEN');
      } catch (e) { return terminal('denied', e instanceof PlatformError ? e.code : 'AUTHORIZATION_UNAVAILABLE'); }
      let out: MutationResult;
      try {
        out = await operation.mutate(actor, command.resource, command.input);
        result(out);
      } catch { return terminal('unknown', 'MUTATION_OUTCOME_UNKNOWN'); }
      if (out.outcome === 'not_committed') return terminal('failed', 'NOT_COMMITTED', out);
      if (out.outcome === 'unknown') return terminal('unknown', 'MUTATION_OUTCOME_UNKNOWN', out);
      if (out.verification !== 'verified') return terminal('unknown', 'COMMITTED_READBACK_OPEN', out);
      return terminal('succeeded', 'COMMITTED_AND_VERIFIED', out);
    },
  };
}
