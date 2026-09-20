const assert = require('assert');
const memory = new Map();
global.wx = {
  getStorageSync(key) { return memory.has(key) ? memory.get(key) : ''; },
  setStorageSync(key, value) { memory.set(key, value); },
  removeStorageSync(key) { memory.delete(key); }
};
const storage = require('../utils/storage');

storage.clearAll();
assert.deepStrictEqual(storage.getTransactions(), []);
storage.saveSettings({ birth_date: '2000-01-01', mode: 'quick', manual_daily_expense: 100 });
storage.setOpeningBalance(10000, '2026-08-21');
assert.strictEqual(storage.getOpeningBalance(), 10000);
let opening = storage.getOpeningTransaction();
assert.strictEqual(opening.type, 'income');
assert.strictEqual(opening.system_kind, storage.OPENING_KIND);
assert.strictEqual(storage.deleteTransaction(opening.id), false, 'opening baseline must be edited from settings, not deleted as ordinary tx');

const expense = storage.addTransaction({ occurred_on: '2026-08-21', type: 'expense', amount: 50, note: '午餐' });
assert.strictEqual(storage.getTransactions().length, 2);
assert.strictEqual(storage.deleteTransaction(expense.id), true);
assert.strictEqual(storage.getTransactions().length, 1);

storage.setOpeningBalance(8000, '2026-08-21');
assert.strictEqual(storage.getOpeningBalance(), 8000);
storage.setOpeningBalance(0, '2026-08-21');
assert.strictEqual(storage.getOpeningBalance(), 0);

// v0.3.2 quick migration: old initial_assets becomes opening baseline once, then settings asset bucket is cleared.
storage.clearAll();
storage.saveSettings({ birth_date: '2000-01-01', target_age: 80, mode: 'quick', manual_daily_expense: 100, use_initial_assets: true, initial_assets: 10000 });
storage.migrateKernelV033('2026-08-21');
assert.strictEqual(storage.getOpeningBalance(), 10000);
assert.strictEqual(storage.getSettings().initial_assets, 0);
assert.strictEqual(storage.getSettings().use_initial_assets, false);
const countAfterFirstMigration = storage.getTransactions().length;
storage.migrateKernelV033('2026-08-21');
assert.strictEqual(storage.getTransactions().length, countAfterFirstMigration, 'migration must be idempotent');

// nextId repairs itself from existing transaction ids if counter is missing.
storage.clearAll();
memory.set('wfb.transactions', [{ id: 9, occurred_on: '2026-08-20', type: 'expense', amount: 20 }]);
const tx = storage.addTransaction({ occurred_on: '2026-08-21', type: 'income', amount: 10 });
assert.strictEqual(tx.id, 10);


// Editing opening-balance amount must preserve its historical date.
storage.clearAll();
storage.setOpeningBalance(10000, '2026-08-01');
storage.setOpeningBalance(9000, '2026-08-22');
assert.strictEqual(storage.getOpeningTransaction().occurred_on, '2026-08-01');
assert.strictEqual(storage.getOpeningBalance(), 9000);

// Currency domain is cents: positive sub-cent values must be rejected, not stored as ¥0.
assert.throws(() => storage.addTransaction({ occurred_on:'2026-08-22', type:'expense', amount:0.001 }), /INVALID_AMOUNT/);
assert.throws(() => storage.setOpeningBalance(0.001, '2026-08-22'), /INVALID_OPENING_BALANCE/);


// Corrupt current keys must fall back to valid legacy values.
storage.clearAll();
memory.set('wfb.settings', 'corrupt');
memory.set('wfb.v020.settings', { birth_date:'2000-01-01' });
assert.strictEqual(storage.getSettings().birth_date, '2000-01-01');
memory.set('wfb.transactions', { bad:true });
memory.set('wfb.v020.transactions', [{ id:7, occurred_on:'2026-08-20', type:'expense', amount:10 }]);
assert.strictEqual(storage.getTransactions().length, 1);

// Duplicate IDs: deleting one row must not delete every row sharing that corrupted id.
storage.clearAll();
memory.set('wfb.transactions', [
  { id:1, occurred_on:'2026-08-20', type:'expense', amount:10 },
  { id:1, occurred_on:'2026-08-21', type:'income', amount:20 }
]);
assert.strictEqual(storage.deleteTransaction(1), true);
assert.strictEqual(storage.getTransactions().length, 1);


