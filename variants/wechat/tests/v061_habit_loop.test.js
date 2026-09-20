const assert = require('assert');
const habits = require('../utils/habits');
const model = require('../utils/model');
const analytics = require('../utils/analytics');

const now = new Date(2026, 8, 20, 12);
const items = [];
let id = 1;
for (const day of ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-20']) {
  items.push({ id:id++, occurred_on:day, type:'expense', amount:15, category_id:'meal', detail_tag:'日常吃饭', nature:'necessary' });
}
for (let i=0;i<10;i++) items.push({ id:id++, occurred_on:'2026-09-10', type:'expense', amount:12, category_id:'snack_drink', detail_tag:'奶茶', nature:'adjustable' });
items.push({ id:id++, occurred_on:'2026-09-20', type:'expense', amount:0.8, category_id:'other', nature:'avoidable' });

const s = habits.summary(items, now);
assert.strictEqual(s.recordedDays, 7);
assert.strictEqual(s.currentStreak, 1); // 9/19 missing; today starts a new live streak
assert.strictEqual(s.longestStreak, 5);
assert(s.coveragePct > 0 && s.coveragePct <= 100);
assert.strictEqual(habits.activityGrid(items, now, 12).length, 84);

const presets = [
  {id:1, category_id:'meal', label:'日常吃饭', nature:'necessary', note:''},
  {id:2, category_id:'snack_drink', label:'奶茶', nature:'adjustable', note:''}
];
const frequent = habits.frequentPresets(items, presets, 4, now);
assert.strictEqual(frequent[0].label, '奶茶');
assert(frequent[0].useCount >= 10);

const achievements = habits.achievementData(items, now);
assert(achievements.find(x=>x.id==='first').unlocked);
assert(achievements.find(x=>x.id==='tiny').unlocked);
assert(achievements.find(x=>x.id==='drink10').unlocked);
assert(!achievements.find(x=>x.id==='streak7').unlocked);

const week = habits.weeklyReviewState(now, {}, items);
assert.strictEqual(week.weekKey, '2026-09-14');
assert.strictEqual(week.shouldGlow, true);
assert.strictEqual(week.available, true);
assert(week.previousWeekRecords >= 1);
assert.strictEqual(habits.weeklyReviewState(now, {last_weekly_report_seen:'2026-09-14'}, items).shouldGlow, false);
assert.strictEqual(habits.weeklyReviewState(now, {}, items.filter(x => x.occurred_on >= '2026-09-14')).shouldGlow, false);

const priorWeekAnchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12);
const priorWeekBounds = analytics.bounds('week', priorWeekAnchor);
assert.strictEqual(priorWeekBounds.start, '2026-09-07');
assert.strictEqual(priorWeekBounds.end, '2026-09-13');

// Current streak is not punished during the day before the user has recorded today.
const throughYesterday = items.filter(x=>x.occurred_on !== '2026-09-20');
const ys = habits.summary(throughYesterday, new Date(2026,8,19,10));
assert(ys.currentStreak >= 1);

const settings = model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:80});
const before = model.computeStats(settings, [{id:1,occurred_on:'2026-09-20',type:'income',amount:1000}], now);
const after = model.computeStats(settings, [{id:1,occurred_on:'2026-09-20',type:'income',amount:1000},{id:2,occurred_on:'2026-09-20',type:'expense',amount:20}], now);
const feedback = model.feedbackForChange(before, after, 'expense', settings, 20);
assert.strictEqual(feedback.exactDelta, -0.25);
assert.strictEqual(feedback.exactDeltaText, '−0.25 天');

console.log('v061_habit_loop.test.js: PASS');
