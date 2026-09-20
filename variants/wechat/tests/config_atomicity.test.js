const assert = require('assert');
const store = new Map();
let failOnceKey = null;
function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
global.wx = {
  getStorageSync(k){ return store.has(k) ? clone(store.get(k)) : ''; },
  setStorageSync(k,v){ if (k === failOnceKey) { failOnceKey = null; throw new Error('injected write failure'); } store.set(k, clone(v)); },
  removeStorageSync(k){ store.delete(k); },
  clearStorageSync(){ store.clear(); }
};
try { delete require.cache[require.resolve('../utils/storage')]; } catch(e) {}
const storage = require('../utils/storage');

function reset(){ store.clear(); failOnceKey=null; }

// Transaction write fails: settings must remain old.
{
  reset();
  store.set(storage.KEYS.settings, { birth_date:'2000-01-01', target_age:80, mode:'quick', expense_mode:'manual', manual_daily_expense:100 });
  store.set(storage.KEYS.transactions, [{id:1, occurred_on:'2026-08-01', type:'income', amount:10000, system_kind:'opening_balance', system_locked:true}]);
  store.set(storage.KEYS.nextId, 1);
  const before = clone(Object.fromEntries(store));
  failOnceKey = storage.bucketKey('2026-08');
  assert.throws(() => storage.saveConfiguration({ birth_date:'2000-01-01', target_age:80, mode:'quick', expense_mode:'manual', manual_daily_expense:200 }, 20000, '2026-08-22', true));
  assert.deepStrictEqual(store.get(storage.KEYS.settings), before[storage.KEYS.settings]);
  assert.deepStrictEqual(store.get(storage.KEYS.transactions), before[storage.KEYS.transactions]);
}

// Settings write fails after ledger update: rollback must restore ledger + nextId.
{
  reset();
  store.set(storage.KEYS.settings, { birth_date:'2000-01-01', target_age:80, mode:'quick', expense_mode:'manual', manual_daily_expense:100 });
  const before = clone(Object.fromEntries(store));
  failOnceKey = storage.KEYS.settings;
  assert.throws(() => storage.saveConfiguration({ birth_date:'2000-01-01', target_age:80, mode:'quick', expense_mode:'manual', manual_daily_expense:200 }, 10000, '2026-08-22', true));
  assert.deepStrictEqual(store.get(storage.KEYS.settings), before[storage.KEYS.settings]);
  assert.strictEqual(store.has(storage.KEYS.transactions), false);
  assert.strictEqual(store.has(storage.KEYS.nextId), false);
  assert.strictEqual(store.has(storage.KEYS.onboarding), false);
}

console.log('config_atomicity.test.js: PASS');
