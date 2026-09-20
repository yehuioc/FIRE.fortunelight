"""Real HTTP and model regression tests; all data stays in project tmp/."""
from __future__ import annotations

import csv
from contextlib import closing
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import date, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.model import compute, cents, feedback
from backend.analytics import summarize, habit_summary
from backend.database import init_db, db

TMP = ROOT / "tmp"
TMP.mkdir(exist_ok=True)


def tx(amount, type="expense", day="2026-09-20", **kwargs):
    return {"id": 1, "amount": amount, "type": type, "occurred_on": day, "category_id": "uncategorized",
            "nature": "unset", "detail_tag": "", "note": "", **kwargs}


class ModelTests(unittest.TestCase):
    def test_exact_cent_boundary_and_manual_truth(self):
        s = {"birth_date": "2000-01-01", "mode": "quick", "manual_daily_expense": .29}
        result = compute(s, [tx(.87, "income")], date(2026, 9, 20))
        self.assertEqual(result["lit_count"], 3)
        s["manual_daily_expense"] = 80
        for amount, expected in [(0, 100), (50, 99), (100, 98), (200, 97), (300, 96), (800, 90)]:
            result = compute(s, [tx(8000, "income"), tx(amount)] if amount else [tx(8000, "income")], date(2026, 9, 20))
            self.assertEqual(result["lit_count"], expected)
        for value in ["0.001", "1.005", "NaN", "Infinity", True, -1]:
            with self.assertRaises(ValueError):
                cents(value)

    def test_ledger_uses_today_and_override_recalculates_cost(self):
        s = {"birth_date": "2000-01-01", "mode": "advanced", "expense_mode": "ledger"}
        rows = [tx(100, day="2026-09-01"), tx(500, "income", "2026-09-02")]
        result = compute(s, rows, date(2026, 9, 20))
        self.assertEqual((result["tracking_days"], result["avg_daily_expense"], result["lit_count"]), (20, 5, 80))
        s["tracking_days_override"] = 10
        result = compute(s, rows, date(2026, 9, 20))
        self.assertEqual((result["avg_daily_expense"], result["lit_count"]), (10, 40))

    def test_opening_does_not_distort_observation_or_habits(self):
        s = {"birth_date": "2000-01-01", "mode": "advanced", "expense_mode": "ledger"}
        rows = [tx(10000, "income", "2020-01-01", system_kind="opening_balance"), tx(100, day="2026-09-20")]
        result = compute(s, rows, date(2026, 9, 20))
        self.assertEqual(result["tracking_days"], 1)
        self.assertEqual(habit_summary(rows, today=date(2026, 9, 20))["recorded_days"], 1)

    def test_future_and_target_age_boundary(self):
        s = {"birth_date": "2004-02-29", "target_age": 21, "mode": "quick", "manual_daily_expense": 100}
        result = compute(s, [tx(10000, "income", "2025-02-28")], date(2025, 2, 28))
        self.assertEqual(result["future_cells"], 0)
        self.assertEqual(result["lit_count"], 0)
        self.assertFalse(result["fully_covered"])
        s["target_age"] = 80
        result = compute(s, [tx(100, "income", "2027-01-01")], date(2026, 9, 20))
        self.assertEqual(result["excluded_count"], 1)

    def test_ledger_calibration_is_not_a_reward(self):
        s = {"birth_date": "2000-01-01", "mode": "advanced", "expense_mode": "ledger"}
        rows = [tx(10000, "income", system_kind="opening_balance")]
        before = compute(s, rows, date(2026, 9, 20))
        after = compute(s, rows + [tx(100)], date(2026, 9, 20))
        result = feedback(before, after)
        self.assertEqual(result["animation"], "none")
        self.assertTrue(result["recalibrated"])
        self.assertFalse(result["celebrate"])

    def test_calendar_comparison_and_no_double_count(self):
        rows = [tx(30, day="2026-03-10", category_id="meal", detail_tag="午餐"), tx(20, day="2026-02-10"), tx(500, day="2026-02-25")]
        report = summarize(rows, "month", date(2026, 3, 20), today=date(2026, 3, 20))
        self.assertEqual(report["previous_end"], "2026-02-20")
        self.assertEqual(report["previous_total"], 20)
        self.assertEqual(sum(x["amount"] for x in report["categories"]), report["total"])
        self.assertEqual(sum(x["amount"] for x in report["trend"]), report["total"])
        report = summarize(rows, "month", date(2026, 3, 31), today=date(2026, 3, 31))
        self.assertEqual(report["previous_end"], "2026-02-28")

    def test_habits_preserve_yesterday_streak_and_longest(self):
        rows = [tx(1, day=f"2026-09-{d:02}") for d in range(13, 20)]
        h = habit_summary(rows, today=date(2026, 9, 20))
        self.assertEqual((h["current_streak"], h["longest_streak"]), (7, 7))
        h = habit_summary(rows, today=date(2026, 9, 21))
        self.assertEqual((h["current_streak"], h["longest_streak"]), (0, 7))


