"""财富自由指南灯 · 后端 API
FastAPI + SQLite · 单文件 · 零业务依赖
[POS] backend/main.py — 数据持久 + 状态计算
[INPUT] sqlite3 stdlib · fastapi · pydantic
[OUTPUT] REST API on :8766 + 静态前端服务
[PROTOCOL] 变更接口先改 设计方案.md
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from math import floor
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    from .database import db, init_db
except ImportError:  # Direct execution: python backend/main.py
    from database import db, init_db

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

init_db()


# ---------- 计算核心 ----------
def compute_stats(conn) -> dict:
    rows = conn.execute(
        "SELECT type, SUM(amount) AS total FROM transactions GROUP BY type"
    ).fetchall()
    totals = {"income": 0.0, "expense": 0.0}
    for r in rows:
        totals[r["type"]] = float(r["total"] or 0)

    extrema = conn.execute(
        "SELECT MIN(occurred_on) AS first, MAX(occurred_on) AS last FROM transactions"
    ).fetchone()
    first_str = extrema["first"]
    last_str = extrema["last"]

    today = date.today()
    first_record = date.fromisoformat(first_str) if first_str else None
    last_record = date.fromisoformat(last_str) if last_str else None
    if first_record and last_record:
        # 记账天数：从第一笔到最后一笔（含未来记账日），全跨度
        tracking_days = max((last_record - first_record).days + 1, 1)
    else:
        tracking_days = 0

    avg = (totals["expense"] / tracking_days) if tracking_days > 0 and totals["expense"] > 0 else 0.0

    s = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    keys = set(s.keys()) if s else set()
    use_assets = bool(s["use_initial_assets"]) if s and "use_initial_assets" in keys else False
    initial_assets = float(s["initial_assets"]) if s and "initial_assets" in keys else 0.0
    show_past = bool(s["show_past"]) if s and "show_past" in keys else False

    # 手动覆盖（> 0 即生效，0 = 用派生值）
    td_override = int(s["tracking_days_override"]) if s and "tracking_days_override" in keys else 0
    avg_override = float(s["avg_daily_expense_override"]) if s and "avg_daily_expense_override" in keys else 0.0
    if td_override > 0:
        tracking_days = td_override
    if avg_override > 0:
        avg = avg_override

    # 资产带来的自由 + 收入净储蓄带来的自由 · 两段
    asset_freedom = floor(initial_assets / avg) if (avg > 0 and use_assets and initial_assets > 0) else 0
    net_savings = totals["income"] - totals["expense"]
    income_freedom = floor(net_savings / avg) if (avg > 0 and net_savings > 0) else 0
    freedom_days_bought = asset_freedom + income_freedom

    future_cells = 0
    past_cells = 0
    if s:
        birth = date.fromisoformat(s["birth_date"])
        try:
            end = birth.replace(year=birth.year + s["target_age"])
        except ValueError:
            end = birth.replace(year=birth.year + s["target_age"], day=28)
        future_cells = max((end - today).days, 0)
        past_cells = max((today - birth).days, 0)

    total_cells = (past_cells + future_cells) if show_past else future_cells

    asset_lit = min(asset_freedom, future_cells) if future_cells > 0 else asset_freedom
    income_lit = min(income_freedom, max(0, future_cells - asset_lit)) if future_cells > 0 else income_freedom
    lit = asset_lit + income_lit
    overflow = max(freedom_days_bought - future_cells, 0) if future_cells > 0 else 0

    # tracked_past_cells = past 区间中从今天倒推到第一笔记账日的格数
    if first_record and first_record < today and show_past:
        tracked_past_cells = min(past_cells, (today - first_record).days)
    else:
        tracked_past_cells = 0

    return {
        "total_income": round(totals["income"], 2),
        "total_expense": round(totals["expense"], 2),
        "tracking_days": tracking_days,
        "avg_daily_expense": round(avg, 4),
        "freedom_days_bought": freedom_days_bought,
        "asset_freedom": asset_freedom,
        "income_freedom": income_freedom,
        "asset_lit": asset_lit,
        "income_lit": income_lit,
        "lit_count": lit,
        "total_cells": total_cells,
        "future_cells": future_cells,
        "past_cells": past_cells if show_past else 0,
        "tracked_past_cells": tracked_past_cells,
        "show_past": show_past,
        "use_initial_assets": use_assets,
        "initial_assets": round(initial_assets, 2),
        "overflow": overflow,
        "first_record": first_str,
        "last_record": last_str,
    }


def get_settings(conn) -> Optional[dict]:
    s = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    return dict(s) if s else None


# ---------- API Models ----------
class SettingsIn(BaseModel):
    birth_date: str = Field(..., description="YYYY-MM-DD")
    target_age: int = Field(80, ge=1, le=150)
    currency: str = "CNY"
    show_past: bool = False
    use_initial_assets: bool = False
    initial_assets: float = Field(0.0, ge=0)
    tracking_days_override: int = Field(0, ge=0)
    avg_daily_expense_override: float = Field(0.0, ge=0)


class TransactionIn(BaseModel):
    occurred_on: Optional[str] = None
    type: Literal["income", "expense"]
    amount: float = Field(..., gt=0)
    note: str = ""


# ---------- App ----------
app = FastAPI(title="财富自由指南灯", docs_url="/api/docs")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/state")
def get_state():
    with db() as conn:
        s = get_settings(conn)
        stats = compute_stats(conn)
        txs = conn.execute(
            "SELECT * FROM transactions ORDER BY occurred_on DESC, id DESC LIMIT 50"
        ).fetchall()
        return {
            "settings": s,
            "stats": stats,
            "transactions": [dict(t) for t in txs],
        }


@app.post("/api/settings")
def set_settings(body: SettingsIn):
    date.fromisoformat(body.birth_date)  # validate
    now = datetime.now().isoformat()
    with db() as conn:
        conn.execute(
            """INSERT INTO settings (id, birth_date, target_age, currency, show_past, use_initial_assets, initial_assets, tracking_days_override, avg_daily_expense_override, created_at)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 birth_date                  = excluded.birth_date,
                 target_age                  = excluded.target_age,
                 currency                    = excluded.currency,
                 show_past                   = excluded.show_past,
                 use_initial_assets          = excluded.use_initial_assets,
                 initial_assets              = excluded.initial_assets,
                 tracking_days_override      = excluded.tracking_days_override,
                 avg_daily_expense_override  = excluded.avg_daily_expense_override""",
            (body.birth_date, body.target_age, body.currency,
             int(body.show_past), int(body.use_initial_assets), float(body.initial_assets),
             int(body.tracking_days_override), float(body.avg_daily_expense_override), now),
        )
        return {"settings": get_settings(conn), "stats": compute_stats(conn)}


@app.post("/api/transactions")
def add_transaction(body: TransactionIn):
    with db() as conn:
        before = compute_stats(conn)
        when = body.occurred_on or date.today().isoformat()
        date.fromisoformat(when)
        cur = conn.execute(
            """INSERT INTO transactions (occurred_on, type, amount, note, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (when, body.type, body.amount, body.note, datetime.now().isoformat()),
        )
        tx_id = cur.lastrowid
        after = compute_stats(conn)
        delta = after["lit_count"] - before["lit_count"]
        animation = "light_up" if delta > 0 else ("extinguish" if delta < 0 else "none")
        tx = dict(conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone())
        return {
            "transaction": tx,
            "stats": after,
            "lit_before": before["lit_count"],
            "lit_after": after["lit_count"],
            "delta": delta,
            "animation": animation,
        }


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    with db() as conn:
        if not conn.execute("SELECT 1 FROM transactions WHERE id = ?", (tx_id,)).fetchone():
            raise HTTPException(404, "transaction not found")
        before = compute_stats(conn)
        conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        after = compute_stats(conn)
        delta = after["lit_count"] - before["lit_count"]
        animation = "light_up" if delta > 0 else ("extinguish" if delta < 0 else "none")
        return {
            "deleted": tx_id,
            "stats": after,
            "lit_before": before["lit_count"],
            "lit_after": after["lit_count"],
            "delta": delta,
            "animation": animation,
        }


@app.get("/api/transactions")
def list_transactions(limit: int = 200, offset: int = 0):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions ORDER BY occurred_on DESC, id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return {"transactions": [dict(r) for r in rows]}


# ---------- Static ----------
@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8766)
