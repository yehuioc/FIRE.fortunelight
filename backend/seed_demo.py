"""Safely replace the local ledger with deterministic demo transactions."""
from __future__ import annotations

import argparse
import random
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta
from pathlib import Path

from database import DB_PATH, db, init_db


DAYS = 60
TARGET_AVG_EXPENSE_PER_DAY = 70.0
TARGET_AVG_INCOME_PER_DAY = 500.0
DEFAULT_TARGET_AGE_OFFSET = 26

EXPENSE_NOTES = [
    "早餐", "午餐", "晚餐", "咖啡", "打车", "地铁", "买菜", "水电", "外卖",
    "夜宵", "理发", "书", "电影", "看牙医", "话费", "健身", "保险",
    "下午茶", "买花", "蛋糕", "茶饮", "超市", "停车", "网费",
]
INCOME_NOTES_REGULAR = ["写作收入", "课程分成", "广告", "咨询", "稿费", "推广"]
INCOME_NOTES_BIG = ["项目尾款", "课程发布", "联名合作", "客户预付", "结算"]


def backup_database(conn: sqlite3.Connection, db_path: Path) -> Path:
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / f"{db_path.stem}-before-demo-{stamp}{db_path.suffix}"
    with closing(sqlite3.connect(backup_path)) as destination:
        conn.backup(destination)
    return backup_path


def seed_database(
    db_path: Path = DB_PATH,
    *,
    confirm_reset: bool = False,
    days: int = DAYS,
    avg_expense: float = TARGET_AVG_EXPENSE_PER_DAY,
    avg_income: float = TARGET_AVG_INCOME_PER_DAY,
) -> dict:
    if days < 1 or avg_expense <= 0 or avg_income <= 0:
        raise ValueError("days, avg_expense and avg_income must be positive")

    db_path = Path(db_path).resolve()
    init_db(db_path)
    conn = db(db_path)
    try:
        existing_count = int(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0])
        if existing_count and not confirm_reset:
            raise RuntimeError(
                f"Refusing to replace {existing_count} existing transactions. "
                "Run again with --confirm-reset to create a backup and continue."
            )

        backup_path = backup_database(conn, db_path) if existing_count else None
        random.seed(42)
        conn.execute("DELETE FROM transactions")

        existing = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        today = date.today()
        if existing:
            conn.execute("""
                UPDATE settings SET
                  tracking_days_override = 0,
                  avg_daily_expense_override = 0
                WHERE id = 1
            """)
        else:
            birth = today.replace(year=today.year - DEFAULT_TARGET_AGE_OFFSET)
            conn.execute(
                """INSERT INTO settings (id, birth_date, target_age, currency, show_past,
                    use_initial_assets, initial_assets, tracking_days_override,
                    avg_daily_expense_override, created_at)
                   VALUES (1, ?, 80, 'CNY', 0, 0, 0, 0, 0, ?)""",
                (birth.isoformat(), datetime.now().isoformat()),
            )

        start = today - timedelta(days=days - 1)
        expenses: list[tuple[str, str, float, str]] = []
        incomes: list[tuple[str, str, float, str]] = []

        for offset in range(days):
            when = (start + timedelta(days=offset)).isoformat()
            count = random.choices([1, 2, 3], weights=[2, 5, 3])[0]
            for _ in range(count):
                amount = round(random.gauss(20, 8), 2)
                if random.random() < 0.05:
                    amount = round(random.uniform(150, 380), 2)
                expenses.append((when, "expense", max(amount, 3.0), random.choice(EXPENSE_NOTES)))

        expense_scale = (avg_expense * days) / sum(row[2] for row in expenses)
        expenses = [(d, t, round(a * expense_scale, 2), n) for d, t, a, n in expenses]

        for offset in range(days):
            when = (start + timedelta(days=offset)).isoformat()
            if random.random() < 0.55:
                incomes.append((when, "income", round(random.uniform(80, 350), 2), random.choice(INCOME_NOTES_REGULAR)))
            if offset > 0 and offset % random.choice([7, 8, 9, 10]) == 0:
                incomes.append((when, "income", round(random.uniform(800, 2200), 2), random.choice(INCOME_NOTES_REGULAR)))
            if random.random() < 0.08:
                incomes.append((when, "income", round(random.uniform(2500, 6000), 2), random.choice(INCOME_NOTES_BIG)))
        if not incomes:
            incomes.append((today.isoformat(), "income", avg_income * days, "演示收入"))

        income_scale = (avg_income * days) / sum(row[2] for row in incomes)
        incomes = [(d, t, round(a * income_scale, 2), n) for d, t, a, n in incomes]

        all_dates = {row[0] for row in expenses + incomes}
        if start.isoformat() not in all_dates:
            expenses.append((start.isoformat(), "expense", 5.0, "锚点"))
        if today.isoformat() not in all_dates:
            expenses.append((today.isoformat(), "expense", 5.0, "锚点"))

        rows = sorted(expenses + incomes, key=lambda row: (row[0], row[1]))
        now = datetime.now().isoformat()
        conn.executemany(
            "INSERT INTO transactions (occurred_on, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?)",
            [(*row, now) for row in rows],
        )
        conn.commit()
        return {"rows": len(rows), "days": days, "backup": backup_path, "db": db_path}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-reset", action="store_true", help="Back up and replace existing transactions")
    parser.add_argument("--db", type=Path, default=DB_PATH, help="Ledger database path")
    parser.add_argument("--days", type=int, default=DAYS)
    parser.add_argument("--avg-expense", type=float, default=TARGET_AVG_EXPENSE_PER_DAY)
    parser.add_argument("--avg-income", type=float, default=TARGET_AVG_INCOME_PER_DAY)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        result = seed_database(
            args.db,
            confirm_reset=args.confirm_reset,
            days=args.days,
            avg_expense=args.avg_expense,
            avg_income=args.avg_income,
        )
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 2

    if result["backup"]:
        print(f"Backup created: {result['backup']}")
    print(f"Seeded {result['rows']} demo transactions across {result['days']} days")
    print(f"Database: {result['db']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
