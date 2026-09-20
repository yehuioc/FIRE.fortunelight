"""Calendar-aware spending comparisons and ledger-derived habit feedback."""
from __future__ import annotations

from calendar import monthrange
from collections import Counter, defaultdict
from datetime import date, timedelta
import csv
import io

from .model import CATEGORIES, NATURES, cents, iso_date


def money_cents(tx):
    return int(tx["amount_cents"]) if tx.get("amount_cents") is not None else cents(tx["amount"])


def period_bounds(period: str, anchor: date, today: date | None = None):
    today = today or date.today()
    if anchor > today:
        raise ValueError("不能分析未来周期")
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday())
        end = min(today, start + timedelta(days=6))
        previous_start = start - timedelta(days=7)
        previous_end = previous_start + (end - start)
    elif period == "month":
        start = anchor.replace(day=1)
        end = min(today, anchor.replace(day=monthrange(anchor.year, anchor.month)[1]))
        previous_start = (start - timedelta(days=1)).replace(day=1)
        previous_end = previous_start.replace(day=min(end.day, monthrange(previous_start.year, previous_start.month)[1]))
    else:
        start = anchor.replace(month=1, day=1)
        end = min(today, anchor.replace(month=12, day=31))
        previous_start = start.replace(year=start.year - 1)
        previous_end = date(end.year - 1, end.month, min(end.day, monthrange(end.year - 1, end.month)[1]))
    return {"period": period, "start": start.isoformat(), "end": end.isoformat(),
            "previous_start": previous_start.isoformat(), "previous_end": previous_end.isoformat()}


def summarize(items, period="month", anchor=None, category_id="", detail_tag="", today=None):
    today = today or date.today()
    bounds = period_bounds(period, anchor or today, today)
    current = [t for t in items if t["type"] == "expense" and bounds["start"] <= t["occurred_on"] <= bounds["end"]]
    previous = [t for t in items if t["type"] == "expense" and bounds["previous_start"] <= t["occurred_on"] <= bounds["previous_end"]]
    total = sum(map(money_cents, current))
    prior = sum(map(money_cents, previous))

    def breakdown(field, labels):
        groups = Counter()
        for tx in current:
            groups[tx[field]] += money_cents(tx)
        return [{"id": key, "name": labels[key], "amount": value / 100,
                 "share": round(value * 100 / total, 2) if total else 0}
                for key, value in sorted(groups.items(), key=lambda kv: (-kv[1], kv[0]))]

    grouped = Counter()
    for tx in current:
        if category_id and tx["category_id"] != category_id:
            continue
        if detail_tag and tx["detail_tag"] != detail_tag:
            continue
        key = tx["occurred_on"][:7] if period == "year" else tx["occurred_on"]
        grouped[key] += money_cents(tx)
    if period == "year":
        keys = [f"{bounds['start'][:4]}-{m:02}" for m in range(1, int(bounds["end"][5:7]) + 1)]
    else:
        start, end = iso_date(bounds["start"]), iso_date(bounds["end"])
        keys = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    return {**bounds, "total": total / 100, "previous_total": prior / 100, "delta": (total - prior) / 100,
            "delta_pct": round((total - prior) * 100 / prior, 2) if prior else (None if total else 0),
            "categories": breakdown("category_id", CATEGORIES), "natures": breakdown("nature", NATURES),
            "trend": [{"key": key, "amount": grouped[key] / 100} for key in keys],
            "tags": sorted({t["detail_tag"] for t in current if t["detail_tag"] and (not category_id or t["category_id"] == category_id)}),
            "record_count": len(current)}


