const model = require('./model');
const categories = require('./categories');

function isoDate(input) { return model.isoDate(input instanceof Date ? input : new Date()); }
function parseIso(value) { return model.parseDateLocal(String(value || '')); }
function addDays(date, n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12, 0, 0, 0); }
function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
function isRealTransaction(tx) { return !!tx && (tx.type === 'income' || tx.type === 'expense') && tx.system_kind !== 'opening_balance' && !!parseIso(tx.occurred_on); }

function dailyCounts(itemsInput) {
  const map = Object.create(null);
  (Array.isArray(itemsInput) ? itemsInput : []).forEach(tx => {
    if (!isRealTransaction(tx)) return;
    const day = String(tx.occurred_on);
    map[day] = (map[day] || 0) + 1;
  });
  return map;
}

function currentAndLongestStreak(days, todayInput) {
  if (!days.length) return { current: 0, longest: 0 };
  const parsed = days.map(parseIso).filter(Boolean).sort((a, b) => a - b);
  let longest = 1, run = 1;
  for (let i = 1; i < parsed.length; i += 1) {
    if (dayDiff(parsed[i - 1], parsed[i]) === 1) run += 1;
    else if (dayDiff(parsed[i - 1], parsed[i]) > 0) run = 1;
    longest = Math.max(longest, run);
  }
  const today = todayInput instanceof Date ? new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate(), 12) : new Date();
  const latest = parsed[parsed.length - 1];
  const gap = dayDiff(latest, today);
  if (gap > 1) return { current: 0, longest };
  let current = 1;
  for (let i = parsed.length - 2; i >= 0; i -= 1) {
    if (dayDiff(parsed[i], parsed[i + 1]) === 1) current += 1;
    else break;
  }
  return { current, longest };
}

function summary(itemsInput, todayInput) {
  const map = dailyCounts(itemsInput);
  const days = Object.keys(map).sort();
  const today = todayInput instanceof Date ? new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate(), 12) : new Date();
  const todayIso = isoDate(today);
  const yesterdayIso = isoDate(addDays(today, -1));
  const streak = currentAndLongestStreak(days, today);
  const first = days.length ? parseIso(days[0]) : null;
  const denominator = first ? Math.min(30, Math.max(1, dayDiff(first, today) + 1)) : 30;
  const start = addDays(today, -(denominator - 1));
  const recentDays = days.filter(day => { const d = parseIso(day); return d && d >= start && d <= today; }).length;
  const coverage = denominator > 0 ? Math.round(recentDays * 100 / denominator) : 0;
  const last14Start = addDays(today, -13);
  let last14Count = 0;
  Object.keys(map).forEach(day => { const d = parseIso(day); if (d && d >= last14Start && d <= today) last14Count += map[day]; });
  const avg14 = Math.round(last14Count / 14 * 10) / 10;
  return {
    recordedDays: days.length,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    coverageDays: recentDays,
    coverageDenominator: denominator,
    coveragePct: coverage,
    todayCount: map[todayIso] || 0,
    yesterdayCount: map[yesterdayIso] || 0,
    avg14,
    firstRecordDay: days[0] || ''
  };
}

function activityGrid(itemsInput, todayInput, weeksInput) {
  const map = dailyCounts(itemsInput);
  const weeks = Math.max(4, Math.min(16, Number(weeksInput || 12)));
  const today = todayInput instanceof Date ? new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate(), 12) : new Date();
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const currentMonday = addDays(today, mondayOffset);
  const start = addDays(currentMonday, -(weeks - 1) * 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = addDays(start, i);
    const key = isoDate(d);
    const count = d > today ? 0 : (map[key] || 0);
    const level = count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    cells.push({ date: key, count, level, future: d > today, today: key === isoDate(today) });
  }
  return cells;
}

function frequentPresets(itemsInput, presetsInput, limitInput, todayInput) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const presets = Array.isArray(presetsInput) ? presetsInput : [];
  const limit = Math.max(1, Math.min(6, Number(limitInput || 4)));
  const today = todayInput instanceof Date ? new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate(), 12) : new Date();
  const cutoff = addDays(today, -89);
  const score = new Map();
  const latest = new Map();
  items.forEach(tx => {
    if (!tx || tx.type !== 'expense' || !tx.detail_tag) return;
    const occurred = parseIso(tx.occurred_on);
    if (!occurred || occurred < cutoff || occurred > today) return;
    const key = `${categories.normalizeCategoryId(tx.category_id, true)}::${String(tx.detail_tag)}`;
    score.set(key, (score.get(key) || 0) + 1);
    const prior = latest.get(key) || '';
    if (String(tx.occurred_on || '') > prior) latest.set(key, String(tx.occurred_on || ''));
  });
  return presets.map(p => {
    const key = `${p.category_id}::${p.label}`;
    return { ...p, useCount: score.get(key) || 0, lastUsed: latest.get(key) || '', categoryName: categories.categoryName(p.category_id) };
  }).filter(p => p.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || String(b.lastUsed).localeCompare(String(a.lastUsed)) || Number(a.id) - Number(b.id))
    .slice(0, limit);
}

