const assert = require('assert');
const model = require('../utils/model');

const now = new Date(2026, 7, 21, 12, 0, 0);
const life = { birth_date: '2000-01-01', target_age: 80, show_past: false };
const opening10000 = { id: 1, occurred_on: '2026-08-21', type: 'income', amount: 10000, system_kind: 'opening_balance' };

// 上手版没有第二套公式：起始自由本金只是账本中的基准收入。
let quick = { ...life, mode: 'quick', manual_daily_expense: 100 };
let stats = model.computeStats(quick, [opening10000], now);
assert.strictEqual(stats.avg_daily_expense, 100);
assert.strictEqual(stats.total_income, 10000);
assert.strictEqual(stats.net_savings, 10000);
assert.strictEqual(stats.asset_freedom, 0);
assert.strictEqual(stats.income_freedom, 100);
assert.strictEqual(stats.lit_count, 100);

// 用户核心回归：10000 / 100 = 100；支出 50 后净储蓄 9950 => 99 天。
stats = model.computeStats(quick, [opening10000, { occurred_on: '2026-08-21', type: 'expense', amount: 50 }], now);
assert.strictEqual(stats.net_savings, 9950);
assert.strictEqual(stats.income_freedom, 99);
assert.strictEqual(stats.lit_count, 99);

// 再支出 1100 => 8850 / 100 = 88 天。
stats = model.computeStats(quick, [
  opening10000,
  { occurred_on: '2026-08-21', type: 'expense', amount: 50 },
  { occurred_on: '2026-08-21', type: 'expense', amount: 1100 }
], now);
assert.strictEqual(stats.net_savings, 8850);
assert.strictEqual(stats.lit_count, 88);

// 模式只影响输入权限，不影响公式：advanced + 同样输入应得到同样结果。
const advancedManual = { ...life, mode: 'advanced', expense_mode: 'manual', manual_daily_expense: 100, use_initial_assets: false };
const sameStats = model.computeStats(advancedManual, [opening10000, { occurred_on: '2026-08-21', type: 'expense', amount: 50 }], now);
assert.strictEqual(sameStats.net_savings, 9950);
assert.strictEqual(sameStats.income_freedom, 99);
assert.strictEqual(sameStats.lit_count, 99);

// 高级账本自动：最初设计，统计跨度 = 首笔有效记录到今天。
stats = model.computeStats({ ...life, mode: 'advanced', expense_mode: 'ledger' }, [
  { occurred_on: '2026-08-01', type: 'expense', amount: 100 },
  { occurred_on: '2026-08-02', type: 'income', amount: 500 }
], now);
assert.strictEqual(stats.tracking_days, 21);
assert.strictEqual(stats.avg_daily_expense, 4.7619);
assert.strictEqual(stats.net_savings, 400);
assert.strictEqual(stats.income_freedom, 84);

// 统计天数覆盖只改变日均成本输入，不改变公式。
stats = model.computeStats({ ...life, mode: 'advanced', expense_mode: 'ledger', tracking_days_override: 10 }, [
  { occurred_on: '2026-08-20', type: 'expense', amount: 100 },
  { occurred_on: '2026-08-20', type: 'income', amount: 600 }
], now);
assert.strictEqual(stats.tracking_days, 10);
assert.strictEqual(stats.avg_daily_expense, 10);
assert.strictEqual(stats.net_savings, 500);
assert.strictEqual(stats.lit_count, 50);

// 原项目可选扩展：额外起始资产是独立资产桶。
stats = model.computeStats({
  ...life,
  mode: 'advanced',
  expense_mode: 'manual',
  manual_daily_expense: 50,
  use_initial_assets: true,
  initial_assets: 1000
}, [{ occurred_on: '2026-08-21', type: 'income', amount: 300 }], now);
assert.strictEqual(stats.asset_freedom, 20);
assert.strictEqual(stats.income_freedom, 6);
assert.strictEqual(stats.lit_count, 26);

// 固定资产桶不会被负净储蓄直接扣掉；反馈必须解释，而不是说“没跨过一天”。
const assetSettings = {
  ...life, mode: 'advanced', expense_mode: 'manual', manual_daily_expense: 100,
  use_initial_assets: true, initial_assets: 10000
};
const assetBefore = model.computeStats(assetSettings, [], now);
const assetAfter = model.computeStats(assetSettings, [{ occurred_on: '2026-08-21', type: 'expense', amount: 1100 }], now);
assert.strictEqual(assetAfter.lit_count, 100);
const assetFeedback = model.feedbackForChange(assetBefore, assetAfter, 'expense', assetSettings, 1100);
assert.strictEqual(assetFeedback.delta, 0);
assert(assetFeedback.detail.includes('固定起始资产'));

// 手动日均下未跨整数边界时，反馈给出精确值和真实边界。
const before99 = model.computeStats(quick, [opening10000, { occurred_on: '2026-08-21', type: 'expense', amount: 50 }], now);
const after9940 = model.computeStats(quick, [opening10000, { occurred_on: '2026-08-21', type: 'expense', amount: 60 }], now);
const steady = model.feedbackForChange(before99, after9940, 'expense', quick, 10);
assert.strictEqual(steady.delta, 0);
assert(steady.detail.includes('99.40'));
assert(steady.detail.includes('¥40'));

// 旧设置迁移。
let migrated = model.normalizeSettings({ birth_date: '2000-01-01', target_age: 80, avg_daily_expense_override: 88 });
assert.strictEqual(migrated.expense_mode, 'manual');
assert.strictEqual(migrated.manual_daily_expense, 88);
migrated = model.normalizeSettings({ birth_date: '2000-01-01', target_age: 80, avg_daily_expense_override: 0 });
assert.strictEqual(migrated.expense_mode, 'ledger');

// quick 强制只是简化输入：手动成本、不启用独立资产桶。
migrated = model.normalizeSettings({ mode: 'quick', manual_daily_expense: 100, use_initial_assets: true, initial_assets: 10000 });
assert.strictEqual(migrated.expense_mode, 'manual');
assert.strictEqual(migrated.use_initial_assets, false);
assert.strictEqual(migrated.initial_assets, 0);

const leapBirth = model.parseDateLocal('2004-02-29');
const target = model.targetDateFromBirth(leapBirth, 21);
assert.strictEqual(model.isoDate(target), '2025-02-28');

console.log('model.test.js: PASS');
