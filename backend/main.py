"""Fortune Light local mainline: loopback API and dependency-free browser UI."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, timedelta
import json
import mimetypes
import sqlite3
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, ValidationError

from .database import db, init_db, backup_database
from .model import VERSION, CATEGORIES, NATURES, cents, compute, feedback, iso_date
from .schemas import SettingsIn, TransactionIn, PresetIn
from . import store
from .analytics import summarize, csv_report, habit_summary

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
# Windows registry may map .js to text/plain. Keep nosniff and serve correct MIME.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="财富自由指南灯", version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"])


@app.middleware("http")
async def local_boundary(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
            return JSONResponse({"detail": "仅允许本机页面的同源请求"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "拒绝跨站读取或写入本地账本"}, status_code=403)
        if request.method in ("POST", "PUT", "PATCH"):
            if request.headers.get("content-type", "").split(";")[0] != "application/json":
                return JSONResponse({"detail": "请发送 JSON"}, status_code=415)
            total, chunks = 0, []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 64 * 1024 * 1024:
                    return JSONResponse({"detail": "输入超过 64 MB"}, status_code=413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(sqlite3.OperationalError)
async def database_error(request, exc):
    return JSONResponse({"detail": "账本暂时不可用，未完成本次操作。请检查磁盘空间或其他写入进程。"}, status_code=503)


def current_state(conn):
    s, rows, tags = store.settings(conn), store.transactions(conn), store.presets(conn)
    opening = next((t for t in rows if t["system_kind"] == "opening_balance"), None)
    return {"version": VERSION, "settings": s, "stats": compute(s, rows),
            "transactions": sorted(rows, key=lambda t: (t["occurred_on"], t["id"]), reverse=True)[:50],
            "transaction_count": len(rows), "opening_balance": opening["amount"] if opening else 0,
            "presets": tags, "revision": store.revision(conn),
            "habits": habit_summary(rows, tags, store.meta(conn, "last_weekly_report_seen")),
            "categories": CATEGORIES, "natures": NATURES}


@app.get("/api/state")
def get_state():
    with db() as conn:
        conn.execute("BEGIN")
        return current_state(conn)


@app.post("/api/settings")
def set_settings(body: SettingsIn):
    if iso_date(body.birth_date) > date.today():
        raise HTTPException(422, "出生日期不能在未来")
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        before = store.stats(conn)
        incoming = body.model_dump(mode="json")
        old = store.settings(conn)
        fields = ["expense_mode", "manual_daily_expense", "show_past", "use_initial_assets", "initial_assets", "tracking_days_override"]
        if old and old["mode"] == "advanced" and body.mode == "quick":
            incoming["advanced_dormant"] = {k: old[k] for k in fields}
        elif body.mode == "advanced":
            incoming["advanced_dormant"] = {k: incoming[k] for k in fields}
        store.write_settings(conn, incoming)
        store.save_opening_balance(conn, body.opening_balance)
        return {"settings": store.settings(conn), **feedback(before, store.stats(conn), correction=True)}


def check_transaction_date(conn, body):
    s = store.settings(conn)
    if not s:
        raise HTTPException(409, "请先建立指南灯")
    when = iso_date(body.occurred_on)
    if when > date.today() or when < iso_date(s["birth_date"]):
        raise HTTPException(422, "交易日期须在出生日期与今天之间")


@app.post("/api/transactions")
def add_transaction(body: TransactionIn):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        check_transaction_date(conn, body)
        before = store.stats(conn)
        if body.entry_key:
            existing = conn.execute("SELECT * FROM transactions WHERE entry_key=?", (body.entry_key,)).fetchone()
            if existing:
                prior = TransactionIn.model_validate(dict(existing)).model_dump(mode="json")
                submitted = body.model_dump(mode="json")
                fields = ("occurred_on", "type", "note", "category_id", "detail_tag", "nature")
                if any(prior[k] != submitted[k] for k in fields) or cents(prior["amount"]) != cents(submitted["amount"]):
                    raise HTTPException(409, "相同提交标识对应不同内容，请重新提交")
                return {"transaction": dict(existing), "replayed": True, **feedback(before, before)}
        tx_id = store.insert_transaction(conn, body.model_dump(mode="json"))
        return {"transaction": dict(conn.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone()),
                "replayed": False, **feedback(before, store.stats(conn))}


def editable_transaction(conn, tx_id):
    row = conn.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone()
    if not row:
        raise HTTPException(404, "找不到这笔记录")
    if row["system_kind"]:
        raise HTTPException(409, "起始自由本金请在设置中修改")
    return row


@app.put("/api/transactions/{tx_id}")
def edit_transaction(tx_id: int, body: TransactionIn):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        editable_transaction(conn, tx_id)
        check_transaction_date(conn, body)
        before = store.stats(conn)
        value = cents(body.amount)
        conn.execute("""UPDATE transactions SET occurred_on=?,type=?,amount=?,amount_cents=?,note=?,category_id=?,detail_tag=?,nature=? WHERE id=?""",
                     (body.occurred_on, body.type, value / 100, value, body.note, body.category_id, body.detail_tag, body.nature, tx_id))
        return {"transaction": dict(conn.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone()),
                **feedback(before, store.stats(conn), correction=True)}


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        editable_transaction(conn, tx_id)
        before = store.stats(conn)
        conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
        return {"deleted": tx_id, **feedback(before, store.stats(conn), correction=True)}


@app.get("/api/transactions")
def list_transactions(limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
                      q: str = Query("", max_length=100), type: Literal["", "income", "expense"] = "", category_id: str = ""):
    clauses, args = [], []
    if q:
        clauses.append("(instr(note,?)>0 OR instr(detail_tag,?)>0)")
        args += [q, q]
    if type:
        clauses.append("type=?")
        args.append(type)
    if category_id:
        clauses.append("category_id=?")
        args.append(category_id)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with db() as conn:
        conn.execute("BEGIN")
        rows = conn.execute("SELECT * FROM transactions" + where + " ORDER BY occurred_on DESC,id DESC LIMIT ? OFFSET ?", args + [limit, offset])
        return {"transactions": [dict(r) for r in rows], "total": conn.execute("SELECT count(*) FROM transactions" + where, args).fetchone()[0]}


@app.post("/api/presets")
def create_preset(body: PresetIn):
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT count(*) FROM expense_presets").fetchone()[0] >= 100:
            raise HTTPException(422, "最多保存 100 个快捷标签")
        try:
            conn.execute("INSERT INTO expense_presets(category_id,label,note,nature) VALUES(?,?,?,?)", (body.category_id, body.label, body.note, body.nature))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "此分类下已存在同名标签") from None
        return {"presets": store.presets(conn)}


@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: int):
    with db() as conn:
        if conn.execute("DELETE FROM expense_presets WHERE id=?", (preset_id,)).rowcount == 0:
            raise HTTPException(404, "找不到此标签")
        return {"presets": store.presets(conn)}


def analysis_data(conn, period, anchor, category_id="", detail_tag=""):
    try:
        when = iso_date(anchor) if anchor else date.today()
        rows = store.transactions(conn)
        report = summarize(rows, period, when, category_id, detail_tag)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    return rows, report


@app.get("/api/analysis")
def get_analysis(period: Literal["week", "month", "year"] = "month", anchor: str = "", category_id: str = "", detail_tag: str = ""):
    with db() as conn:
        return analysis_data(conn, period, anchor, category_id, detail_tag)[1]


@app.get("/api/analysis.csv")
def get_analysis_csv(period: Literal["week", "month", "year"] = "month", anchor: str = ""):
    with db() as conn:
        rows, report = analysis_data(conn, period, anchor)
        return Response(csv_report(rows, report), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="fortune-{period}-{report["end"]}.csv"'})


@app.post("/api/review/seen")
def mark_review_seen():
    key = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    with db() as conn:
        store.set_meta(conn, "last_weekly_report_seen", key)
    return {"week_key": key}


@app.get("/api/backup")
def export_backup():
    with db() as conn:
        conn.execute("BEGIN")
        document = store.export_backup(conn)
    return Response(json.dumps(document, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="fortune-backup-{date.today()}.json"'})


def checked_backup(document):
    try:
        return store.validate_backup(document)
    except (ValueError, ValidationError, TypeError, KeyError) as exc:
        raise HTTPException(422, f"备份校验失败：{exc}") from None


@app.post("/api/backup/preview")
def preview_backup(document: dict):
    clean = checked_backup(document)
    with db() as conn:
        return {"source": clean["source"], "transaction_count": len(clean["transactions"]),
                "preset_count": len(clean["expense_presets"]), "stats": compute(clean["settings"], clean["transactions"]),
                "current_count": conn.execute("SELECT count(*) FROM transactions").fetchone()[0],
                "digest": store.backup_digest(document), "expected_revision": store.revision(conn)}


class RestoreIn(BaseModel):
    document: dict
    digest: str
    expected_revision: int
    confirm: bool


@app.post("/api/backup/restore")
def restore_backup(body: RestoreIn):
    clean = checked_backup(body.document)
    if not body.confirm or body.digest != store.backup_digest(body.document):
        raise HTTPException(409, "请先预览并确认这份备份")
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if store.revision(conn) != body.expected_revision:
            raise HTTPException(409, "预览后账本已有变化，请重新预览再恢复")
        backup = backup_database(reason="before-restore")
        store.restore_backup(conn, clean)
        return {"restored": len(clean["transactions"]), "recovery_backup": str(backup), "state": current_state(conn)}


@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


@app.get("/api/health")
def health():
    return {"app": "fortune-light", "version": VERSION}


app.mount("/", StaticFiles(directory=str(FRONTEND)), name="frontend")
