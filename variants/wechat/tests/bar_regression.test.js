const assert = require('assert');
const model = require('../utils/model');

const now = new Date(2026, 7, 22, 12);

// Synthetic opening balance contributes wealth but must not fabricate the ledger observation span.
{
  const settings = { birth_date:'2000-01-01', target_age:80, mode:'advanced', expense_mode:'ledger' };
  const stats = model.computeStats(settings, [
    { occurred_on:'2026-01-01', type:'income', amount:10000, system_kind:'opening_balance', system_locked:true },
    { occurred_on:'2026-08-22', type:'expense', amount:100 }
  ], now);
  assert.strictEqual(stats.first_record, '2026-08-22');
  assert.strictEqual(stats.tracking_days, 1);
  assert.strictEqual(stats.avg_daily_expense, 100);
  assert.strictEqual(stats.income_freedom, 99);
}

// A personal ledger row from before birth is invalid input and must not distort the denominator.
{
  const settings = { birth_date:'2000-01-01', target_age:80, mode:'advanced', expense_mode:'ledger' };
  const stats = model.computeStats(settings, [
    { occurred_on:'1990-01-01', type:'expense', amount:1 },
    { occurred_on:'2026-08-22', type:'income', amount:10000 },
    { occurred_on:'2026-08-22', type:'expense', amount:100 }
  ], now);
  assert.strictEqual(stats.total_expense, 100);
  assert.strictEqual(stats.first_record, '2026-08-22');
  assert.strictEqual(stats.tracking_days, 1);
  assert.strictEqual(stats.income_freedom, 99);
}

// Time passing with no new ledger event is intentionally allowed to change ledger-derived daily cost.
// This locks the original formula rather than treating that behavior as a bug.
{
  const settings = { birth_date:'2000-01-01', target_age:80, mode:'advanced', expense_mode:'ledger' };
  const txs = [
    { occurred_on:'2026-08-01', type:'income', amount:10000 },
    { occurred_on:'2026-08-01', type:'expense', amount:2200 }
  ];
  const a = model.computeStats(settings, txs, new Date(2026,7,22,12));
  const b = model.computeStats(settings, txs, new Date(2026,7,23,12));
  assert.strictEqual(a.tracking_days, 22);
  assert.strictEqual(b.tracking_days, 23);
  assert(b.freedom_days_bought >= a.freedom_days_bought);
}

console.log('bar_regression.test.js: PASS');
