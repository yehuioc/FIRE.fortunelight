"""Shared SQLite setup for the local fortune ledger."""
from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import datetime
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
    conn = sqlite3.connect(path, timeout=30, factory=ClosingConnection)
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
    if "config_json" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}'")
    tx_cols = {row[1] for row in conn.execute("PRAGMA table_info(transactions)")}
    for name, sql_type in {
        "amount_cents": "INTEGER", "category_id": "TEXT NOT NULL DEFAULT 'uncategorized'",
        "detail_tag": "TEXT NOT NULL DEFAULT ''", "nature": "TEXT NOT NULL DEFAULT 'unset'",
        "system_kind": "TEXT NOT NULL DEFAULT ''", "entry_key": "TEXT",
    }.items():
        if name not in tx_cols:
            conn.execute(f"ALTER TABLE transactions ADD COLUMN {name} {sql_type}")
    # The old import index incorrectly merged different same-price events.
    conn.execute("DROP INDEX IF EXISTS idx_tx_dedup")
    conn.execute("UPDATE transactions SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER) WHERE amount_cents IS NULL")
    conn.executescript("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_entry_key ON transactions(entry_key) WHERE entry_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_opening ON transactions(system_kind) WHERE system_kind = 'opening_balance';
    CREATE TABLE IF NOT EXISTS expense_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_id TEXT NOT NULL,
      label TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', nature TEXT NOT NULL DEFAULT 'unset',
      UNIQUE(category_id, label)
    );
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS tx_cents_insert AFTER INSERT ON transactions
    WHEN NEW.amount_cents IS NULL BEGIN
      UPDATE transactions SET amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER) WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS tx_cents_update AFTER UPDATE OF amount ON transactions
    WHEN NEW.amount != OLD.amount BEGIN
      UPDATE transactions SET amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER) WHERE id = NEW.id;
    END;
    PRAGMA user_version = 100;
    """)
    for table in ("settings", "transactions", "expense_presets"):
        for action in ("INSERT", "UPDATE", "DELETE"):
            conn.execute(f"""CREATE TRIGGER IF NOT EXISTS revision_{table}_{action.lower()}
                AFTER {action} ON {table} BEGIN
                INSERT INTO app_meta(key,value) VALUES('revision','1')
                ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1;
                END""")


def backup_database(path: Path = DB_PATH, reason: str = "manual") -> Path:
    """SQLite backup API includes committed WAL contents and works while open."""
    path = Path(path)
    folder = path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"ledger-{reason}-{datetime.now():%Y%m%d-%H%M%S-%f}.db"
    source = sqlite3.connect(path)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return destination


def init_db(path: Path = DB_PATH) -> None:
    path = Path(path)
    if path.exists() and path.stat().st_size:
        with closing(sqlite3.connect(path)) as old:
            version = old.execute("PRAGMA user_version").fetchone()[0]
        if version > 100:
            raise RuntimeError("数据库来自更新版本，拒绝降级打开。请使用对应版本或恢复备份。")
        if version < 100:
            backup_database(path, "before-v1-migration")
    with db(path) as conn:
        init_connection(conn)
