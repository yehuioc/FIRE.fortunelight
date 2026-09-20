const assert=require('assert');
const mem=new Map();const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
global.wx={getStorageSync:k=>mem.has(k)?clone(mem.get(k)):'',setStorageSync:(k,v)=>mem.set(k,clone(v)),removeStorageSync:k=>mem.delete(k)};
try{delete require.cache[require.resolve('../utils/storage')]}catch{}
const storage=require('../utils/storage');const model=require('../utils/model');
storage.clearAll();
const settings=model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100});
storage.saveConfiguration(settings,1000,'2026-09-01',true);
const preset=storage.addExpensePreset({category_id:'meal',label:'聚餐',note:'和朋友聚餐',nature:'adjustable'});
assert.strictEqual(preset.label,'聚餐');
storage.addTransaction({occurred_on:'2026-09-19',type:'expense',amount:128,category_id:'meal',detail_tag:'聚餐',nature:'adjustable',note:'四人晚饭'});
const b=storage.createBackup();assert.strictEqual(b.version,2);assert.strictEqual(b.expense_presets.length,1);assert.strictEqual(b.transactions.find(x=>x.type==='expense').detail_tag,'聚餐');
storage.clearAll();storage.importBackup(b,storage.validateBackupDocument(b).settings);
assert.strictEqual(storage.getExpensePresets()[0].note,'和朋友聚餐');
const restored=storage.getTransactions().find(x=>x.type==='expense');assert.strictEqual(restored.category_id,'meal');assert.strictEqual(restored.detail_tag,'聚餐');assert.strictEqual(restored.nature,'adjustable');
console.log('v060_presets_backup.test.js: PASS');
