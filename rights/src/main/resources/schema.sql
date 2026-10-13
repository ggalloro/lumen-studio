CREATE TABLE IF NOT EXISTS rights (
    asset_id               INTEGER PRIMARY KEY,
    workspace_id           INTEGER NOT NULL,
    license_type           TEXT    NOT NULL,
    licensor               TEXT    NOT NULL DEFAULT '',
    channels               TEXT    NOT NULL,
    valid_from             TEXT    NOT NULL,
    expires_on             TEXT,
    model_release_required INTEGER NOT NULL DEFAULT 0,
    model_release_on_file  INTEGER NOT NULL DEFAULT 0,
    notes                  TEXT    NOT NULL DEFAULT '',
    updated_by             INTEGER NOT NULL,
    updated_at             TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rights_workspace ON rights (workspace_id);
