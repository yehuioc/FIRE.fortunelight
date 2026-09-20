const assert = require('assert');
const analytics = require('../utils/analytics');

const tx = [
  {id:1,occurred_on:'2026-09-01',type:'expense',amount:15,category_id:'meal',detail_tag:'日常吃饭',nature:'necessary',note:'食堂'},
  {id:2,occurred_on:'2026-09-02',type:'expense',amount:20,category_id:'snack_drink',detail_tag:'奶茶',nature:'avoidable',note:'奶茶'},
  {id:3,occurred_on:'2026-09-10',type:'expense',amount:100,category_id:'meal',detail_tag:'聚餐',nature:'adjustable',note:'朋友聚餐'},
  {id:4,occurred_on:'2026-08-01',type:'expense',amount:50,category_id:'meal',detail_tag:'日常吃饭',nature:'necessary'},
  {id:5,occurred_on:'2026-08-10',type:'expense',amount:10,category_id:'snack_drink',nature:'avoidable'},
  {id:6,occurred_on:'2026-09-12',type:'income',amount:999, note:'收入不进入消费分析'}
];
const now = new Date(2026,8,20,12);
const s = analytics.summarize(tx,'month',now);
assert.strictEqual(s.start,'2026-09-01');
assert.strictEqual(s.end,'2026-09-20');
assert.strictEqual(s.previousStart,'2026-08-01');
assert.strictEqual(s.previousEnd,'2026-08-20');
assert.strictEqual(s.total,135);
assert.strictEqual(s.previousTotal,60);
assert.strictEqual(s.delta,75);
assert.strictEqual(s.topCategory.id,'meal');
assert.strictEqual(s.topCategory.amount,115);
assert(Math.abs(s.topCategory.share - 85.19) < 0.01);
const n = Object.fromEntries(s.natureBreakdown.map(x=>[x.id,x.amount]));
assert.deepStrictEqual(n,{necessary:15,adjustable:100,avoidable:20});
const trend = analytics.trend(tx,'month',{category_id:'meal',detail_tag:'日常吃饭'},now);
assert.strictEqual(trend.length,20);
assert.strictEqual(trend[0].amount,15);
assert.strictEqual(trend[9].amount,0);
assert.deepStrictEqual(new Set(analytics.availableDetailTags(tx,'meal')),new Set(['日常吃饭','聚餐']));
const csv=analytics.createCsvReport(tx,'month',now);
assert(csv.startsWith('\uFEFF财富自由指南灯 · 消费报告'));
assert(csv.includes('主分类,金额,占比'));
assert(csv.includes('正餐,115.00'));
assert(csv.includes('日期,主分类,子标签,消费性质,金额,备注'));
assert(csv.includes('2026-09-02,饮料/零食,奶茶,可省,20.00,奶茶'));
console.log('v060_analytics.test.js: PASS');
