// SPDX-License-Identifier: AGPL-3.0-or-later
/** Local durable reference adapter, tested with node:sqlite. Not wired to Workers or Nextcloud. */
import { canonicalIntent, PlatformError, type Connection, type Entry, type Journal } from './platform-foundation';

type Row = Record<string, unknown>;
export interface ReferenceDatabase {
  prepare(sql: string): {
    run(...values: (string | number | null)[]): { changes: number | bigint };
    get(...values: (string | number | null)[]): Row | undefined;
    all(...values: (string | number | null)[]): Row[];
  };
}
export class PlatformReferenceStore implements Journal {
  constructor(private readonly db: ReferenceDatabase) {}
  /** Trusted provisioning adapter only; never expose this method as unauthenticated registration. */
  provision(c: Connection): void {
    this.db.prepare(`INSERT INTO nf_platform_connections
      (id,tenant_id,owner_uid,auth_subject,client_id,audience,channel,provider,display_name,scopes_json,revision,revoked_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.id,c.tenantId,c.ownerUid,c.authSubject,c.clientId,c.audience,c.channel,c.provider,c.displayName,JSON.stringify(c.scopes),c.revision,c.revokedAt);
  }
  async connection(id: string): Promise<Connection | null> {
    const r = this.db.prepare('SELECT * FROM nf_platform_connections WHERE id = ?').get(id);
    if (!r) return null;
    return { id: String(r.id), tenantId: String(r.tenant_id), ownerUid: String(r.owner_uid),
      authSubject: String(r.auth_subject), clientId: String(r.client_id), audience: String(r.audience),
      channel: r.channel as Connection['channel'], provider: String(r.provider), displayName: String(r.display_name),
      scopes: JSON.parse(String(r.scopes_json)), revision: Number(r.revision), revokedAt: r.revoked_at === null ? null : String(r.revoked_at) };
  }
  revoke(tenantId: string, ownerUid: string, id: string, at: string): boolean {
    return Number(this.db.prepare('UPDATE nf_platform_connections SET revoked_at = ?, revision = revision + 1 WHERE tenant_id = ? AND owner_uid = ? AND id = ? AND revoked_at IS NULL').run(at,tenantId,ownerUid,id).changes) === 1;
  }
  private read(tenant: string, request: string): Entry {
    const row = this.db.prepare('SELECT entry_json FROM nf_platform_actions WHERE tenant_id = ? AND request_id = ?').get(tenant,request);
    if (!row) throw new PlatformError('JOURNAL_ENTRY_MISSING');
    return JSON.parse(String(row.entry_json));
  }
  async reserve(entry: Entry): Promise<{ inserted: boolean; entry: Entry }> {
    if (entry.state !== 'reserved' || entry.completedAt !== null) throw new PlatformError('INVALID_RESERVATION');
    const r = this.db.prepare(`INSERT INTO nf_platform_actions
      (tenant_id,request_id,owner_uid,connection_id,connection_revision,intent_hash,state,entry_json)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,request_id) DO NOTHING`).run(
        entry.actor.tenantId,entry.requestId,entry.actor.ownerUid,entry.actor.connectionId,entry.actor.revision,entry.intentHash,entry.state,canonicalIntent(entry));
    return { inserted: Number(r.changes) === 1, entry: this.read(entry.actor.tenantId,entry.requestId) };
  }
  async complete(entry: Entry): Promise<Entry> {
    if (entry.state === 'reserved' || entry.completedAt === null) throw new PlatformError('INVALID_COMPLETION');
    const before = this.read(entry.actor.tenantId,entry.requestId);
    if (before.state !== 'reserved') {
      if (canonicalIntent(before) === canonicalIntent(entry)) return before;
      throw new PlatformError('TERMINAL_ACTION_CONFLICT');
    }
    const expected = { ...entry, state: 'reserved', completedAt: null, resultResource: null, verification: 'unverified', changedFields: [], code: 'RESERVED' };
    if (canonicalIntent(expected) !== canonicalIntent(before)) throw new PlatformError('ACTION_BINDING_CONFLICT');
    const r = this.db.prepare(`UPDATE nf_platform_actions SET state = ?, entry_json = ?
      WHERE tenant_id = ? AND request_id = ? AND state = 'reserved' AND intent_hash = ?
      AND owner_uid = ? AND connection_id = ? AND connection_revision = ?`).run(
        entry.state,canonicalIntent(entry),entry.actor.tenantId,entry.requestId,entry.intentHash,entry.actor.ownerUid,entry.actor.connectionId,entry.actor.revision);
    if (Number(r.changes) !== 1) throw new PlatformError('JOURNAL_COMPLETION_CONFLICT');
    return this.read(entry.actor.tenantId,entry.requestId);
  }
  /** Caller must first be resolved from a trusted session; never pass a body ownerUid. */
  history(tenantId: string, ownerUid: string, limit = 100): Entry[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new PlatformError('INVALID_LIMIT');
    return this.db.prepare('SELECT entry_json FROM nf_platform_actions WHERE tenant_id = ? AND owner_uid = ? ORDER BY rowid DESC LIMIT ?').all(tenantId,ownerUid,limit).map(r => JSON.parse(String(r.entry_json)));
  }
}
