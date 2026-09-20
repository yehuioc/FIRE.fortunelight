const assert = require('assert');

const store = new Map();
const toasts = [];

global.wx = {
  getStorageSync(key) { return store.has(key) ? store.get(key) : ''; },
  setStorageSync(key, value) { store.set(key, value); },
  removeStorageSync(key) { store.delete(key); },
  showToast(options) { toasts.push(options && options.title); },
  stopPullDownRefresh() {},
  navigateTo() {},
  setNavigationBarColor() {},
  getWindowInfo() { return { pixelRatio: 2 }; },
  canvasToTempFilePath(options) { if (options && options.success) options.success({ tempFilePath: 'wxfile://grid.png' }); }
};

let pageDefinition = null;
global.Page = function Page(definition) { pageDefinition = definition; };

['../utils/storage','../utils/model','../utils/theme','../pages/index/index'].forEach(p => { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
const storage = require('../utils/storage');
require('../pages/index/index');
assert(pageDefinition, 'index Page should register');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function applyPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}
function createPage() {
  const page = {};
  Object.keys(pageDefinition).forEach(key => {
    if (key === 'data') page.data = clone(pageDefinition.data);
    else page[key] = pageDefinition[key];
  });
  page.setData = function setData(patch, callback) {
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (key.includes('.')) applyPath(this.data, key, value);
      else this.data[key] = value;
    });
    if (callback) callback.call(this);
  };
  page.scheduleCanvasInit = function() { this._canvasScheduled = true; };
  page.renderGridSnapshot = function() { this._gridSnapshots = (this._gridSnapshots || 0) + 1; };
  page.renderGridChange = function(before, after, feedback) { this._lastGridChange = { before, after, feedback }; };
  page.runRitual = async function(before, after, feedback) { this._lastRitual = { before, after, feedback }; return { played: true }; };
  return page;
}

(async () => {
const page = createPage();
page.onLoad();
assert.strictEqual(page.data.showOnboarding, true);
page.nextGuide(); page.nextGuide(); page.nextGuide(); page.nextGuide(); page.nextGuide();
page.onOnboardingBirth({ detail: { value: '2099-01-01' } });
page.onOnboardingAge({ detail: { value: '80' } });
page.nextGuide();
assert(toasts.some(x => x.includes('出生日期')));
page.onOnboardingBirth({ detail: { value: '2000-01-01' } });
page.onOnboardingAge({ detail: { value: '80.5' } });
page.nextGuide();
assert(toasts.includes('目标年龄请输入 20–120 的整数'));
page.onOnboardingAge({ detail: { value: '80' } });
page.nextGuide();
assert(toasts.some(x => x.includes('日均生活成本至少')));
page.onOnboardingDailyExpense({ detail: { value: '100' } });
page.onOnboardingOpeningBalance({ detail: { value: '10000' } });
page.nextGuide();

assert.strictEqual(page.data.showOnboarding, false);
assert.strictEqual(page.data.stats.lit_count, 100);
assert.strictEqual(page.data.stats.net_savings, 10000);
assert.strictEqual(page._canvasScheduled, true);

const settings = global.wx.getStorageSync('wfb.settings');
assert(settings && settings.mode === 'quick');
assert.strictEqual(settings.manual_daily_expense, 100);
assert.strictEqual(settings.initial_assets, 0);
assert.strictEqual(settings.use_initial_assets, false);
let txs = storage.getTransactions();
assert.strictEqual(txs.length, 1);
assert.strictEqual(txs[0].system_kind, 'opening_balance');
assert.strictEqual(txs[0].amount, 10000);

page.selectType({ currentTarget: { dataset: { type: 'expense' } } });
page.onAmount({ detail: { value: '0.001' } });
await page.submitTransaction();
assert(toasts.some(x => x.includes('金额必须至少')));
assert.strictEqual(storage.getTransactions().length, 1, 'sub-cent input must not create a ¥0 transaction');
page.onAmount({ detail: { value: '10' } });
page.onDate({ detail: { value: '2099-01-01' } });
await page.submitTransaction();
assert(toasts.includes('请选择今天或更早的有效日期'));
assert.strictEqual(storage.getTransactions().length, 1, 'future date must not enter ledger');
page.onDate({ detail: { value: page.data.today } });
page.selectExpenseCategory({ currentTarget: { dataset: { id: 'meal' } } });
page.onAmount({ detail: { value: '50' } });
await page.submitTransaction();
txs = storage.getTransactions();
assert.strictEqual(txs.length, 2);
assert.strictEqual(page.data.stats.net_savings, 9950);
assert.strictEqual(page.data.stats.lit_count, 99);
assert.strictEqual(page.data.lastFeedback.kind, 'extinguish');
assert.strictEqual(page.data.lastFeedback.delta, -1);

page.onAmount({ detail: { value: '1100' } });
await page.submitTransaction();
assert.strictEqual(page.data.stats.net_savings, 8850);
assert.strictEqual(page.data.stats.lit_count, 88);
assert.strictEqual(page.data.lastFeedback.delta, -11);

page.selectType({ currentTarget: { dataset: { type: 'income' } } });
page.onAmount({ detail: { value: '600' } });
await page.submitTransaction();
assert.strictEqual(page.data.stats.net_savings, 9450);
assert.strictEqual(page.data.stats.lit_count, 94);
assert.strictEqual(page.data.lastFeedback.kind, 'light_up');
assert.strictEqual(page.data.lastFeedback.delta, 6);

// Backgrounding during an active ritual must settle the visual timeline instead of leaving it suspended.
let skipCalls = 0;
page.data.ritualActive = true;
page._ritualEngine = { skip() { skipCalls += 1; } };
page.onHide();
assert.strictEqual(skipCalls, 1);
page.data.freedomCelebration = true;
page.onHide();
assert.strictEqual(page._skipCelebration, true);

console.log('page_flow.test.js: PASS');

})().catch(err => { console.error(err); process.exit(1); });
