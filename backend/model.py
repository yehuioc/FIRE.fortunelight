"""Pure, cent-exact freedom model shared by API, imports and tests."""
from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from fractions import Fraction
import json

VERSION = "1.0.0"
CATEGORIES = dict(zip(
    ("meal", "snack_drink", "household", "transport", "study_work", "entertainment", "health", "housing_comms", "other", "uncategorized"),
    ("正餐", "饮料/零食", "生活用品", "交通", "学习/工作", "娱乐", "医疗健康", "住宿/通信", "其他", "未分类"),
))
NATURES = {"necessary": "必要", "adjustable": "可调", "avoidable": "可省", "unset": "未设定"}
MODULES = ["overview", "life", "habits", "entry"]
FLAGS = ["inline_tips_enabled", "freedom_delta_hint", "habit_center", "achievements_enabled",
         "quick_entry_enabled", "missed_prompt_enabled", "weekly_review_enabled", "ritual_enabled"]


def cents(value) -> int:
    """Never silently round a third decimal or accept nonfinite/boolean money."""
    if isinstance(value, bool):
        raise ValueError("金额必须是数字，且最多两位小数")
    try:
        number = Decimal(str(value))
        scaled = number * 100
        if not number.is_finite() or number < 0 or scaled != scaled.to_integral_value() or scaled > 9_007_199_254_740_991:
            raise ValueError("金额须非负、最多两位小数，且不超过安全范围")
        return int(scaled)
    except (InvalidOperation, TypeError):
        raise ValueError("金额格式无效") from None


def iso_date(value: str) -> date:
    result = date.fromisoformat(value)
    if result.isoformat() != value:
        raise ValueError("日期须为 YYYY-MM-DD")
    return result


def normalize_settings(raw: dict | None) -> dict:
    s = dict(raw or {})
    if "config_json" in s:
        s.update(json.loads(s.pop("config_json") or "{}"))
    mode = s.get("mode", "advanced")
    legacy = s.get("avg_daily_expense_override", 0)
    expense_mode = s.get("expense_mode", "manual" if legacy else "ledger")
    manual = s.get("manual_daily_expense", legacy)
    order = s.get("home_module_order", MODULES)
    order = list(dict.fromkeys(x for x in order if x in MODULES)) if isinstance(order, list) else []
    order += [x for x in MODULES if x not in order]
    scale = {"compact": 90, "standard": 100, "large": 110}.get(str(s.get("font_scale")), s.get("font_scale", 100))
    try:
        scale = int(scale)
    except (ValueError, TypeError):
        scale = 100
    if scale not in range(85, 116, 5):
        scale = 100
    result = {
        "birth_date": s.get("birth_date", ""), "target_age": int(s.get("target_age", 80)),
        "mode": mode, "expense_mode": "manual" if mode == "quick" else expense_mode,
        "manual_daily_expense": cents(manual) / 100, "currency": "CNY",
        "show_past": bool(s.get("show_past", False)),
        "use_initial_assets": bool(s.get("use_initial_assets", False)),
        "initial_assets": cents(s.get("initial_assets", 0)) / 100,
        "tracking_days_override": int(s.get("tracking_days_override", 0)),
        "theme": s.get("theme", "midnight"), "font_family": s.get("font_family", "system"),
        "font_scale": scale, "home_module_order": order,
        "sound_enabled": bool(s.get("sound_enabled", False)),
        "advanced_dormant": s.get("advanced_dormant", {}),
    }
    result.update({key: s.get(key, True) is not False for key in FLAGS})
    return result


def effective_settings(settings: dict | None) -> dict:
    s = normalize_settings(settings)
    if s["mode"] == "quick":
        s.update(expense_mode="manual", show_past=False, use_initial_assets=False, initial_assets=0, tracking_days_override=0)
    elif s["expense_mode"] == "manual":
        s["tracking_days_override"] = 0
    return s


