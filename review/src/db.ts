import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Annotation, Decision, DecisionValue, Review, ReviewStatus } from './types.js';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL,
  asset_id       INTEGER NOT NULL,
  version        INTEGER NOT NULL,
  asset_owner_id INTEGER NOT NULL,
  status         TEXT    NOT NULL CHECK (status IN ('in_review', 'changes_requested', 'approved')),
  created_by     INTEGER NOT NULL,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_workspace ON reviews (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_asset ON reviews (asset_id);
-- At most one open review per asset.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_open_per_asset
  ON reviews (asset_id) WHERE status IN ('in_review', 'changes_requested');

CREATE TABLE IF NOT EXISTS annotations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id   INTEGER NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  author_id   INTEGER NOT NULL,
  author_name TEXT    NOT NULL,
  x_pct       REAL    NOT NULL,
  y_pct       REAL    NOT NULL,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  UNIQUE (review_id, number)
);

CREATE TABLE IF NOT EXISTS decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id     INTEGER NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  reviewer_id   INTEGER NOT NULL,
  reviewer_name TEXT    NOT NULL,
  decision      TEXT    NOT NULL CHECK (decision IN ('approve', 'request_changes')),
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_review ON annotations (review_id);
CREATE INDEX IF NOT EXISTS idx_decisions_review ON decisions (review_id);
`;

export function openDatabase(dbPath: string): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

/** ISO 8601 UTC timestamp without milliseconds, e.g. 2026-10-13T09:30:00Z. */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

type ReviewRow = Omit<Review, 'annotations' | 'decisions'>;

export interface ReviewFilter {
  workspaceId?: number;
  assetId?: number;
  status?: ReviewStatus;
}

export interface NewReview {
  workspace_id: number;
  asset_id: number;
  version: number;
  asset_owner_id: number;
  created_by: number;
}

export interface NewAnnotation {
  author_id: number;
  author_name: string;
  x_pct: number;
  y_pct: number;
  body: string;
}

export interface NewDecision {
  reviewer_id: number;
  reviewer_name: string;
  decision: DecisionValue;
  note: string;
}

/** Thin data access layer over the review tables. */
export class ReviewStore {
  constructor(private readonly db: DB) {}

  private annotationsFor(reviewIds: number[]): Map<number, Annotation[]> {
    const out = new Map<number, Annotation[]>();
    if (reviewIds.length === 0) return out;
    const placeholders = reviewIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM annotations WHERE review_id IN (${placeholders}) ORDER BY number`)
      .all(...reviewIds) as Annotation[];
    for (const row of rows) {
      const list = out.get(row.review_id) ?? [];
      list.push(row);
      out.set(row.review_id, list);
    }
    return out;
  }

  private decisionsFor(reviewIds: number[]): Map<number, Decision[]> {
    const out = new Map<number, Decision[]>();
    if (reviewIds.length === 0) return out;
    const placeholders = reviewIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM decisions WHERE review_id IN (${placeholders}) ORDER BY id`)
      .all(...reviewIds) as Decision[];
    for (const row of rows) {
      const list = out.get(row.review_id) ?? [];
      list.push(row);
      out.set(row.review_id, list);
    }
    return out;
  }

  private hydrate(rows: ReviewRow[]): Review[] {
    const ids = rows.map((r) => r.id);
    const annotations = this.annotationsFor(ids);
    const decisions = this.decisionsFor(ids);
    return rows.map((r) => ({
      ...r,
      annotations: annotations.get(r.id) ?? [],
      decisions: decisions.get(r.id) ?? [],
    }));
  }

  get(id: number): Review | undefined {
    const row = this.db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as ReviewRow | undefined;
    return row ? this.hydrate([row])[0] : undefined;
  }

  list(filter: ReviewFilter): Review[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.workspaceId !== undefined) {
      where.push('workspace_id = ?');
      params.push(filter.workspaceId);
    }
    if (filter.assetId !== undefined) {
      where.push('asset_id = ?');
      params.push(filter.assetId);
    }
    if (filter.status !== undefined) {
      where.push('status = ?');
      params.push(filter.status);
    }
    const sql =
      'SELECT * FROM reviews' +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY created_at DESC, id DESC';
    return this.hydrate(this.db.prepare(sql).all(...params) as ReviewRow[]);
  }

  findOpenForAsset(assetId: number): ReviewRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM reviews WHERE asset_id = ? AND status IN ('in_review', 'changes_requested') LIMIT 1",
      )
      .get(assetId) as ReviewRow | undefined;
  }

  create(input: NewReview): Review {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO reviews (workspace_id, asset_id, version, asset_owner_id, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'in_review', ?, ?, ?)`,
      )
      .run(input.workspace_id, input.asset_id, input.version, input.asset_owner_id, input.created_by, ts, ts);
    return this.get(Number(result.lastInsertRowid))!;
  }

  addAnnotation(reviewId: number, input: NewAnnotation): Annotation {
    const insert = this.db.transaction(() => {
      const { next } = this.db
        .prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM annotations WHERE review_id = ?')
        .get(reviewId) as { next: number };
      const ts = nowIso();
      const result = this.db
        .prepare(
          `INSERT INTO annotations (review_id, number, author_id, author_name, x_pct, y_pct, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(reviewId, next, input.author_id, input.author_name, input.x_pct, input.y_pct, input.body, ts);
      this.touch(reviewId, ts);
      return this.db
        .prepare('SELECT * FROM annotations WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Annotation;
    });
    return insert();
  }

  /** Records a decision and moves the review to the resulting status atomically. */
  addDecision(reviewId: number, input: NewDecision, status: ReviewStatus): Decision {
    const insert = this.db.transaction(() => {
      const ts = nowIso();
      const result = this.db
        .prepare(
          `INSERT INTO decisions (review_id, reviewer_id, reviewer_name, decision, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(reviewId, input.reviewer_id, input.reviewer_name, input.decision, input.note, ts);
      this.db.prepare('UPDATE reviews SET status = ?, updated_at = ? WHERE id = ?').run(status, ts, reviewId);
      return this.db
        .prepare('SELECT * FROM decisions WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Decision;
    });
    return insert();
  }

  moveToVersion(reviewId: number, version: number): void {
    this.db
      .prepare("UPDATE reviews SET version = ?, status = 'in_review', updated_at = ? WHERE id = ?")
      .run(version, nowIso(), reviewId);
  }

  private touch(reviewId: number, ts: string): void {
    this.db.prepare('UPDATE reviews SET updated_at = ? WHERE id = ?').run(ts, reviewId);
  }
}

/** True when the error is a SQLite unique constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
