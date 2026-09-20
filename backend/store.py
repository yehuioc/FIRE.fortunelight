"""Transactional local persistence and portable, validated backup documents."""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from pydantic import ValidationError

from .model import normalize_settings, cents, compute, VERSION
from .schemas import SettingsIn, TransactionIn, PresetIn

BACKUP_SCHEMA = "fortune-light-backup"
WECHAT_SCHEMA = "wealth-freedom-beacon-backup"


def transactions(conn):
    return [dict(row) for row in conn.execute("SELECT * FROM transactions ORDER BY id")]


def settings(conn):
    row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    return normalize_settings(dict(row)) if row else None


def presets(conn):
    return [dict(row) for row in conn.execute("SELECT * FROM expense_presets ORDER BY id")]


def stats(conn):
    return compute(settings(conn), transactions(conn))


def revision(conn):
    row = conn.execute("SELECT value FROM app_meta WHERE key = 'revision'").fetchone()
    return int(row[0]) if row else 0


def meta(conn, key, default=""):
    row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(conn, key, value):
    conn.execute("INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def write_settings(conn, data):
    raw = dict(data)
    raw.pop("opening_balance", None)
    normalized = normalize_settings(raw)
    conn.execute("""INSERT INTO settings
        (id,birth_date,target_age,currency,show_past,initial_assets,use_initial_assets,
         tracking_days_override,avg_daily_expense_override,created_at,config_json)
        VALUES (1,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        birth_date=excluded.birth_date,target_age=excluded.target_age,currency=excluded.currency,
        show_past=excluded.show_past,initial_assets=excluded.initial_assets,use_initial_assets=excluded.use_initial_assets,
        tracking_days_override=excluded.tracking_days_override,avg_daily_expense_override=excluded.avg_daily_expense_override,
        config_json=excluded.config_json""",
        (normalized["birth_date"], normalized["target_age"], "CNY", int(normalized["show_past"]),
         normalized["initial_assets"], int(normalized["use_initial_assets"]), normalized["tracking_days_override"],
         normalized["manual_daily_expense"] if normalized["expense_mode"] == "manual" else 0,
         datetime.now().isoformat(), json.dumps(normalized, ensure_ascii=False)))


def save_opening_balance(conn, amount):
    if amount is None:
        return
    value = cents(amount)
    current = conn.execute("SELECT id FROM transactions WHERE system_kind='opening_balance'").fetchone()
    if not value:
        conn.execute("DELETE FROM transactions WHERE system_kind='opening_balance'")
    elif current:
        conn.execute("UPDATE transactions SET amount=?,amount_cents=? WHERE id=?", (value / 100, value, current[0]))
    else:
        conn.execute("""INSERT INTO transactions(occurred_on,type,amount,amount_cents,note,created_at,system_kind)
                        VALUES(?,'income',?,?,?,?,'opening_balance')""",
                     (date.today().isoformat(), value / 100, value, "起始自由本金", datetime.now().isoformat()))


def insert_transaction(conn, data, *, restore=False):
    body = dict(data)
    value = cents(body["amount"])
    columns = ["occurred_on", "type", "amount", "amount_cents", "note", "created_at", "category_id", "detail_tag", "nature", "system_kind", "entry_key"]
    values = [body["occurred_on"], body["type"], value / 100, value, body.get("note", ""),
              body.get("created_at", datetime.now().isoformat()), body.get("category_id", "uncategorized"),
              body.get("detail_tag", ""), body.get("nature", "unset"), body.get("system_kind", ""), body.get("entry_key")]
    if restore:
        columns.insert(0, "id")
        values.insert(0, body["id"])
    return conn.execute(f"INSERT INTO transactions({','.join(columns)}) VALUES({','.join('?' for _ in values)})", values).lastrowid


def export_backup(conn):
    return {"schema": BACKUP_SCHEMA, "version": 1, "app_version": VERSION,
            "created_at": datetime.now().isoformat(), "settings": settings(conn),
            "transactions": transactions(conn), "expense_presets": presets(conn),
            "habit_state": {"last_weekly_report_seen": meta(conn, "last_weekly_report_seen")}}


def backup_digest(document):
    return hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def validate_backup(document):
    if not isinstance(document, dict):
        raise ValueError("备份必须是 JSON 对象")
    wechat = document.get("schema") == WECHAT_SCHEMA and document.get("version") in (1, 2)
    local = document.get("schema") == BACKUP_SCHEMA and document.get("version") == 1
    if not (wechat or local):
        raise ValueError("不支持的备份格式或版本")
    raw_settings = document.get("settings")
    if raw_settings is not None:
        if not isinstance(raw_settings, dict):
            raise ValueError("设置格式错误")
        normalized = normalize_settings(raw_settings)
        valid_settings = SettingsIn.model_validate(normalized).model_dump(mode="json", exclude={"opening_balance"})
    else:
        valid_settings = None
    rows = document.get("transactions")
    if not isinstance(rows, list) or len(rows) > 200000:
        raise ValueError("交易列表无效或超过 200,000 笔")
    ids, keys, opening = set(), set(), False
    clean = []
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict):
            raise ValueError(f"第 {index + 1} 笔交易不是对象")
        ident = raw.get("id")
        if type(ident) is not int or not 0 < ident <= 9_007_199_254_740_991 or ident in ids:
            raise ValueError(f"第 {index + 1} 笔交易 ID 无效或重复")
        ids.add(ident)
        body = TransactionIn.model_validate(raw).model_dump(mode="json")
        kind = raw.get("system_kind", "")
        if kind not in ("", "opening_balance"):
            raise ValueError("未知系统交易类型")
        if kind == "opening_balance":
            if opening or body["type"] != "income":
                raise ValueError("起始本金重复或类型错误")
            opening = True
        key = body.get("entry_key")
        if key and key in keys:
            raise ValueError("交易提交标识重复")
        if key:
            keys.add(key)
        # Local old ledgers may have pre-birth or future entries. Keep the facts;
        # the model excludes them visibly instead of losing them on restore.
        created = raw.get("created_at", datetime.now().isoformat())
        if not isinstance(created, str) or len(created) > 80:
            raise ValueError("交易创建时间无效")
        clean.append({**body, "id": ident, "system_kind": kind, "created_at": created})
    raw_presets = document.get("expense_presets", [])
    if not isinstance(raw_presets, list) or len(raw_presets) > 100:
        raise ValueError("快捷标签无效或超过 100 个")
    seen, signatures, clean_presets = set(), set(), []
    for raw in raw_presets:
        if not isinstance(raw, dict) or type(raw.get("id")) is not int or raw["id"] <= 0 or raw["id"] in seen:
            raise ValueError("快捷标签 ID 无效或重复")
        p = PresetIn.model_validate(raw).model_dump()
        sig = (p["category_id"], p["label"])
        if sig in signatures:
            raise ValueError("快捷标签重复")
        seen.add(raw["id"])
        signatures.add(sig)
        clean_presets.append({**p, "id": raw["id"]})
    habit = document.get("habit_state", {})
    if not isinstance(habit, dict):
        raise ValueError("记录反馈状态无效")
    last_review = habit.get("last_weekly_report_seen", "")
    if not isinstance(last_review, str) or len(last_review) > 10:
        raise ValueError("周回顾状态无效")
    return {"settings": valid_settings, "transactions": clean, "expense_presets": clean_presets,
            "habit_state": {"last_weekly_report_seen": last_review}, "source": "微信小程序" if wechat else "本地版"}


def restore_backup(conn, document):
    conn.execute("DELETE FROM transactions")
    conn.execute("DELETE FROM settings")
    conn.execute("DELETE FROM expense_presets")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('transactions','expense_presets')")
    if document["settings"]:
        write_settings(conn, document["settings"])
    for tx in document["transactions"]:
        insert_transaction(conn, tx, restore=True)
    for p in document["expense_presets"]:
        conn.execute("INSERT INTO expense_presets(id,category_id,label,note,nature) VALUES(?,?,?,?,?)",
                     (p["id"], p["category_id"], p["label"], p["note"], p["nature"]))
    set_meta(conn, "last_weekly_report_seen", document["habit_state"]["last_weekly_report_seen"])
