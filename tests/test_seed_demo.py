from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from datetime import datetime
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
BACKEND = PROJECT / "backend"
TMP = PROJECT / "tmp"
TMP.mkdir(exist_ok=True)
sys.path.insert(0, str(BACKEND))

from database import db, init_db  # noqa: E402
from seed_demo import seed_database  # noqa: E402


class SeedDemoSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=TMP)
        self.db_path = Path(self.temp_dir.name) / "ledger.db"
        init_db(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def insert_realistic_row(self) -> None:
        with db(self.db_path) as conn:
            now = datetime.now().isoformat()
            conn.execute(
                """INSERT INTO settings
                   (id, birth_date, target_age, currency, show_past, created_at)
                   VALUES (1, '2000-01-01', 80, 'CNY', 0, ?)""",
                (now,),
            )
            conn.execute(
                """INSERT INTO transactions
                   (occurred_on, type, amount, note, created_at)
                   VALUES ('2026-01-01', 'expense', 12.5, 'original', ?)""",
                (now,),
            )

    def test_existing_transactions_require_confirmation(self) -> None:
        self.insert_realistic_row()
        with self.assertRaises(RuntimeError):
            seed_database(self.db_path, days=2, avg_expense=10, avg_income=20)
        with db(self.db_path) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT note FROM transactions").fetchone()[0], "original")

    def test_confirmed_reset_creates_restorable_backup(self) -> None:
        self.insert_realistic_row()
        result = seed_database(
            self.db_path,
            confirm_reset=True,
            days=2,
            avg_expense=10,
            avg_income=20,
        )
        backup = Path(result["backup"])
        self.assertTrue(backup.is_file())
        with closing(sqlite3.connect(backup)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT note FROM transactions").fetchone()[0], "original")
        with db(self.db_path) as conn:
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT birth_date FROM settings WHERE id = 1").fetchone()[0], "2000-01-01")

    def test_empty_database_can_be_seeded_without_reset_flag(self) -> None:
        result = seed_database(self.db_path, days=1, avg_expense=10, avg_income=20)
        self.assertGreater(result["rows"], 0)
        self.assertIsNone(result["backup"])


if __name__ == "__main__":
    unittest.main()
