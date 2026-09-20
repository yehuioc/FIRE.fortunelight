const categories = require('./categories');
const model = require('./model');

function parse(iso) { return model.parseDateLocal(iso); }
function iso(d) { return model.isoDate(d); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0); return x; }
function clampEnd(end, today) { return end > today ? today : end; }
function startOfWeek(d) {
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(d, delta);
}
function endOfWeek(d) { return addDays(startOfWeek(d), 6); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0, 0); }
function startOfYear(d) { return new Date(d.getFullYear(), 0, 1, 12, 0, 0, 0); }
function endOfYear(d) { return new Date(d.getFullYear(), 11, 31, 12, 0, 0, 0); }
function safeSameDay(year, month, day) {
  const last = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
  return new Date(year, month, Math.min(day, last), 12, 0, 0, 0);
}

function bounds(period, nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  let start, end, previousStart, previousEnd, label;
  if (period === 'week') {
    start = startOfWeek(today); end = clampEnd(endOfWeek(today), today);
    previousStart = addDays(start, -7); previousEnd = addDays(previousStart, Math.max(0, Math.round((end - start) / 86400000)));
    label = `${iso(start)} ～ ${iso(end)}`;
  } else if (period === 'year') {
    start = startOfYear(today); end = today;
    previousStart = new Date(today.getFullYear() - 1, 0, 1, 12, 0, 0, 0);
    previousEnd = safeSameDay(today.getFullYear() - 1, today.getMonth(), today.getDate());
    label = `${today.getFullYear()} 年至今`;
  } else {
    start = startOfMonth(today); end = today;
    previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12, 0, 0, 0);
    previousEnd = safeSameDay(previousStart.getFullYear(), previousStart.getMonth(), today.getDate());
    label = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')} 至今`;
    period = 'month';
  }
  return {
    period, start: iso(start), end: iso(end), previousStart: iso(previousStart), previousEnd: iso(previousEnd), label
  };
}

function amountCents(tx) { return model.moneyToCents(tx && tx.amount) || 0; }
function isExpenseInRange(tx, start, end) {
  return !!tx && tx.type === 'expense' && typeof tx.occurred_on === 'string' && tx.occurred_on >= start && tx.occurred_on <= end;
}

function sumExpenses(items, start, end) {
  return (Array.isArray(items) ? items : []).reduce((sum, tx) => sum + (isExpenseInRange(tx, start, end) ? amountCents(tx) : 0), 0);
}

function groupCategory(items, start, end) {
  const map = Object.create(null);
  (Array.isArray(items) ? items : []).forEach(tx => {
    if (!isExpenseInRange(tx, start, end)) return;
    const id = categories.normalizeCategoryId(tx.category_id, true);
    map[id] = (map[id] || 0) + amountCents(tx);
  });
  return map;
}

function groupNature(items, start, end) {
  const map = Object.create(null);
  (Array.isArray(items) ? items : []).forEach(tx => {
    if (!isExpenseInRange(tx, start, end)) return;
    const id = categories.normalizeNature(tx.nature, true);
    map[id] = (map[id] || 0) + amountCents(tx);
  });
  return map;
}

function round2(v) { return Math.round(v * 100) / 100; }

function summarize(itemsInput, periodInput, nowInput) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const b = bounds(periodInput, nowInput);
  const totalCents = sumExpenses(items, b.start, b.end);
  const previousCents = sumExpenses(items, b.previousStart, b.previousEnd);
  const cat = groupCategory(items, b.start, b.end);
  const nat = groupNature(items, b.start, b.end);
  const categoryBreakdown = Object.keys(cat).map(id => ({
    id,
    name: categories.categoryName(id),
    amount: cat[id] / 100,
    cents: cat[id],
    share: totalCents > 0 ? round2(cat[id] * 100 / totalCents) : 0
  })).sort((a, b2) => b2.cents - a.cents);
  const natureBreakdown = Object.keys(nat).map(id => ({
    id,
    name: categories.natureName(id),
    amount: nat[id] / 100,
    cents: nat[id],
    share: totalCents > 0 ? round2(nat[id] * 100 / totalCents) : 0
  })).sort((a, b2) => b2.cents - a.cents);
  const deltaCents = totalCents - previousCents;
  const deltaPct = previousCents > 0 ? round2(deltaCents * 100 / previousCents) : (totalCents > 0 ? null : 0);
  return {
    ...b,
    total: totalCents / 100,
    previousTotal: previousCents / 100,
    delta: deltaCents / 100,
    deltaPct,
    topCategory: categoryBreakdown[0] || null,
    categoryBreakdown,
    natureBreakdown
  };
}

