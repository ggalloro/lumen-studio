import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import Settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS brand_kits (
    workspace_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    palette TEXT NOT NULL DEFAULT '[]',
    fonts TEXT NOT NULL DEFAULT '[]',
    tone_of_voice TEXT NOT NULL DEFAULT '',
    logo_rules TEXT NOT NULL DEFAULT '',
    palette_tolerance REAL NOT NULL DEFAULT 18,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    overall TEXT NOT NULL,
    score INTEGER NOT NULL,
    rules TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_asset ON reports (asset_id, version);
"""

DEFAULT_WORKSPACE_ID = 1
DEFAULT_KIT_NAME = "Northwind Outdoor"
DEFAULT_TOLERANCE = 18


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def connect(settings: Settings):
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    with connect(settings) as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM brand_kits").fetchone()[0] == 0:
            create_empty_kit(conn, DEFAULT_WORKSPACE_ID, DEFAULT_KIT_NAME)


def create_empty_kit(conn: sqlite3.Connection, workspace_id: int, name: str = "") -> None:
    conn.execute(
        "INSERT OR IGNORE INTO brand_kits (workspace_id, name, palette_tolerance, updated_at)"
        " VALUES (?, ?, ?, ?)",
        (workspace_id, name, DEFAULT_TOLERANCE, utc_now()),
    )


def _number(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


def get_kit(conn: sqlite3.Connection, workspace_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM brand_kits WHERE workspace_id = ?", (workspace_id,)
    ).fetchone()
    if row is None:
        create_empty_kit(conn, workspace_id)
        row = conn.execute(
            "SELECT * FROM brand_kits WHERE workspace_id = ?", (workspace_id,)
        ).fetchone()
    return {
        "workspace_id": row["workspace_id"],
        "name": row["name"],
        "palette": json.loads(row["palette"]),
        "fonts": json.loads(row["fonts"]),
        "tone_of_voice": row["tone_of_voice"],
        "logo_rules": row["logo_rules"],
        "palette_tolerance": _number(row["palette_tolerance"]),
        "updated_at": row["updated_at"],
    }


def save_kit(conn: sqlite3.Connection, kit: dict) -> None:
    conn.execute(
        "UPDATE brand_kits SET name = ?, palette = ?, fonts = ?, tone_of_voice = ?,"
        " logo_rules = ?, palette_tolerance = ?, updated_at = ? WHERE workspace_id = ?",
        (
            kit["name"],
            json.dumps(kit["palette"]),
            json.dumps(kit["fonts"]),
            kit["tone_of_voice"],
            kit["logo_rules"],
            kit["palette_tolerance"],
            kit["updated_at"],
            kit["workspace_id"],
        ),
    )


def insert_report(conn: sqlite3.Connection, workspace_id: int, report: dict) -> dict:
    created_at = utc_now()
    cur = conn.execute(
        "INSERT INTO reports (workspace_id, asset_id, version, overall, score, rules,"
        " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            workspace_id,
            report["asset_id"],
            report["version"],
            report["overall"],
            report["score"],
            json.dumps(report["rules"]),
            created_at,
        ),
    )
    return {"id": cur.lastrowid, **report, "created_at": created_at}


def report_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "asset_id": row["asset_id"],
        "version": row["version"],
        "overall": row["overall"],
        "score": row["score"],
        "rules": json.loads(row["rules"]),
        "created_at": row["created_at"],
    }


def list_reports(
    conn: sqlite3.Connection,
    asset_id: int,
    version: int | None = None,
    workspace_id: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    sql = "SELECT * FROM reports WHERE asset_id = ?"
    params: list = [asset_id]
    if version is not None:
        sql += " AND version = ?"
        params.append(version)
    if workspace_id is not None:
        sql += " AND workspace_id = ?"
        params.append(workspace_id)
    sql += " ORDER BY id DESC"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    return [report_to_dict(r) for r in conn.execute(sql, params).fetchall()]
