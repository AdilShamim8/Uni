"""SQLite persistence.

One file, zero servers. Every table a beginner would care about is here:
tasks + their event log (the replayable "what happened"), memory sources,
documents, chunks (with a full-text index), facts, helpers, notes, to-dos,
drafts and approvals.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT, prompt TEXT NOT NULL, helper_id TEXT,
  profile TEXT DEFAULT 'balanced', status TEXT NOT NULL, result TEXT, error TEXT,
  usage TEXT DEFAULT '{}', recipe_id TEXT, created_at REAL, updated_at REAL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, seq INTEGER NOT NULL,
  type TEXT NOT NULL, data TEXT NOT NULL, created_at REAL
);
CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id, seq);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER DEFAULT 1,
  private INTEGER DEFAULT 0, config TEXT DEFAULT '{}', status TEXT DEFAULT 'ready',
  last_sync REAL, created_at REAL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, external_id TEXT, title TEXT, mime TEXT,
  url TEXT, modified TEXT, hash TEXT, chars INTEGER DEFAULT 0, created_at REAL
);
CREATE INDEX IF NOT EXISTS idx_docs_source ON documents(source_id);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, source_id TEXT NOT NULL, position INTEGER,
  text TEXT NOT NULL, tokens INTEGER, embedder TEXT, embedding TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, title, text);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, pinned INTEGER DEFAULT 0, source_task TEXT,
  created_at REAL
);

CREATE TABLE IF NOT EXISTS helpers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, color TEXT, tagline TEXT,
  instructions TEXT, tools TEXT DEFAULT '[]', profile TEXT DEFAULT 'balanced',
  builtin INTEGER DEFAULT 0, created_at REAL
);

CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, task_id TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, text TEXT, due TEXT, done INTEGER DEFAULT 0, task_id TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, kind TEXT, to_addr TEXT, subject TEXT, body TEXT, task_id TEXT, created_at REAL);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT, tool TEXT, input TEXT, reason TEXT,
  status TEXT DEFAULT 'pending', created_at REAL, decided_at REAL
);
"""

JSON_COLUMNS = {"usage", "config", "tools", "input", "data"}


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def now() -> float:
    return time.time()


class Store:
    """Thin, thread-safe wrapper around a single SQLite connection."""

    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            if self.path != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------------ core
    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cur

    def executemany(self, sql: str, rows: List[Iterable[Any]]) -> None:
        with self._lock:
            self._conn.executemany(sql, rows)
            self._conn.commit()

    def query(self, sql: str, params: Iterable[Any] = ()) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(sql, tuple(params)).fetchall()
        return [self._decode(dict(r)) for r in rows]

    def one(self, sql: str, params: Iterable[Any] = ()) -> Optional[Dict[str, Any]]:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    @staticmethod
    def _decode(row: Dict[str, Any]) -> Dict[str, Any]:
        for key in JSON_COLUMNS & row.keys():
            if isinstance(row[key], str):
                try:
                    row[key] = json.loads(row[key])
                except ValueError:
                    pass
        return row

    # ------------------------------------------------------------ generic CRUD
    def insert(self, table: str, row: Dict[str, Any]) -> Dict[str, Any]:
        row = dict(row)
        row.setdefault("created_at", now())
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        values = [json.dumps(v) if k in JSON_COLUMNS and not isinstance(v, str) else v for k, v in row.items()]
        self.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", values)
        return row

    def update(self, table: str, row_id: str, changes: Dict[str, Any]) -> None:
        if not changes:
            return
        sets = ", ".join(f"{k} = ?" for k in changes)
        values = [json.dumps(v) if k in JSON_COLUMNS and not isinstance(v, str) else v for k, v in changes.items()]
        self.execute(f"UPDATE {table} SET {sets} WHERE id = ?", [*values, row_id])

    def get(self, table: str, row_id: str) -> Optional[Dict[str, Any]]:
        return self.one(f"SELECT * FROM {table} WHERE id = ?", [row_id])

    def delete(self, table: str, row_id: str) -> None:
        self.execute(f"DELETE FROM {table} WHERE id = ?", [row_id])

    # --------------------------------------------------------------- settings
    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self.one("SELECT value FROM settings WHERE key = ?", [key])
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except ValueError:
            return row["value"]

    def set_setting(self, key: str, value: Any) -> None:
        self.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, json.dumps(value)],
        )
