"""CLI preview and repeated-source safety against a synthetic bank CSV."""
import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ImportTests(unittest.TestCase):
    def test_preview_same_price_events_and_cutoff_idempotency(self):
        (ROOT / "tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / "tmp") as folder:
            folder = Path(folder)
            ledger = folder / "ledger.db"
            source = folder / "bank.csv"
            source.write_text("日期,金额,摘要\n2026-01-01,+100.00,收入\n2026-02-01,-10.00,午餐\n2026-02-01,-10.00,午餐\n", encoding="utf-8-sig")
            def execute(*args):
                result = subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "backend/import_bills.py"), str(source), *args],
                    env={**os.environ, "FORTUNE_DB_PATH": str(ledger)}, cwd=ROOT,
                    capture_output=True, text=True, encoding="utf-8", timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                summaries = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
                return summaries[-1]
            self.assertEqual(execute()["new_rows"], 3)
            self.assertFalse(ledger.exists())
            self.assertEqual(execute("--since", "2026-02-01", "--apply")["new_rows"], 2)
            self.assertEqual(execute("--apply")["new_rows"], 1)
            self.assertEqual(execute("--apply")["new_rows"], 0)
            with closing(sqlite3.connect(ledger)) as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 3)
                self.assertEqual(conn.execute("SELECT SUM(amount_cents) FROM transactions WHERE type='expense'").fetchone()[0], 2000)
            self.assertTrue(list((folder / "backups").glob("*.db")))
