const assert = require('assert');
const model = require('../utils/model');

const now = new Date(2026,7,24,12);
const settings = model.normalizeSettings({
  birth_date:'2000-01-01', target_age:80,
  mode:'quick', expense_mode:'manual', manual_daily_expense:80
});
const opening = {id:1, occurred_on:'2026-08-24', type:'income', amount:10000, system_kind:'opening_balance', system_locked:true};

function stats(txs){ return model.computeStats(settings, txs, now); }
function exactFreedomFromLedger(txs){
  const cents = txs.reduce((sum,tx)=>{
    const c = model.moneyToCents(tx.amount);
    return sum + (tx.type === 'income' ? c : -c);
  },0);
  return cents > 0 ? Math.floor(cents / 8000) : 0;
}

let txs=[opening];
let prev=stats(txs);
for (const [i, amount] of [50,100,200,300].entries()) {
  txs = txs.concat({id:i+2, occurred_on:'2026-08-24', type:'expense', amount});
  const next=stats(txs);
  assert.strictEqual(next.income_freedom, exactFreedomFromLedger(txs), `expense ${amount} must match exact ¥80/day floor`);
  // The per-transaction grid delta may be 0/1/2/... depending on the prior fractional-day remainder.
  assert.strictEqual(next.lit_count-prev.lit_count, next.income_lit-prev.income_lit);
  prev=next;
}

// ¥800 is exactly ten days at ¥80/day, so floor-boundary remainder cannot change the delta.
const beforeIncome=stats(txs);
const afterIncome=stats(txs.concat({id:99,occurred_on:'2026-08-24',type:'income',amount:800}));
assert.strictEqual(afterIncome.lit_count-beforeIncome.lit_count,10);
const incomeFeedback=model.feedbackForChange(beforeIncome,afterIncome,'income',settings,800);
assert.strictEqual(incomeFeedback.delta,10);
assert(incomeFeedback.title.includes('10 天自由'));

const beforeExpense=stats(txs);
const afterExpense=stats(txs.concat({id:100,occurred_on:'2026-08-24',type:'expense',amount:800}));
assert.strictEqual(afterExpense.lit_count-beforeExpense.lit_count,-10);
const expenseFeedback=model.feedbackForChange(beforeExpense,afterExpense,'expense',settings,800);
assert.strictEqual(expenseFeedback.delta,-10);

console.log('manual_cost_truth_v052.test.js: PASS');
