import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import Settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT,
    manifest TEXT
);
CREATE TABLE IF NOT EXISTS deliverables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (campaign_id, asset_id, channel)
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def connect(settings: Settings):
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    with connect(settings) as conn:
        conn.executescript(SCHEMA)


def deliverable_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "asset_id": row["asset_id"],
        "channel": row["channel"],
        "created_at": row["created_at"],
    }


def list_deliverables(conn: sqlite3.Connection, campaign_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM deliverables WHERE campaign_id = ? ORDER BY id", (campaign_id,)
    ).fetchall()
    return [deliverable_to_dict(r) for r in rows]


def campaign_to_dict(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "name": row["name"],
        "brief": row["brief"],
        "due_date": row["due_date"],
        "status": row["status"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "published_at": row["published_at"],
        "deliverables": list_deliverables(conn, row["id"]),
    }


def get_campaign_row(conn: sqlite3.Connection, campaign_id: int, workspace_id: int):
    return conn.execute(
        "SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?", (campaign_id, workspace_id)
    ).fetchone()


def manifest_of(row: sqlite3.Row) -> dict | None:
    return json.loads(row["manifest"]) if row["manifest"] else None
