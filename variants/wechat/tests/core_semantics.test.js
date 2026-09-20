const assert = require('assert');
const fs = require('fs');
const path = require('path');
const model = require('../utils/model');

const now = new Date(2026, 7, 22, 12);
const settings = { birth_date:'2000-01-01', target_age:80, mode:'quick', expense_mode:'manual', manual_daily_expense:100 };
const opening = { occurred_on:'2026-08-22', type:'income', amount:10000, system_kind:'opening_balance' };

// Increasing real disposable wealth must be described as buying back time.
const beforeIncome = model.computeStats(settings, [opening], now);
const afterIncome = model.computeStats(settings, [opening, {occurred_on:'2026-08-22', type:'income', amount:500}], now);
const incomeFeedback = model.feedbackForChange(beforeIncome, afterIncome, 'income', settings, 500);
assert.strictEqual(incomeFeedback.delta, 5);
assert(incomeFeedback.title.includes('买回'));
assert(!incomeFeedback.detail.includes('奖励'));

// Living consumption must be framed as exchange/opportunity cost, not punishment.
const afterExpense = model.computeStats(settings, [opening, {occurred_on:'2026-08-22', type:'expense', amount:500}], now);
const expenseFeedback = model.feedbackForChange(beforeIncome, afterExpense, 'expense', settings, 500);
assert.strictEqual(expenseFeedback.delta, -5);
assert(expenseFeedback.title.includes('交换'));
assert(expenseFeedback.detail.includes('机会成本'));
assert(expenseFeedback.detail.includes('值不值由你判断'));
assert(!expenseFeedback.title.includes('惩罚'));

// Ledger cost is explicitly an estimate, never an absolute truth claim.
assert.strictEqual(model.costSourceLabel({mode:'advanced', expense_mode:'ledger'}), '账本估计');
const ledgerInsight = model.insight(model.computeStats({birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger'}, [], now), {mode:'advanced', expense_mode:'ledger'});
assert(ledgerInsight.includes('估计'));
assert(ledgerInsight.includes('不是绝对真值'));

const index = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8');
const guide = fs.readFileSync(path.join(__dirname, '../pages/guide/guide.wxml'), 'utf8');
assert(index.includes('生活消耗'));
assert(index.includes('新增财富'));
assert(index.includes('账户互转'));
assert(index.includes('CURRENT HORIZON FULLY COVERED'));
assert(!index.includes('FINANCIAL FREEDOM ACHIEVED'));
assert(guide.includes('这里只记录“自由事件”'));
assert(guide.includes('它不是永久退休证明'));
assert(guide.includes('值不值由你决定'));

console.log('core_semantics.test.js: PASS');
