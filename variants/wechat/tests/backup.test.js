const assert = require('assert');
const memory = new Map();
let failKey = '';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
global.wx = {
  getStorageSync(key) { return memory.has(key) ? clone(memory.get(key)) : ''; },
  setStorageSync(key, value) { if (key === failKey) throw new Error('INJECT_WRITE_FAIL'); memory.set(key, clone(value)); },
  removeStorageSync(key) { memory.delete(key); }
};
const storage = require('../utils/storage');
const model = require('../utils/model');
storage.clearAll();
const settings = model.normalizeSettings({
  birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'manual',manual_daily_expense:100,
  theme:'paper',font_family:'serif',font_scale:'large',use_initial_assets:true,initial_assets:5000
});
storage.saveConfiguration(settings,10000,'2026-08-20',true);
storage.addTransaction({occurred_on:'2026-08-21',type:'expense',amount:88.5,note:'生活消耗'});
const backup=storage.createBackup();
assert.strictEqual(backup.schema,storage.BACKUP_SCHEMA);assert.strictEqual(backup.version,storage.BACKUP_VERSION);assert.strictEqual(backup.transactions.length,2);assert(Array.isArray(backup.expense_presets));
storage.clearAll();
const validated=storage.validateBackupDocument(backup);storage.importBackup(backup,validated.settings);
assert.strictEqual(storage.getTransactions().length,2);assert.strictEqual(storage.getOpeningBalance(),10000);assert.strictEqual(storage.getSettings().font_scale,'110');assert.strictEqual(storage.isOnboardingDone(),true);
const beforeTx=JSON.stringify(storage.getTransactions());
assert.throws(()=>storage.validateBackupDocument({schema:'other',version:1,transactions:[]}),/BACKUP_UNSUPPORTED_VERSION/);
const dup=JSON.parse(JSON.stringify(backup));dup.transactions.push({...dup.transactions[0]});assert.throws(()=>storage.validateBackupDocument(dup),/BACKUP_INVALID_ID/);assert.strictEqual(JSON.stringify(storage.getTransactions()),beforeTx);
const replacement=JSON.parse(JSON.stringify(backup));replacement.settings.theme='midnight';replacement.transactions[0].amount=4321;
const oldSettings=JSON.stringify(storage.getSettings()),oldTransactions=JSON.stringify(storage.getTransactions());failKey='wfb.settings';assert.throws(()=>storage.importBackup(replacement,model.normalizeSettings(replacement.settings)));failKey='';assert.strictEqual(JSON.stringify(storage.getSettings()),oldSettings);assert.strictEqual(JSON.stringify(storage.getTransactions()),oldTransactions);
const legacyV1=JSON.parse(JSON.stringify(backup));legacyV1.version=1;delete legacyV1.expense_presets;assert.doesNotThrow(()=>storage.validateBackupDocument(legacyV1));
console.log('backup.test.js: PASS');