// A corrupt duplicate ID shared by a locked baseline and an ordinary row must still allow the ordinary row to be deleted.
storage.clearAll();
memory.set('wfb.transactions', [
  { id:7, occurred_on:'2026-08-01', type:'income', amount:1000, system_kind:'opening_balance', system_locked:true },
  { id:7, occurred_on:'2026-08-21', type:'expense', amount:20 }
]);
assert.strictEqual(storage.deleteTransaction(7), true);
assert.strictEqual(storage.getTransactions().length, 1);
assert.strictEqual(storage.getTransactions()[0].system_kind, 'opening_balance');

// Duplicate opening rows are consolidated on the next opening-balance edit.
storage.clearAll();
memory.set('wfb.transactions', [
  { id:1, occurred_on:'2026-08-01', type:'income', amount:100, system_kind:'opening_balance', system_locked:true },
  { id:2, occurred_on:'2026-08-02', type:'income', amount:200, system_kind:'opening_balance', system_locked:true }
]);
storage.setOpeningBalance(300, '2026-08-21');
assert.strictEqual(storage.getTransactions().filter(x=>x.system_kind==='opening_balance').length,1);
assert.strictEqual(storage.getOpeningTransaction().occurred_on,'2026-08-01');

// Corrupt baseline dates are repaired instead of being preserved forever and silently ignored by the model.
storage.clearAll();
memory.set('wfb.transactions', [
  { id:1, occurred_on:'not-a-date', type:'income', amount:100, system_kind:'opening_balance', system_locked:true }
]);
storage.setOpeningBalance(200, '2026-08-21');
assert.strictEqual(storage.getOpeningTransaction().occurred_on, '2026-08-21');

// Corrupt legacy quick amounts must not brick migration/app startup.
storage.clearAll();
storage.saveSettings({ birth_date:'2000-01-01', mode:'quick', initial_assets: Infinity });
assert.doesNotThrow(() => storage.migrateKernelV033('2026-08-21'));
assert.strictEqual(storage.getOpeningBalance(), 0);

// Unsafe nextId wraps to the first free safe positive integer instead of emitting MAX_SAFE+1.
storage.clearAll();
memory.set('wfb.transactions', [
  { id:Number.MAX_SAFE_INTEGER, occurred_on:'2026-08-20', type:'expense', amount:10 },
  { id:1, occurred_on:'2026-08-20', type:'expense', amount:10 }
]);
memory.set('wfb.nextId', Number.MAX_SAFE_INTEGER);
const repairedId = storage.addTransaction({ occurred_on:'2026-08-21', type:'income', amount:1 }).id;
assert.strictEqual(repairedId,2);
assert(Number.isSafeInteger(repairedId));

// Unicode note truncation must preserve whole code points.
storage.clearAll();
const emojiNote='a'.repeat(39)+'😀Z';
const emojiTx=storage.addTransaction({ occurred_on:'2026-08-21', type:'income', amount:1, note:emojiNote });
assert.strictEqual(Array.from(emojiTx.note).length,40);
assert(emojiTx.note.endsWith('😀'));

// Future dates are rejected at the storage boundary too.
assert.throws(() => storage.addTransaction({ occurred_on:'2099-01-01', type:'expense', amount:1 }), /INVALID_DATE/);

storage.markOnboardingDone();
assert.strictEqual(storage.isOnboardingDone(), true);
storage.clearAll();
assert.strictEqual(storage.getSettings(), null);
assert.strictEqual(storage.isOnboardingDone(), false);

// Destructive clear is transactional: a partial remove failure must report failure and restore old state.
storage.saveSettings({ x: 1 });
storage.markOnboardingDone();
const originalRemove = wx.removeStorageSync;
let injected = true;
wx.removeStorageSync = function(key) { if (key === 'wfb.settings' && injected) { injected = false; throw new Error('INJECT_REMOVE_FAIL'); } memory.delete(key); };
assert.strictEqual(storage.clearAll(), false);
assert.deepStrictEqual(storage.getSettings(), { x: 1 });
assert.strictEqual(storage.isOnboardingDone(), true);
wx.removeStorageSync = originalRemove;

console.log('storage.test.js: PASS');
