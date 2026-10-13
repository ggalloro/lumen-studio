CREATE TABLE IF NOT EXISTS assets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    owner_id     INTEGER NOT NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets (workspace_id, updated_at);

CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id INTEGER NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
    tag      TEXT    NOT NULL,
    PRIMARY KEY (asset_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags (tag);

-- One row per stored file under blobs/<sha256>. The filename is the first name the
-- content was stored under and is used for Content-Disposition.
CREATE TABLE IF NOT EXISTS blobs (
    sha256       TEXT    PRIMARY KEY,
    filename     TEXT    NOT NULL,
    content_type TEXT    NOT NULL,
    size_bytes   INTEGER NOT NULL,
    created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
    asset_id     INTEGER NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
    version      INTEGER NOT NULL,
    filename     TEXT    NOT NULL,
    content_type TEXT    NOT NULL,
    size_bytes   INTEGER NOT NULL,
    width        INTEGER NOT NULL,
    height       INTEGER NOT NULL,
    sha256       TEXT    NOT NULL REFERENCES blobs (sha256),
    alt_text     TEXT    NOT NULL DEFAULT '',
    created_by   INTEGER NOT NULL,
    created_at   TEXT    NOT NULL,
    PRIMARY KEY (asset_id, version)
);

CREATE TABLE IF NOT EXISTS renditions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id   INTEGER NOT NULL,
    version    INTEGER NOT NULL,
    preset     TEXT    NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    sha256     TEXT    NOT NULL REFERENCES blobs (sha256),
    created_at TEXT    NOT NULL,
    UNIQUE (asset_id, version, preset),
    FOREIGN KEY (asset_id, version) REFERENCES versions (asset_id, version) ON DELETE CASCADE
);
