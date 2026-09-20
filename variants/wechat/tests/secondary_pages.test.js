const assert = require('assert');

const store = new Map();
const toasts = [];
let modalConfirm = true;
let navBackCount = 0;
let relaunchUrl = '';

global.wx = {
  getStorageSync(key) { return store.has(key) ? store.get(key) : ''; },
  setStorageSync(key, value) { store.set(key, value); },
  removeStorageSync(key) { store.delete(key); },
  showToast(options) { toasts.push(options && options.title); },
  showModal(options) { if (options && options.success) options.success({ confirm: modalConfirm, cancel: !modalConfirm }); },
  navigateBack() { navBackCount += 1; },
  reLaunch(options) { relaunchUrl = options && options.url; },
  setNavigationBarColor() {}
};

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
function instantiate(definition) {
  const page = {};
  Object.entries(definition).forEach(([key, value]) => { page[key] = key === 'data' ? clone(value) : value; });
  page.setData = function(patch, cb) {
    Object.entries(patch || {}).forEach(([key, value]) => key.includes('.') ? applyPath(this.data, key, value) : (this.data[key] = value));
    if (cb) cb.call(this);
  };
  return page;
}
function loadPage(relative) {
  let captured = null;
  global.Page = definition => { captured = definition; };
  const path = require.resolve(relative);
  delete require.cache[path];
  require(path);
  assert(captured, `${relative} should register Page`);
  return instantiate(captured);
}

const storage = require('../utils/storage');
storage.clearAll();
storage.saveSettings({
  birth_date: '2000-01-01', target_age: 80, mode: 'quick', expense_mode: 'manual',
  manual_daily_expense: 100, show_past: false, use_initial_assets: true,
  initial_assets: 1000, tracking_days_override: 0, theme: 'midnight'
});
storage.markOnboardingDone();
storage.addTransaction({ occurred_on: '2026-08-20', type: 'expense', amount: 100, note: '支出' });
storage.addTransaction({ occurred_on: '2026-08-21', type: 'income', amount: 500, note: '收入' });

const settings = loadPage('../pages/settings/settings');
settings.onLoad();
assert.strictEqual(settings.data.form.mode, 'quick');
const openingDateBeforeSave = storage.getOpeningTransaction().occurred_on;
settings.selectMode({ currentTarget: { dataset: { mode: 'advanced' } } });
settings.selectExpenseMode({ currentTarget: { dataset: { source: 'ledger' } } });
settings.onTrackingDays({ detail: { value: '30' } });
settings.selectTheme({ currentTarget: { dataset: { theme: 'paper' } } });
settings.save();
let saved = storage.getSettings();
assert.strictEqual(saved.mode, 'advanced');
assert.strictEqual(saved.expense_mode, 'ledger');
assert.strictEqual(saved.tracking_days_override, 30);
assert.strictEqual(saved.theme, 'paper');
assert.strictEqual(storage.getOpeningTransaction().occurred_on, openingDateBeforeSave, 'saving settings must preserve opening-balance history date');

const history = loadPage('../pages/history/history');
history.onShow();
assert.strictEqual(history.data.count, 3);
assert.strictEqual(history.data.themeClass, 'theme-paper');
const firstDeletable = history.data.items.find(item => !item.locked);
assert(firstDeletable);
history.remove({ currentTarget: { dataset: { id: firstDeletable.id } } });
assert.strictEqual(storage.getTransactions().length, 2);
assert.strictEqual(history.data.count, 2);
assert(toasts.includes('已删除'));

const guide = loadPage('../pages/guide/guide');
guide.onShow();
assert.strictEqual(guide.data.themeClass, 'theme-paper');

const settings2 = loadPage('../pages/settings/settings');
settings2.onLoad();
settings2.clearData();
assert.strictEqual(storage.getTransactions().length, 0);
assert.strictEqual(storage.getSettings(), null);

setTimeout(() => {
  assert(navBackCount >= 1);
  assert.strictEqual(relaunchUrl, '/pages/index/index');
  console.log('secondary_pages.test.js: PASS');
}, 520);