function daysBetween(startIso, endIso) {
  const a = parse(startIso), b = parse(endIso);
  if (!a || !b || b < a) return [];
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

function trend(itemsInput, periodInput, filterInput, nowInput) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const filter = filterInput || {};
  const b = bounds(periodInput, nowInput);
  const match = tx => {
    if (!isExpenseInRange(tx, b.start, b.end)) return false;
    if (filter.category_id && categories.normalizeCategoryId(tx.category_id, true) !== filter.category_id) return false;
    if (filter.detail_tag && String(tx.detail_tag || '') !== String(filter.detail_tag)) return false;
    return true;
  };
  const map = Object.create(null);
  items.forEach(tx => {
    if (!match(tx)) return;
    let key;
    if (b.period === 'year') key = tx.occurred_on.slice(0, 7);
    else key = tx.occurred_on;
    map[key] = (map[key] || 0) + amountCents(tx);
  });
  let keys;
  if (b.period === 'year') {
    const y = b.start.slice(0, 4);
    const endMonth = Number(b.end.slice(5, 7));
    keys = [];
    for (let m = 1; m <= endMonth; m += 1) keys.push(`${y}-${String(m).padStart(2, '0')}`);
  } else keys = daysBetween(b.start, b.end);
  return keys.map(key => ({
    key,
    label: b.period === 'year' ? `${Number(key.slice(5, 7))}月` : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
    amount: (map[key] || 0) / 100,
    cents: map[key] || 0
  }));
}

function availableDetailTags(itemsInput, categoryId) {
  const seen = new Set();
  const out = [];
  (Array.isArray(itemsInput) ? itemsInput : []).forEach(tx => {
    if (!tx || tx.type !== 'expense') return;
    if (categoryId && categories.normalizeCategoryId(tx.category_id, true) !== categoryId) return;
    const tag = String(tx.detail_tag || '').trim();
    if (!tag || seen.has(tag)) return;
    seen.add(tag); out.push(tag);
  });
  return out.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function csvEscape(value) {
  const s = String(value === undefined || value === null ? '' : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function createCsvReport(itemsInput, periodInput, nowInput) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const summary = summarize(items, periodInput, nowInput);
  const rows = [];
  rows.push(['财富自由指南灯 · 消费报告']);
  rows.push(['统计周期', summary.label]);
  rows.push(['本期总支出', summary.total.toFixed(2)]);
  rows.push(['上期同期', summary.previousTotal.toFixed(2)]);
  rows.push(['变动', summary.delta.toFixed(2), summary.deltaPct === null ? '上期为 0' : `${summary.deltaPct}%`]);
  rows.push([]);
  rows.push(['主分类', '金额', '占比']);
  summary.categoryBreakdown.forEach(x => rows.push([x.name, x.amount.toFixed(2), `${x.share}%`]));
  rows.push([]);
  rows.push(['消费性质', '金额', '占比']);
  summary.natureBreakdown.forEach(x => rows.push([x.name, x.amount.toFixed(2), `${x.share}%`]));
  rows.push([]);
  rows.push(['日期', '主分类', '子标签', '消费性质', '金额', '备注']);
  items.filter(tx => isExpenseInRange(tx, summary.start, summary.end))
    .sort((a, b) => a.occurred_on === b.occurred_on ? Number(b.id || 0) - Number(a.id || 0) : (a.occurred_on < b.occurred_on ? 1 : -1))
    .forEach(tx => rows.push([
      tx.occurred_on,
      categories.categoryName(tx.category_id),
      String(tx.detail_tag || ''),
      categories.natureName(tx.nature),
      Number(tx.amount || 0).toFixed(2),
      String(tx.note || '')
    ]));
  return '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
}

module.exports = { bounds, summarize, trend, availableDetailTags, createCsvReport };