def compute(settings: dict | None, transactions: list[dict], today: date | None = None) -> dict:
    today = today or date.today()
    s = effective_settings(settings)
    birth = iso_date(s["birth_date"]) if s["birth_date"] else None
    totals = {"income": 0, "expense": 0}
    dates, excluded, opening_seen = [], 0, False
    for tx in transactions:
        when = iso_date(tx["occurred_on"])
        opening = tx.get("system_kind") == "opening_balance"
        if opening:
            if opening_seen:
                continue
            opening_seen = True
        elif when > today or (birth and when < birth):
            excluded += 1
            continue
        amount = tx.get("amount_cents")
        totals[tx["type"]] += cents(tx["amount"]) if amount is None else int(amount)
        if not opening:
            dates.append(when)
    first, last = (min(dates), max(dates)) if dates else (None, None)
    days = s["tracking_days_override"] or ((today - first).days + 1 if first else 0)
    net = totals["income"] - totals["expense"]
    cost = Fraction(cents(s["manual_daily_expense"]), 1) if s["expense_mode"] == "manual" else Fraction(totals["expense"], days or 1)
    assets = cents(s["initial_assets"]) if s["use_initial_assets"] else 0
    income_exact = Fraction(max(0, net), 1) / cost if cost > 0 else Fraction(0)
    asset_exact = Fraction(assets, 1) / cost if cost > 0 else Fraction(0)
    income_days, asset_days = int(income_exact), int(asset_exact)
    freedom = income_days + asset_days
    future, past = 0, 0
    if birth and birth <= today:
        try:
            end = birth.replace(year=birth.year + s["target_age"])
        except ValueError:
            end = birth.replace(year=birth.year + s["target_age"], day=28)
        future, past = max(0, (end - today).days), (today - birth).days
    asset_lit = min(asset_days, future)
    income_lit = min(income_days, future - asset_lit)
    return {
        "total_income": totals["income"] / 100, "total_expense": totals["expense"] / 100,
        "total_income_cents": str(totals["income"]), "total_expense_cents": str(totals["expense"]),
        "net_savings": net / 100, "net_savings_cents": str(net), "tracking_days": days,
        "avg_daily_expense": round(float(cost / 100), 4),
        "cost_source": "手动估计" if s["expense_mode"] == "manual" else "账本估计",
        "expense_mode": s["expense_mode"], "cost_ready": cost > 0,
        "freedom_days_bought": freedom, "freedom_days_exact": float(income_exact + asset_exact),
        "asset_freedom": asset_days, "income_freedom": income_days,
        "asset_lit": asset_lit, "income_lit": income_lit, "lit_count": asset_lit + income_lit,
        "future_cells": future, "past_cells": past if s["show_past"] else 0,
        "total_cells": future + (past if s["show_past"] else 0),
        "tracked_past_cells": min(past, max(0, (today - first).days)) if first and s["show_past"] else 0,
        "show_past": s["show_past"], "use_initial_assets": s["use_initial_assets"],
        "initial_assets": assets / 100, "overflow": max(0, freedom - future),
        "first_record": first.isoformat() if first else None, "last_record": last.isoformat() if last else None,
        "target_reached": bool(birth and future == 0), "excluded_count": excluded,
        "fully_covered": future > 0 and asset_lit + income_lit == future,
    }


def feedback(before: dict, after: dict, *, correction=False) -> dict:
    delta = after["lit_count"] - before["lit_count"]
    exact_delta = after["freedom_days_exact"] - before["freedom_days_exact"]
    recalibrated = correction or (after["expense_mode"] == "ledger" and (
        not before["cost_ready"] or before["first_record"] != after["first_record"]))
    animation = "none" if recalibrated else "light_up" if delta > 0 else "extinguish" if delta < 0 else "none"
    if recalibrated:
        title, detail = "估计口径已重算", "这次建立或修正了计算基准，方格已更新；变化不全部来自这一笔财富。"
    elif not after["cost_ready"]:
        title, detail = "记录已保存", "尚无有效生活成本估计。填写手动成本，或让账本有真实生活消耗后再折算。"
    elif after["target_reached"]:
        title, detail = "已到达人生坐标", "当前区间已结束；可在设置中调整目标年龄。零个剩余方格不代表永久退休。"
    elif delta > 0:
        title, detail = f"为自己买回 {delta} 个完整自由日", "按当前生活成本估计，净储蓄增加了可自主支配的时间。"
    elif delta < 0:
        title, detail = f"交换了 {-delta} 个完整自由日", "把未来自由交换成今天的价值。机会成本可见，值不值由你判断。"
    elif after["fully_covered"]:
        title, detail = "当前人生区间已被覆盖", "变化已计入超出区间的自由天数，没有下一格需要点亮。"
    elif after["net_savings"] <= 0 and after["asset_freedom"] > 0:
        title, detail = "记录已保存，独立资产桶仍在", "净储蓄不为正。额外起始资产独立折算，不会被负净储蓄自动扣减。"
    else:
        title, detail = "记录已保存", f"估算自由时间为 {after['freedom_days_exact']:.2f} 天，本次没有跨越完整一天的边界。"
    return {"stats": after, "lit_before": before["lit_count"], "lit_after": after["lit_count"],
            "delta": delta, "exact_delta": round(exact_delta, 6), "animation": animation,
            "recalibrated": recalibrated, "title": title, "detail": detail,
            "celebrate": not recalibrated and not before["fully_covered"] and after["fully_covered"]}