def csv_report(items, report):
    output = io.StringIO(newline="")
    writer = csv.writer(output)

    def write(values):
        # CSV remains a text report, never a spreadsheet formula carrier.
        writer.writerow(["'" + x if isinstance(x, str) and x.lstrip().startswith(("=", "+", "-", "@")) else x for x in values])

    write(["财富自由指南灯 · 消费报告"])
    write(["统计周期", report["start"], report["end"]])
    write(["本期生活消耗", report["total"], "上期同期", report["previous_total"]])
    write(["上期同期范围", report["previous_start"], report["previous_end"]])
    write(["变动", report["delta"], "变动百分比", report["delta_pct"] if report["delta_pct"] is not None else "上期为 0"])
    for name, field in [("主分类", "categories"), ("消费性质", "natures")]:
        write([])
        write([name, "金额", "占比 %"])
        for row in report[field]:
            write([row["name"], f"{row['amount']:.2f}", row["share"]])
    write([])
    write(["日期", "主分类", "快捷标签", "消费性质", "金额", "备注"])
    for tx in sorted(items, key=lambda x: (x["occurred_on"], x["id"]), reverse=True):
        if tx["type"] == "expense" and report["start"] <= tx["occurred_on"] <= report["end"]:
            write([tx["occurred_on"], CATEGORIES[tx["category_id"]], tx["detail_tag"], NATURES[tx["nature"]],
                   f"{money_cents(tx) / 100:.2f}", tx["note"]])
    return "\ufeff" + output.getvalue()


def habit_summary(items, presets=(), last_review="", today=None):
    today = today or date.today()
    rows = [t for t in items if not t.get("system_kind") and iso_date(t["occurred_on"]) <= today]
    counts = Counter(t["occurred_on"] for t in rows)
    days = sorted(map(iso_date, counts))
    longest, run = 0, 0
    previous = None
    for day in days:
        run = run + 1 if previous and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day
    current = run if days and (today - days[-1]).days <= 1 else 0
    denominator = min(30, (today - days[0]).days + 1) if days else 30
    recent = sum((today - d).days < denominator for d in days)
    monday = today - timedelta(days=today.weekday())
    grid_start = monday - timedelta(weeks=11)
    grid = []
    for i in range(84):
        day = grid_start + timedelta(days=i)
        count = counts.get(day.isoformat(), 0) if day <= today else 0
        grid.append({"date": day.isoformat(), "count": count, "level": min(4, count), "future": day > today})
    avg14 = sum(count for day, count in counts.items() if 0 <= (today - iso_date(day)).days < 14) / 14
    previous_week = [t for t in rows if monday - timedelta(days=7) <= iso_date(t["occurred_on"]) < monday]
    uses = Counter((t["category_id"], t["detail_tag"]) for t in rows if t["type"] == "expense" and (today - iso_date(t["occurred_on"])).days < 90)
    frequent = sorted([dict(p, uses=uses[(p["category_id"], p["label"])]) for p in presets if uses[(p["category_id"], p["label"])]],
                      key=lambda p: (-p["uses"], p["id"]))[:4]
    categories = Counter(t["category_id"] for t in rows if t["type"] == "expense")
    backfill = False
    for t in rows:
        try:
            backfill |= (iso_date(t.get("created_at", "")[:10]) - iso_date(t["occurred_on"])).days >= 7
        except (ValueError, TypeError):
            pass
    achievements = [
        ("first", "第一笔真实记录", len(days), 1), ("days7", "七日有迹可循", len(days), 7),
        ("streak7", "连续一周", longest, 7), ("days30", "一个月的证据", len(days), 30),
        ("streak30", "连续三十天", longest, 30), ("days100", "百日账本", len(days), 100),
        ("tiny", "一块钱也有姓名", int(any(money_cents(t) <= 100 for t in rows)), 1),
        ("drink10", "饮料零食监察员", categories["snack_drink"], 10),
        ("meal50", "民以食为天", categories["meal"], 50),
        ("monday4", "星期一也没逃掉", sum(d.weekday() == 0 for d in days), 4),
        ("archaeology", "账本考古队", int(backfill), 1),
    ]
    return {"recorded_days": len(days), "current_streak": current, "longest_streak": longest,
            "coverage_days": recent, "coverage_denominator": denominator, "coverage_pct": round(recent * 100 / denominator),
            "grid": grid, "frequent_presets": frequent,
            "missed_prompt": f"昨天没有记录。最近 14 天平均每天约 {avg14:.1f} 笔；没有发生自由事件就不用补。"
                if len(days) >= 5 and counts.get((today - timedelta(days=1)).isoformat(), 0) == 0 and avg14 >= .5 else None,
            "weekly_review": {"key": monday.isoformat(), "anchor": (monday - timedelta(days=1)).isoformat(),
                              "available": bool(previous_week), "unread": bool(previous_week) and last_review != monday.isoformat()},
            "achievements": [{"id": key, "name": name, "current": count, "target": goal, "unlocked": count >= goal}
                             for key, name, count, goal in achievements]}