class MigrationTests(unittest.TestCase):
    def test_legacy_data_is_backed_up_and_preserved(self):
        with tempfile.TemporaryDirectory(dir=TMP) as folder:
            path = Path(folder) / "legacy.db"
            with db(path) as conn:
                conn.executescript("""CREATE TABLE settings(id INTEGER PRIMARY KEY,birth_date TEXT,target_age INTEGER,currency TEXT,created_at TEXT);
                CREATE TABLE transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_on TEXT,type TEXT,amount REAL,note TEXT,created_at TEXT);
                CREATE UNIQUE INDEX idx_tx_dedup ON transactions(occurred_on,type,amount);
                INSERT INTO settings VALUES(1,'2000-01-01',80,'CNY','2020-01-01');
                INSERT INTO transactions VALUES(1,'2026-01-01','expense',0.29,'旧账','2026-01-01');""")
            init_db(path)
            with db(path) as conn:
                old = dict(conn.execute("SELECT * FROM transactions").fetchone())
                self.assertEqual((old["amount"], old["amount_cents"], old["note"], old["category_id"], old["nature"]), (.29, 29, "旧账", "uncategorized", "unset"))
                conn.execute("INSERT INTO transactions(occurred_on,type,amount,note,created_at) VALUES('2026-01-01','expense',0.29,'另一笔','2026-01-01')")
            backups = list((Path(folder) / "backups").glob("*.db"))
            self.assertEqual(len(backups), 1)
            with closing(sqlite3.connect(backups[0])) as conn:
                self.assertEqual(conn.execute("SELECT count(*) FROM transactions").fetchone()[0], 1)
            init_db(path)
            self.assertEqual(len(list((Path(folder) / "backups").glob("*.db"))), 1)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(dir=TMP)
        cls.db_path = Path(cls.directory.name) / "test.db"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{cls.port}"
        cls.log = open(Path(cls.directory.name) / "server.log", "w", encoding="utf-8")
        env = {**os.environ, "FORTUNE_DB_PATH": str(cls.db_path), "PYTHONUTF8": "1"}
        cls.server = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(cls.port)], cwd=ROOT, env=env, stdout=cls.log, stderr=cls.log, creationflags=0x08000000 if os.name == "nt" else 0)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                with urlopen(cls.url + "/api/health", timeout=1):
                    return
            except OSError:
                time.sleep(.1)
        cls.server.terminate()
        cls.log.close()
        raise RuntimeError((Path(cls.directory.name) / "server.log").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.log.close()
        cls.directory.cleanup()

    def request(self, path, data=None, method=None, headers=None, expected=200, raw=False):
        payload = json.dumps(data).encode() if data is not None else None
        request = Request(self.url + path, data=payload, method=method or ("POST" if payload else "GET"), headers={"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(request, timeout=15)
        except HTTPError as exc:
            response = exc
        content = response.read().decode("utf-8")
        self.assertEqual(response.status, expected, content[:1000])
        return content if raw else json.loads(content)

    def setUp(self):
        blank = {"schema": "fortune-light-backup", "version": 1, "settings": None, "transactions": [], "expense_presets": []}
        preview = self.request("/api/backup/preview", blank)
        self.request("/api/backup/restore", {"document": blank, **preview, "confirm": True})

    def setup_ledger(self, **overrides):
        values = {"birth_date": "2000-01-01", "mode": "quick", "manual_daily_expense": "100.00", "opening_balance": "10000", "ritual_enabled": False, **overrides}
        return self.request("/api/settings", values)

    def test_real_crud_same_price_and_idempotency(self):
        self.setup_ledger()
        body = {"type": "expense", "amount": "50.00", "note": "午餐", "category_id": "meal", "nature": "necessary", "entry_key": "test-1"}
        first = self.request("/api/transactions", body)
        self.assertEqual(first["stats"]["lit_count"], 99)
        replay = self.request("/api/transactions", body)
        self.assertTrue(replay["replayed"])
        self.request("/api/transactions", {**body, "amount": "51.00"}, expected=409)
        second = self.request("/api/transactions", {**body, "entry_key": "test-2"})
        self.assertNotEqual(first["transaction"]["id"], second["transaction"]["id"])
        edited = self.request(f"/api/transactions/{first['transaction']['id']}", {**body, "amount": "25.00"}, "PUT")
        self.assertEqual(edited["stats"]["total_expense"], 75)
        self.assertEqual(edited["animation"], "none")
        self.request(f"/api/transactions/{first['transaction']['id']}", method="DELETE")
        self.assertEqual(self.request("/api/state")["stats"]["total_expense"], 50)
        self.request("/api/transactions/99999", method="DELETE", expected=404)
        self.request("/api/transactions/1", method="DELETE", expected=409)

    def test_invalid_money_date_and_cross_site_cannot_write(self):
        self.setup_ledger()
        for amount in ["0.001", "1.005", "NaN", "Infinity", 0, -1, True]:
            self.request("/api/transactions", {"type": "expense", "amount": amount}, expected=422)
        self.request("/api/transactions", {"type": "expense", "amount": 1, "occurred_on": "2026-02-30"}, expected=422)
        self.request("/api/transactions", {"type": "expense", "amount": 1, "occurred_on": (date.today()+timedelta(days=1)).isoformat()}, expected=422)
        self.request("/api/transactions", {"type": "expense", "amount": 1}, headers={"Origin": "https://evil.example"}, expected=403)
        self.request("/api/state", headers={"Sec-Fetch-Site": "cross-site"}, expected=403)
        self.request("/api/transactions?limit=-1", expected=422)
        self.assertEqual(self.request("/api/state")["transaction_count"], 1)

    def test_backup_roundtrip_and_stale_preview(self):
        self.setup_ledger(theme="paper", home_module_order=["entry", "life", "overview", "habits"])
        self.request("/api/presets", {"category_id": "meal", "label": "日常午餐", "nature": "necessary", "note": "工作日"})
        self.request("/api/transactions", {"type": "expense", "amount": "29.90", "detail_tag": "日常午餐", "category_id": "meal"})
        original = self.request("/api/backup")
        preview = self.request("/api/backup/preview", original)
        self.request("/api/transactions", {"type": "expense", "amount": 1})
        self.request("/api/backup/restore", {"document": original, **preview, "confirm": True}, expected=409)
        preview = self.request("/api/backup/preview", original)
        result = self.request("/api/backup/restore", {"document": original, **preview, "confirm": True})
        self.assertTrue(Path(result["recovery_backup"]).is_file())
        restored = self.request("/api/backup")
        for key in ("settings", "transactions", "expense_presets", "habit_state"):
            self.assertEqual(original[key], restored[key])
        duplicate = {**original, "transactions": original["transactions"] * 2}
        self.request("/api/backup/preview", duplicate, expected=422)
        self.assertEqual(self.request("/api/backup")["transactions"], restored["transactions"])

    def test_wechat_backup_and_future_record_preserved(self):
        data = {"schema": "wealth-freedom-beacon-backup", "version": 2,
                "settings": {"birth_date": "2000-01-01", "target_age": 80, "mode": "quick", "manual_daily_expense": 80, "font_scale": "large"},
                "transactions": [tx(8000, "income", id=1, system_kind="opening_balance"), tx(800, id=2, day="2090-01-01", category_id="meal")],
                "expense_presets": [{"id": 5, "category_id": "meal", "label": "午餐"}]}
        preview = self.request("/api/backup/preview", data)
        restored = self.request("/api/backup/restore", {"document": data, **preview, "confirm": True})["state"]
        self.assertEqual(restored["settings"]["font_scale"], 110)
        self.assertEqual(restored["stats"]["lit_count"], 100)
        self.assertEqual(restored["stats"]["excluded_count"], 1)
        self.assertEqual(restored["transaction_count"], 2)

    def test_opening_date_stable_and_advanced_dormant(self):
        self.setup_ledger(mode="advanced", expense_mode="ledger", tracking_days_override=30, initial_assets=1000, use_initial_assets=True)
        original = self.request("/api/backup")["transactions"][0]
        self.setup_ledger(opening_balance=20000)
        current = self.request("/api/backup")["transactions"][0]
        self.assertEqual(current["occurred_on"], original["occurred_on"])
        state = self.request("/api/state")
        self.assertEqual(state["settings"]["advanced_dormant"]["tracking_days_override"], 30)
        self.assertEqual(state["stats"]["asset_freedom"], 0)

    def test_csv_neutralizes_formula_and_classification(self):
        self.setup_ledger()
        self.request("/api/transactions", {"type": "expense", "amount": 100, "note": '=HYPERLINK("bad")', "category_id": "meal", "nature": "necessary"})
        report = self.request("/api/analysis")
        self.assertEqual(report["total"], 100)
        self.assertEqual(report["categories"][0]["share"], 100)
        text = self.request("/api/analysis.csv", raw=True)
        rows = list(csv.reader(io.StringIO(text)))
        self.assertEqual(rows[-1][-1], '\'=HYPERLINK("bad")')

    def test_long_ledger_restore_and_last_page(self):
        self.setup_ledger()
        original = self.request("/api/backup")
        when = date.today().isoformat()
        original["transactions"] = [{"id": i + 1, "occurred_on": when,
            "type": "income" if i % 2 == 0 else "expense", "amount": 1,
            "note": f"long-{i}", "created_at": when} for i in range(50000)]
        preview = self.request("/api/backup/preview", original)
        self.request("/api/backup/restore", {"document": original, **preview, "confirm": True})
        state = self.request("/api/state")
        self.assertEqual(state["transaction_count"], 50000)
        self.assertEqual(state["stats"]["total_income"], 25000)
        exported = self.request("/api/backup")
        self.assertEqual(len(exported["transactions"]), 50000)
        self.assertEqual(exported["transactions"][-1]["note"], "long-49999")
        last_page = self.request("/api/transactions?limit=100&offset=49900")
        self.assertEqual(len(last_page["transactions"]), 100)


if __name__ == "__main__":
    unittest.main()
