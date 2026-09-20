const assert = require('assert');
const model = require('../utils/model');
const ritual = require('../utils/ritual_grid');

// 1) Exact currency boundary: 25,790.13 / 955.19 is exactly 27 days in cents.
{
  const settings = { birth_date:'2000-01-01', target_age:80, mode:'advanced', expense_mode:'manual', manual_daily_expense:955.19 };
  const txs = [
    { occurred_on:'2026-08-22', type:'income', amount:34921.96 },
    { occurred_on:'2026-08-22', type:'expense', amount:9131.83 }
  ];
  const stats = model.computeStats(settings, txs, new Date(2026,7,22,12));
  assert.strictEqual(stats.net_savings, 25790.13);
  assert.strictEqual(stats.income_freedom, 27);
}

// 2) Deliberately construct thousands of exact integer-day boundaries.
for (let i = 1; i <= 20000; i += 1) {
  const dailyCents = 1 + (i * 7919) % 999999;
  const days = 1 + (i * 104729) % 5000;
  const netCents = dailyCents * days;
  const settings = { birth_date:'2000-01-01', target_age:120, mode:'advanced', expense_mode:'manual', manual_daily_expense:dailyCents/100 };
  const stats = model.computeStats(settings, [{ occurred_on:'2026-08-22', type:'income', amount:netCents/100 }], new Date(2026,7,22,12));
  assert.strictEqual(stats.income_freedom, days, `manual exact boundary failed at case ${i}`);
}

// 3) Ledger exact ratio uses integer cents and exact floorMulDiv.
for (let i = 1; i <= 10000; i += 1) {
  const expenseCents = 100 + (i * 3571) % 500000;
  const trackingDays = 1 + (i * 97) % 365;
  const targetDays = 1 + (i * 53) % 2000;
  // Choose net savings so net*days/expense is exactly targetDays when divisible.
  const g = gcd(trackingDays, expenseCents);
  const unit = expenseCents / g;
  const k = Math.ceil(targetDays / (trackingDays / g));
  const netCents = unit * k;
  const expected = Math.floor(netCents * trackingDays / expenseCents);
  const stats = model.computeStats({birth_date:'2000-01-01',target_age:120,mode:'advanced',expense_mode:'ledger',tracking_days_override:trackingDays}, [
    {occurred_on:'2026-08-22',type:'expense',amount:expenseCents/100},
    {occurred_on:'2026-08-22',type:'income',amount:(expenseCents+netCents)/100}
  ], new Date(2026,7,22,12));
  assert.strictEqual(stats.income_freedom, expected, `ledger boundary failed at case ${i}`);
}

// 4) Establishing / rebasing ledger cost is calibration, never a celebratory money-gain ritual.
{
  const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger'};
  const before=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'income',amount:1000000}],new Date(2026,7,22,12));
  const after=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'income',amount:1000000},{occurred_on:'2026-08-22',type:'expense',amount:1}],new Date(2026,7,22,12));
  const fb=model.feedbackForChange(before,after,'expense',settings,1);
  assert.strictEqual(fb.kind,'calibration');
  assert.strictEqual(fb.ritual,'none');
  assert.strictEqual(fb.suppressCelebration,true);
  assert(fb.detail.includes('不是这笔消费本身凭空创造或夺走'));
}
{
  const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger'};
  const before=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'income',amount:10000},{occurred_on:'2026-08-22',type:'expense',amount:100}],new Date(2026,7,22,12));
  const after=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'income',amount:10000},{occurred_on:'2026-08-22',type:'expense',amount:100},{occurred_on:'2020-01-01',type:'expense',amount:1}],new Date(2026,7,22,12));
  const fb=model.feedbackForChange(before,after,'expense',settings,1);
  assert.strictEqual(fb.kind,'calibration');
  assert.strictEqual(fb.ritual,'none');
  assert(fb.detail.includes('成本观察起点'));
}


// 4b) If tracking-days is manually overridden, an earlier record does NOT rebase the denominator;
// normal gain/loss semantics must remain available instead of mislabeling it as history calibration.
{
  const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger',tracking_days_override:30};
  const before=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'expense',amount:100},{occurred_on:'2026-08-22',type:'income',amount:10000}],new Date(2026,7,22,12));
  const after=model.computeStats(settings,[{occurred_on:'2026-08-22',type:'expense',amount:100},{occurred_on:'2026-08-22',type:'income',amount:10000},{occurred_on:'2020-01-01',type:'income',amount:100}],new Date(2026,7,22,12));
  assert.strictEqual(before.tracking_days,30);
  assert.strictEqual(after.tracking_days,30);
  const fb=model.feedbackForChange(before,after,'income',settings,100);
  assert.notStrictEqual(fb.kind,'calibration');
}

// 5) Invalid transaction types must not poison first_record / tracking-days denominator.
{
  const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger'};
  const stats=model.computeStats(settings,[
    {occurred_on:'2000-01-01',type:'garbage',amount:1},
    {occurred_on:'2026-08-22',type:'expense',amount:100},
    {occurred_on:'2026-08-22',type:'income',amount:200}
  ],new Date(2026,7,22,12));
  assert.strictEqual(stats.first_record,'2026-08-22');
  assert.strictEqual(stats.tracking_days,1);
}

// 6) Duplicate corrupted opening-balance rows must not be double-counted by the kernel.
{
  const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'manual',manual_daily_expense:100};
  const stats=model.computeStats(settings,[
    {occurred_on:'2026-08-01',type:'income',amount:10000,system_kind:'opening_balance'},
    {occurred_on:'2026-08-02',type:'income',amount:20000,system_kind:'opening_balance'}
  ],new Date(2026,7,22,12));
  assert.strictEqual(stats.total_income,10000);
  assert.strictEqual(stats.income_freedom,100);
}

// 7) Timeline is monotonic over a wide range.

let lastI=0,lastE=0;
for(let d=1;d<=50000;d++){
  const i=ritual.computeRitualTimeline(d,'ignite').totalMs;
  const e=ritual.computeRitualTimeline(d,'extinguish').totalMs;
  assert(i>=lastI-1e-6,`ignite non-monotonic ${d}`);
  assert(e>=lastE-1e-6,`extinguish non-monotonic ${d}`);
  lastI=i;lastE=e;
}

function gcd(a,b){while(b){const t=a%b;a=b;b=t;}return a;}

// Corrupt/programmatic future birth dates must not create a fictional life grid.
const futureBirth = model.computeStats({ birth_date:'2099-01-01', target_age:80, mode:'quick', manual_daily_expense:100 }, [], new Date(2026,7,22,12));
assert.strictEqual(futureBirth.total_cells, 0);
assert.strictEqual(futureBirth.future_cells, 0);
console.log('adversarial_regression.test.js: PASS');
