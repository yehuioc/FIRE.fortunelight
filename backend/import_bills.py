"""财富自由指南针 · 账单导入器
支持: 微信支付 XLSX + 工商银行 PDF/CSV + 支付宝 CSV
去重: (occurred_on, type, amount) 唯一索引
用法: .venv/Scripts/python backend/import_bills.py
"""
from __future__ import annotations

import io
import sqlite3
import sys
from csv import DictReader
from datetime import date, datetime
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "ledger.db"
IMPORTS = ROOT / "imports"

# ── 配置 ──
CUTOFF_DATE = "2026-05-23"  # 财富灯首次使用日（Settings创建日期）

# ── 微信 XLSX 列索引 (1-based)──
WX_COL = {
    "date": 1,       # 交易时间 (datetime)
    "tx_type": 2,    # 交易类型
    "counterparty": 3,  # 交易对方
    "product": 4,    # 商品
    "direction": 5,  # 收/支
    "amount": 6,     # 金额(元)
    "method": 7,     # 支付方式
    "note": 11,      # 备注
}
WX_HEADER_ROW = 18   # 表头所在行 (1-based)
WX_DATA_START = 19    # 第一条数据行


def ensure_schema(conn: sqlite3.Connection) -> None:
    """建唯一索引（幂等），顺便 init_db 保底"""
    from database import init_connection

    init_connection(conn)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_dedup
        ON transactions(occurred_on, type, amount)
    """)


def parse_wx_date(val) -> Optional[str]:
    """datetime → 'YYYY-MM-DD'"""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.isoformat()
    if val is None:
        return None
    s = str(val).strip()[:10]
    if len(s) == 10 and s[4] == "-":
        return s
    return None


def parse_wx_amount(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return round(float(str(val).replace(chr(165), "").replace(",", "").strip()), 2)
    except (ValueError, TypeError):
        return None


def build_note(tx_type: str, counterparty: str, product: str, raw_note: str, method: str) -> str:
    parts = []
    # 交易对方
    cp = str(counterparty).strip() if counterparty else ""
    if cp and cp not in ("/", ""):
        parts.append(cp)
    # 商品描述
    prod = str(product).strip() if product else ""
    if prod and prod not in ("/", ""):
        if prod.startswith("转账备注:"):
            parts.append(prod.replace("转账备注:", "备注:"))
        elif prod.startswith("收款方备注:"):
            parts.append(prod.replace("收款方备注:", "备注:"))
        elif prod != cp:  # 避免重复
            parts.append(prod)
    # 微信备注
    rn = str(raw_note).strip() if raw_note else ""
    if rn and rn not in ("/", ""):
        parts.append(f"[{rn}]")
    # 支付方式标注（银行卡交易会与银行流水重叠）
    method_str = str(method).strip() if method else ""
    if method_str and "银行卡" in method_str:
        parts.append("[银行卡]")
    return " | ".join(parts) if parts else ""


def import_wechat_xlsx(xlsx_path: Path, conn: sqlite3.Connection) -> dict:
    """导入微信支付 XLSX，返回统计"""
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active

    total = 0
    skipped_cutoff = 0
    skipped_parse = 0
    inserted = 0
    duped = 0
    income_amt = 0.0
    expense_amt = 0.0

    for r in range(WX_DATA_START, ws.max_row + 1):
        date_val = ws.cell(r, WX_COL["date"]).value
        direction = str(ws.cell(r, WX_COL["direction"]).value or "")
        amount_val = ws.cell(r, WX_COL["amount"]).value

        if date_val is None or "合计" in str(date_val) or "总计" in str(date_val):
            continue
        if "收入" not in direction and "支出" not in direction:
            continue

        total += 1
        occurred = parse_wx_date(date_val)
        amount = parse_wx_amount(amount_val)

        if not occurred or amount is None:
            skipped_parse += 1
            continue
        if occurred < CUTOFF_DATE:
            skipped_cutoff += 1
            continue

        tx_type = "income" if "收入" in direction else "expense"
        note = build_note(
            tx_type=str(ws.cell(r, WX_COL["tx_type"]).value or ""),
            counterparty=str(ws.cell(r, WX_COL["counterparty"]).value or ""),
            product=str(ws.cell(r, WX_COL["product"]).value or ""),
            raw_note=str(ws.cell(r, WX_COL["note"]).value or ""),
            method=str(ws.cell(r, WX_COL["method"]).value or ""),
        )

        try:
            now = datetime.now().isoformat()
            conn.execute(
                "INSERT OR IGNORE INTO transactions (occurred_on, type, amount, note, created_at) VALUES (?,?,?,?,?)",
                (occurred, tx_type, amount, note[:200], now),
            )
            if conn.total_changes > 0:
                inserted += 1
                if tx_type == "income":
                    income_amt += amount
                else:
                    expense_amt += amount
            else:
                duped += 1
        except Exception as e:
            print(f"  [WARN] row {r}: {e}", file=sys.stderr)
            skipped_parse += 1

    conn.commit()
    wb.close()
    return {
        "total": total, "inserted": inserted, "duped": duped,
        "skipped_cutoff": skipped_cutoff, "skipped_parse": skipped_parse,
        "income_amt": income_amt, "expense_amt": expense_amt,
    }


def _clean_amount(raw: str) -> Optional[float]:
    """从 ICBC PDF 金额列提取数字：删掉所有非数字字符后保留 +/- 号和数值"""
    import re
    # 先取最后一段含数字的行（PDF 布局把垃圾字符堆在前面）
    parts = [p for p in raw.replace("\n", " ").split() if p]
    for p in reversed(parts):
        m = re.search(r"([+\-])\s*(\d+\.?\d*)", p)
        if m:
            sign = -1 if m.group(1) == "-" else 1
            val = float(m.group(2))
            return round(sign * val, 2)
    return None


def _clean_cell(val: str) -> str:
    """清理 ICBC 表格单元格中的 PDF 垃圾字符"""
    import re
    # 保留中英文、数字、常见符号，去掉单字母/数字碎片
    val = val.replace("\n", " ").strip()
    # 删除孤立的字母+数字标记（如 "D", "2012", "A", "6\n1" 等 PDF 水印）
    val = re.sub(r"\b[A-F0-9]{1,2}\b", "", val)
    val = re.sub(r"\s{2,}", " ", val)
    return val.strip()


def _clean_note(raw: str) -> str:
    """清理摘要/对方名称用于备注"""
    import re
    raw = raw.replace("\n", "").replace(" ", "")
    # 去掉明显的垃圾片段
    raw = re.sub(r"[:\-]?\d{1,2}", "", raw)
    return raw[:80]


def import_icbc_pdf(pdf_path: Path, conn: sqlite3.Connection) -> dict:
    """导入工商银行 PDF 历史明细"""
    import re
    try:
        import fitz
    except ImportError:
        print("  [SKIP] pymupdf 未安装，无法解析 PDF", file=sys.stderr)
        return {"total": 0, "inserted": 0, "duped": 0, "skipped_cutoff": 0, "skipped_parse": 0, "income_amt": 0.0, "expense_amt": 0.0}

    stats = {"total": 0, "inserted": 0, "duped": 0, "skipped_cutoff": 0, "skipped_parse": 0, "income_amt": 0.0, "expense_amt": 0.0}

    doc = fitz.open(str(pdf_path))
    for page in doc:
        tabs = page.find_tables()
        if not tabs:
            continue
        for t in tabs:
            data = t.extract()
            if not data or len(data) < 2:
                continue
            # 找表头行确认列含义
            header = data[0]
            if not any("日期" in str(h) for h in header):
                continue

            for row in data[1:]:
                if len(row) < 13:
                    continue

                # Col 1: 交易日期 (YYYY-MM-DD\nHH:MM:SS)
                date_raw = str(row[0] or "").strip().split("\n")[0]
                if len(date_raw) < 10 or date_raw[4] != "-":
                    continue
                occurred = date_raw[:10]
                if occurred < CUTOFF_DATE:
                    stats["skipped_cutoff"] += 1
                    continue

                stats["total"] += 1

                # Col 9: 收入/支出金额 (e.g., "+500.00", "-48.79")
                amount = _clean_amount(str(row[8] or ""))
                if amount is None:
                    stats["skipped_parse"] += 1
                    continue

                tx_type = "income" if amount > 0 else "expense"
                abs_amount = round(abs(amount), 2)

                # 摘要 (Col 7) + 对方名称 (Col 11)
                summary = _clean_note(str(row[6] or ""))
                counterparty = _clean_note(str(row[10] or ""))

                note_parts = []
                if summary and summary not in ("", "/"):
                    note_parts.append(summary)
                if counterparty and counterparty not in ("", "/"):
                    note_parts.append(counterparty)
                note = " | ".join(note_parts)[:200]
                if not note:
                    note = "银行交易"

                # 去重提示：标记银行卡来源
                note = "[银行] " + note

                try:
                    now = datetime.now().isoformat()
                    conn.execute(
                        "INSERT OR IGNORE INTO transactions (occurred_on, type, amount, note, created_at) VALUES (?,?,?,?,?)",
                        (occurred, tx_type, abs_amount, note[:200], now),
                    )
                    if conn.total_changes > 0:
                        stats["inserted"] += 1
                        if tx_type == "income":
                            stats["income_amt"] += abs_amount
                        else:
                            stats["expense_amt"] += abs_amount
                    else:
                        stats["duped"] += 1
                except Exception as e:
                    print(f"  [WARN] {occurred}: {e}", file=sys.stderr)
                    stats["skipped_parse"] += 1

    conn.commit()
    doc.close()
    return stats


def import_icbc_csv(csv_path: Path, conn: sqlite3.Connection) -> dict:
    """导入工商银行 CSV（备用——当用户能导出 CSV 格式时使用）"""
    stats = {"total": 0, "inserted": 0, "duped": 0, "skipped_cutoff": 0, "skipped_parse": 0, "income_amt": 0.0, "expense_amt": 0.0}

    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = DictReader(f)
        cols = reader.fieldnames or []
        date_col = next((c for c in cols if "日期" in c or "交易" in c), None)
        amount_col = next((c for c in cols if "金额" in c), None)
        desc_col = next((c for c in cols if "摘要" in c or "说明" in c or "用途" in c), None)
        counterparty_col = next((c for c in cols if "对方" in c or "户名" in c), None)

        if not date_col or not amount_col:
            print(f"  [SKIP] CSV 列名无法识别: {cols}", file=sys.stderr)
            return stats

        for row in reader:
            stats["total"] += 1
            occurred = str(row.get(date_col, "")).strip()[:10]
            if len(occurred) != 10:
                stats["skipped_parse"] += 1
                continue
            if occurred < CUTOFF_DATE:
                stats["skipped_cutoff"] += 1
                continue

            amount_str = str(row.get(amount_col, "0")).replace(",", "").replace(chr(165), "").strip()
            amount = _clean_amount(amount_str)
            if amount is None:
                stats["skipped_parse"] += 1
                continue

            tx_type = "income" if amount > 0 else "expense"
            abs_amount = round(abs(amount), 2)
            desc = str(row.get(desc_col, "")) if desc_col else ""
            counterparty = str(row.get(counterparty_col, "")) if counterparty_col else ""
            note_parts = [p for p in [desc.strip(), counterparty.strip()] if p and p != "/"]
            note = ("[银行] " + " | ".join(note_parts))[:200]

            now = datetime.now().isoformat()
            conn.execute(
                "INSERT OR IGNORE INTO transactions (occurred_on, type, amount, note, created_at) VALUES (?,?,?,?,?)",
                (occurred, tx_type, abs_amount, note, now),
            )
            if conn.total_changes > 0:
                stats["inserted"] += 1
                if tx_type == "income":
                    stats["income_amt"] += abs_amount
                else:
                    stats["expense_amt"] += abs_amount
            else:
                stats["duped"] += 1

    conn.commit()
    return stats


def import_alipay_csv(csv_path: Path, conn: sqlite3.Connection) -> dict:
    """导入支付宝 CSV 账单
    格式: 前22行元数据 + 第23行分隔线 + 第24行表头 + 数据行
    列: 交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商户订单号,备注
    """
    import re
    stats = {"total": 0, "inserted": 0, "duped": 0, "skipped_cutoff": 0, "skipped_parse": 0, "income_amt": 0.0, "expense_amt": 0.0}

    # 尝试多种编码读取
    lines = None
    for enc in ["gbk", "gb2312", "gb18030", "utf-8-sig", "utf-8"]:
        try:
            with open(csv_path, "r", encoding=enc, errors="strict") as f:
                raw_lines = f.readlines()
            # 验证：表头行应含中文关键词
            for line in raw_lines:
                if "交易时间" in line and "交易对方" in line:
                    lines = raw_lines
                    break
            if lines:
                break
        except (UnicodeDecodeError, Exception):
            continue

    if lines is None:
        print(f"  [SKIP] 支付宝 CSV 编码无法识别", file=sys.stderr)
        return stats

    # 找表头行索引
    header_idx = None
    for i, line in enumerate(lines):
        if "交易时间" in line and "交易对方" in line:
            header_idx = i
            break

    if header_idx is None:
        print(f"  [SKIP] 支付宝 CSV 格式无法识别", file=sys.stderr)
        return stats

    # 用 StringIO 喂给 DictReader
    reader = DictReader(io.StringIO("".join(lines[header_idx:])), skipinitialspace=True)

    for row in reader:
        stats["total"] += 1

        # 交易时间: YYYY-MM-DD HH:MM:SS
        date_raw = (row.get("交易时间") or "").strip()
        if len(date_raw) < 10:
            stats["skipped_parse"] += 1
            continue
        occurred = date_raw[:10]
        if occurred < CUTOFF_DATE:
            stats["skipped_cutoff"] += 1
            continue

        # 收/支: 支出 / 收入 / 不计收支
        direction = (row.get("收/支") or "").strip()
        if "不计" in direction:
            stats["skipped_parse"] += 1  # 内部转账，不算收支
            continue

        if "收入" in direction:
            tx_type = "income"
        elif "支出" in direction:
            tx_type = "expense"
        else:
            stats["skipped_parse"] += 1
            continue

        # 金额
        amount_raw = (row.get("金额") or "0").strip().replace(",", "").replace(chr(165), "")
        try:
            amount = round(float(amount_raw), 2)
        except ValueError:
            stats["skipped_parse"] += 1
            continue

        if amount <= 0:
            stats["skipped_parse"] += 1  # 0元交易跳过
            continue

        # 备注: 交易分类 + 交易对方 + 商品说明
        category = (row.get("交易分类") or "").strip()
        counterparty = (row.get("交易对方") or "").strip()
        product = (row.get("商品说明") or "").strip()
        method = (row.get("收/付款方式") or "").strip()

        note_parts = []
        if category and category not in ("/", ""):
            note_parts.append(category)
        if counterparty and counterparty not in ("/", ""):
            note_parts.append(counterparty)
        if product and product not in ("/", "") and product not in note_parts:
            note_parts.append(product[:60])
        note = "[支付宝] " + " | ".join(note_parts)[:200]

        try:
            now = datetime.now().isoformat()
            conn.execute(
                "INSERT OR IGNORE INTO transactions (occurred_on, type, amount, note, created_at) VALUES (?,?,?,?,?)",
                (occurred, tx_type, amount, note, now),
            )
            if conn.total_changes > 0:
                stats["inserted"] += 1
                if tx_type == "income":
                    stats["income_amt"] += amount
                else:
                    stats["expense_amt"] += amount
            else:
                stats["duped"] += 1
        except Exception as e:
            print(f"  [WARN] {occurred}: {e}", file=sys.stderr)
            stats["skipped_parse"] += 1

    conn.commit()
    return stats


def write_imported_md(batch_dir: Path, wx_stats: dict, icbc_stats: dict) -> None:
    lines = [
        f"# 导入结果",
        f"",
        f"- 导入时间: {datetime.now().isoformat()}",
        f"- 截止日期: {CUTOFF_DATE}（此日期之前的记录已跳过）",
        f"",
    ]
    if wx_stats:
        lines += [
            f"## 微信支付",
            f"",
            f"| 指标 | 数值 |",
            f"|------|------|",
            f"| 扫描总数 | {wx_stats['total']} |",
            f"| 成功导入 | {wx_stats['inserted']} |",
            f"| 去重跳过 | {wx_stats['duped']} |",
            f"| 日期过滤 | {wx_stats['skipped_cutoff']} |",
            f"| 解析失败 | {wx_stats['skipped_parse']} |",
            f"| 收入金额 | ¥{wx_stats['income_amt']:,.2f} |",
            f"| 支出金额 | ¥{wx_stats['expense_amt']:,.2f} |",
            f"",
        ]
    if icbc_stats:
        lines += [
            f"## 工商银行",
            f"",
            f"| 指标 | 数值 |",
            f"|------|------|",
            f"| 扫描总数 | {icbc_stats['total']} |",
            f"| 成功导入 | {icbc_stats['inserted']} |",
            f"| 去重跳过 | {icbc_stats['duped']} |",
            f"| 日期过滤 | {icbc_stats['skipped_cutoff']} |",
            f"| 解析失败 | {icbc_stats['skipped_parse']} |",
            f"",
        ]
    md_path = batch_dir / "_imported.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)

    # 扫描 imports 下所有未导入批次
    if not IMPORTS.exists():
        print("imports/ 目录不存在，请先放入账单文件再运行。")
        sys.exit(1)

    for batch_dir in sorted(IMPORTS.iterdir()):
        if not batch_dir.is_dir():
            continue
        if (batch_dir / "_imported.md").exists():
            print(f"[SKIP] {batch_dir.name} — 已导入，跳过")
            continue

        wx_files = list(batch_dir.glob("*.xlsx")) + list(batch_dir.glob("*.xls"))
        alipay_csvs = [f for f in batch_dir.glob("*.csv") if "支付宝" in f.name or "alipay" in f.name.lower()]
        icbc_pdfs = list(batch_dir.glob("*.pdf"))
        icbc_csvs = [f for f in batch_dir.glob("*.csv") if f not in alipay_csvs]

        print(f"\n{'='*60}")
        print(f"[导入] {batch_dir.name}")
        print(f"{'='*60}")

        wx_stats = None
        icbc_stats = None

        for xlsx in wx_files:
            print(f"  微信 XLSX: {xlsx.name}")
            wx_stats = import_wechat_xlsx(xlsx, conn)
            print(f"    扫描 {wx_stats['total']} | 导入 {wx_stats['inserted']} | 去重 {wx_stats['duped']} | 过滤(>{CUTOFF_DATE}) {wx_stats['skipped_cutoff']} | 失败 {wx_stats['skipped_parse']}")
            if wx_stats['income_amt'] > 0:
                print(f"    收入 CNY{wx_stats['income_amt']:,.2f}  支出 CNY{wx_stats['expense_amt']:,.2f}")

        for csv in alipay_csvs:
            print(f"  支付宝 CSV: {csv.name}")
            ali_stats = import_alipay_csv(csv, conn)
            print(f"    扫描 {ali_stats['total']} | 导入 {ali_stats['inserted']} | 去重 {ali_stats['duped']} | 过滤 {ali_stats['skipped_cutoff']} | 跳过(内部/0元) {ali_stats['skipped_parse']}")
            if ali_stats['income_amt'] > 0:
                print(f"    收入 CNY{ali_stats['income_amt']:,.2f}  支出 CNY{ali_stats['expense_amt']:,.2f}")

        for pdf in icbc_pdfs:
            print(f"  银行 PDF: {pdf.name}")
            icbc_stats = import_icbc_pdf(pdf, conn)
            print(f"    扫描 {icbc_stats['total']} | 导入 {icbc_stats['inserted']} | 去重 {icbc_stats['duped']} | 过滤 {icbc_stats['skipped_cutoff']} | 失败 {icbc_stats['skipped_parse']}")
            if icbc_stats['income_amt'] > 0:
                print(f"    收入 CNY{icbc_stats['income_amt']:,.2f}  支出 CNY{icbc_stats['expense_amt']:,.2f}")

        for csv in icbc_csvs:
            print(f"  银行 CSV: {csv.name}")
            icbc_stats = import_icbc_csv(csv, conn)
            print(f"    扫描 {icbc_stats['total']} | 导入 {icbc_stats['inserted']} | 去重 {icbc_stats['duped']} | 过滤 {icbc_stats['skipped_cutoff']} | 失败 {icbc_stats['skipped_parse']}")

        write_imported_md(batch_dir, wx_stats or {}, icbc_stats or {})

    # 最终统计
    total = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    totals = conn.execute("SELECT type, COUNT(*), SUM(amount) FROM transactions GROUP BY type").fetchall()
    print(f"\n{'='*60}")
    print(f"数据库交易总数: {total}")
    for r in totals:
        print(f"  {r[0]}: {r[1]}笔, CNY{r[2]:,.2f}")
    conn.close()
    print("导入完成。")


if __name__ == "__main__":
    main()
