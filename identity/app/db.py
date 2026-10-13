import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import Settings
from .security import hash_password

SCHEMA = """
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('designer', 'reviewer', 'brand_admin')),
    avatar_color TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

DEFAULT_PASSWORD = "lumen-demo"

SEED_WORKSPACE = (1, "Northwind Outdoor")

SEED_USERS = [
    (1, "Leo Park", "leo@northwind.example", "designer", "#E8590C"),
    (2, "Ana Ruiz", "ana@northwind.example", "designer", "#2F9E44"),
    (3, "Maya Okafor", "maya@northwind.example", "reviewer", "#1C7ED6"),
    (4, "Sam Whitfield", "sam@northwind.example", "reviewer", "#AE3EC9"),
    (5, "Priya Natarajan", "priya@northwind.example", "brand_admin", "#C92A2A"),
]


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
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            _seed(conn)


def _seed(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)", SEED_WORKSPACE
    )
    now = utc_now()
    workspace_id = SEED_WORKSPACE[0]
    for user_id, name, email, role, color in SEED_USERS:
        conn.execute(
            "INSERT INTO users (id, workspace_id, name, email, role, avatar_color,"
            " password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, workspace_id, name, email, role, color,
             hash_password(DEFAULT_PASSWORD), now),
        )


def user_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "workspace_id": row["workspace_id"],
        "avatar_color": row["avatar_color"],
    }
