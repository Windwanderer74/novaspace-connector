-- LOCAL REFERENCE SCHEMA ONLY: SQLite, NOT a Nextcloud/MariaDB migration.
-- Nothing in the application automatically runs this file.
PRAGMA foreign_keys = ON;
CREATE TABLE nf_platform_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  client_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('cloud_connector','local_connector','web')),
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json)),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  revoked_at TEXT
);
CREATE INDEX nf_platform_connections_owner ON nf_platform_connections(tenant_id,owner_uid);
CREATE TABLE nf_platform_actions (
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES nf_platform_connections(id),
  connection_revision INTEGER NOT NULL,
  intent_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','succeeded','failed','unknown','denied')),
  entry_json TEXT NOT NULL CHECK(json_valid(entry_json)),
  PRIMARY KEY(tenant_id,request_id)
);
CREATE INDEX nf_platform_actions_owner ON nf_platform_actions(tenant_id,owner_uid);
CREATE TRIGGER nf_platform_actions_no_delete BEFORE DELETE ON nf_platform_actions
BEGIN SELECT RAISE(ABORT,'Action history cannot be deleted by this reference adapter'); END;
CREATE TRIGGER nf_platform_actions_terminal BEFORE UPDATE ON nf_platform_actions
WHEN OLD.state <> 'reserved'
BEGIN SELECT RAISE(ABORT,'Terminal action is immutable'); END;
CREATE TRIGGER nf_platform_actions_binding BEFORE UPDATE ON nf_platform_actions
WHEN NEW.tenant_id <> OLD.tenant_id OR NEW.request_id <> OLD.request_id
 OR NEW.owner_uid <> OLD.owner_uid OR NEW.connection_id <> OLD.connection_id
 OR NEW.connection_revision <> OLD.connection_revision OR NEW.intent_hash <> OLD.intent_hash
BEGIN SELECT RAISE(ABORT,'Action identity is immutable'); END;