function isMondayIso(day) { const d = parseIso(day); return !!d && d.getDay() === 1; }
function achievementData(itemsInput, todayInput) {
  const items = (Array.isArray(itemsInput) ? itemsInput : []).filter(isRealTransaction);
  const s = summary(items, todayInput);
  const countCategory = id => items.filter(tx => tx.type === 'expense' && categories.normalizeCategoryId(tx.category_id, true) === id).length;
  const mondayDays = new Set(items.filter(tx => isMondayIso(tx.occurred_on)).map(tx => tx.occurred_on)).size;
  const tiny = items.some(tx => Number(tx.amount || 0) <= 1);
  const backfill = items.some(tx => {
    if (!tx.created_at) return false;
    const created = new Date(tx.created_at); const occurred = parseIso(tx.occurred_on);
    if (Number.isNaN(created.getTime()) || !occurred) return false;
    const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate(), 12);
    return dayDiff(occurred, createdDay) >= 7;
  });
  const defs = [
    ['first', '正式', '第一笔真实记录', '不是签到，是第一次把现实换成可观察的数据。', s.recordedDays, 1],
    ['days7', '正式', '七日有迹可循', '累计 7 个自然日留下过真实记录。', s.recordedDays, 7],
    ['streak7', '正式', '连续一周', '最长连续 7 天都有记录。', s.longestStreak, 7],
    ['days30', '正式', '一个月的证据', '累计 30 个自然日留下记录。', s.recordedDays, 30],
    ['streak30', '正式', '连续三十天', '最长连续 30 天都有记录。', s.longestStreak, 30],
    ['days100', '正式', '百日账本', '累计 100 个自然日留下记录。', s.recordedDays, 100],
    ['tiny', '奇怪', '一块钱也有姓名', '至少记录过一笔不超过 ¥1 的真实事件。', tiny ? 1 : 0, 1],
    ['drink10', '奇怪', '饮料零食监察员', '饮料/零食分类累计记录 10 笔。', countCategory('snack_drink'), 10],
    ['meal50', '奇怪', '民以食为天', '正餐分类累计记录 50 笔。', countCategory('meal'), 50],
    ['monday4', '奇怪', '星期一也没逃掉', '在 4 个不同的星期一留下过记录。', mondayDays, 4],
    ['archaeology', '奇怪', '账本考古队', '至少补录过一笔 7 天以前的记录。', backfill ? 1 : 0, 1]
  ];
  return defs.map(([id, group, name, desc, current, target]) => ({
    id, group, name, desc, current, target, unlocked: current >= target,
    progressPct: Math.max(0, Math.min(100, Math.round(current * 100 / target))),
    progressText: current >= target ? '已解锁' : `${Math.min(current, target)} / ${target}`
  }));
}

function weekKey(todayInput) {
  const today = todayInput instanceof Date ? new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate(), 12) : new Date();
  const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  return isoDate(addDays(today, offset));
}

function weeklyReviewState(todayInput, habitStateInput, itemsInput) {
  const state = habitStateInput || {};
  const key = weekKey(todayInput);
  let previousWeekRecords = null;
  if (Array.isArray(itemsInput)) {
    const currentMonday = parseIso(key);
    const previousStart = addDays(currentMonday, -7);
    const previousEnd = addDays(currentMonday, -1);
    previousWeekRecords = itemsInput.filter(tx => {
      if (!isRealTransaction(tx)) return false;
      const d = parseIso(tx.occurred_on);
      return !!d && d >= previousStart && d <= previousEnd;
    }).length;
  }
  const available = previousWeekRecords === null ? true : previousWeekRecords > 0;
  const seen = state.last_weekly_report_seen === key;
  return { weekKey: key, seen, available, previousWeekRecords, shouldGlow: available && !seen };
}

function missedPrompt(itemsInput, todayInput) {
  const s = summary(itemsInput, todayInput);
  if (s.recordedDays < 5 || s.yesterdayCount > 0 || s.avg14 < 0.5) return null;
  return {
    title: '昨天没有记录',
    text: `最近 14 天平均每天约 ${s.avg14.toFixed(1)} 笔。如果昨天确实没有发生自由事件，不用补；如果只是漏了，可以补一笔。`
  };
}

module.exports = { dailyCounts, summary, activityGrid, frequentPresets, achievementData, weekKey, weeklyReviewState, missedPrompt };
