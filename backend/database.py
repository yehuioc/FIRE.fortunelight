"""Shared SQLite setup for the local fortune ledger."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("FORTUNE_DB_PATH", ROOT / "data" / "ledger.db")).resolve()


class ClosingConnection(sqlite3.Connection):
    """Commit or roll back like sqlite3.Connection, then release the file."""

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        try:
            return bool(super().__exit__(exc_type, exc_value, traceback))
        finally:
            self.close()


def db(path: Path = DB_PATH) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, factory=ClosingConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_connection(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      birth_date TEXT NOT NULL,
      target_age INTEGER NOT NULL DEFAULT 80,
      currency TEXT DEFAULT 'CNY',
      show_past INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_on TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      amount REAL NOT NULL CHECK (amount > 0),
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(occurred_on);
    """)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(settings)").fetchall()}
    if "show_past" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN show_past INTEGER NOT NULL DEFAULT 0")
    if "initial_assets" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN initial_assets REAL NOT NULL DEFAULT 0")
    if "use_initial_assets" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN use_initial_assets INTEGER NOT NULL DEFAULT 0")
    if "tracking_days_override" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN tracking_days_override INTEGER NOT NULL DEFAULT 0")
    if "avg_daily_expense_override" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN avg_daily_expense_override REAL NOT NULL DEFAULT 0")


def init_db(path: Path = DB_PATH) -> None:
    with db(path) as conn:
        init_connection(conn)
