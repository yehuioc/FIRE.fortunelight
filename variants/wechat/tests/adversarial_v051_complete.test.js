const assert = require('assert');
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function loadStorage(memory, hooks={}) {
  global.wx = {
    getStorageSync(k){ if (hooks.failRead === k) throw new Error('READ_FAIL'); return memory.has(k) ? clone(memory.get(k)) : ''; },
    setStorageSync(k,v){ if (hooks.failWrite === k) throw new Error('WRITE_FAIL'); memory.set(k,clone(v)); },
    removeStorageSync(k){ if (hooks.failRemove === k) throw new Error('REMOVE_FAIL'); memory.delete(k); }
  };
  for (const p of ['../utils/storage','../utils/model']) { try { delete require.cache[require.resolve(p)]; } catch {} }
  return { storage:require('../utils/storage'), model:require('../utils/model') };
}

// 1) Cent fidelity: never silently round a third decimal place.
{
  const mem=new Map(); const {storage,model}=loadStorage(mem);
  assert.strictEqual(storage.toCurrencyCents('0.29'),29);
  assert.strictEqual(model.moneyToCents(0.29),29);
  for (const x of ['0.009','1.005','99.999']) { assert.strictEqual(storage.toCurrencyCents(x),null); assert.strictEqual(model.moneyToCents(x),null); }
  assert.throws(()=>storage.addTransaction({occurred_on:'2026-08-20',type:'expense',amount:'1.005'}),/INVALID_AMOUNT/);
}

// 2) Strict read boundary: a read failure must never be interpreted as an empty ledger before a write/export/delete.
{
  const mem=new Map(); let env=loadStorage(mem); const s=env.storage, m=env.model;
  s.saveSettings(m.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}));
  s.setOpeningBalance(10000,'2026-08-01');
  s.addTransaction({occurred_on:'2026-08-20',type:'expense',amount:10,note:'old'});
  const bucketKey=s.bucketKey('2026-08'); const original=clone(mem.get(bucketKey));
  env=loadStorage(mem,{failRead:bucketKey});
  assert.throws(()=>env.storage.addTransaction({occurred_on:'2026-08-20',type:'income',amount:1}),/STORAGE_READ_FAILED/);
  assert.throws(()=>env.storage.deleteTransaction(original[1].id),/STORAGE_READ_FAILED/);
  assert.throws(()=>env.storage.createBackup(),/STORAGE_READ_FAILED/);
  assert.deepStrictEqual(mem.get(bucketKey),original);
}

// 3) Legacy quick-model migration preserves logical data under meaningful write failures.
for (const failKey of ['wfb.tx.2026-08','wfb.settings','wfb.kernelVersion']) {
  const mem=new Map(); const hooks={failWrite:''}; let env=loadStorage(mem,hooks); const s=env.storage;
  const old={birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100,use_initial_assets:true,initial_assets:10000};
  mem.set('wfb.settings',clone(old)); hooks.failWrite=failKey; env=loadStorage(mem,hooks);
  assert.throws(()=>env.storage.migrateKernelV033('2026-08-20')); hooks.failWrite='';
  assert.deepStrictEqual(mem.get('wfb.settings'),old);
  assert.strictEqual(env.storage.getOpeningBalance(),0);
  assert.strictEqual(mem.get('wfb.kernelVersion'),undefined);
}

// 4) Clear is transactional: partial delete failure restores prior state.
{
  const mem=new Map(); const hooks={failRemove:''}; let {storage,model}=loadStorage(mem,hooks);
  storage.saveConfiguration(model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}),1000,'2026-08-20',true);
  const before=clone([...mem.entries()]); hooks.failRemove='wfb.settings';
  assert.strictEqual(storage.clearAll(),false); hooks.failRemove='';
  assert.deepStrictEqual([...mem.entries()],before);
}

// 5) Dirty internal metadata cannot create locked ghost expenses or duplicate baselines.
{
  const mem=new Map(); const {storage}=loadStorage(mem);
  mem.set(storage.KEYS.transactions,[
    {id:1,occurred_on:'2026-08-01',type:'income',amount:1000,system_kind:'opening_balance',system_locked:true},
    {id:2,occurred_on:'2026-08-02',type:'income',amount:2000,system_kind:'opening_balance',system_locked:true},
    {id:3,occurred_on:'2026-08-03',type:'expense',amount:20,system_kind:'opening_balance',system_locked:true},
    {id:4,occurred_on:'2026-08-04',type:'expense',amount:30,system_kind:'weird',system_locked:true}
  ]);
  const tx=storage.getTransactions(); assert.strictEqual(tx.filter(x=>x.system_kind===storage.OPENING_KIND).length,1);
  const e3=tx.find(x=>x.id===3),e4=tx.find(x=>x.id===4); assert(e3&&!e3.system_locked&&!e3.system_kind); assert(e4&&!e4.system_locked&&!e4.system_kind);
  assert.strictEqual(storage.deleteTransaction(3),true); assert.strictEqual(storage.deleteTransaction(4),true);
}

// 6) Device clock rollback: existing future-looking rows remain visible/backed up, but model does not count them until their date arrives.
{
  const mem=new Map(); const {storage,model}=loadStorage(mem);
  const settings=model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'manual',manual_daily_expense:100}); storage.saveSettings(settings); storage.markOnboardingDone();
  mem.set(storage.KEYS.transactions,[{id:1,occurred_on:'2026-08-24',type:'income',amount:1000,note:'跨时区前已记'}]);
  assert.strictEqual(storage.getTransactions().length,1); const backup=storage.createBackup(); assert.strictEqual(backup.transactions.length,1); assert.doesNotThrow(()=>storage.validateBackupDocument(backup));
  assert.strictEqual(model.computeStats(settings,storage.getTransactions(),new Date(2026,7,23,12)).total_income,0);
  assert.strictEqual(model.computeStats(settings,storage.getTransactions(),new Date(2026,7,24,12)).total_income,1000);
}

// 7) Restore rebuilds internal metadata; backup cannot force migration state or next id.
{
  const mem=new Map(); const {storage,model}=loadStorage(mem); const settings=model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100});
  const doc={schema:storage.BACKUP_SCHEMA,version:1,settings,transactions:[{id:7,occurred_on:'2026-08-20',type:'income',amount:100}],onboarding_done:true,kernel_version:'0.0.1',next_id:Number.MAX_SAFE_INTEGER};
  storage.importBackup(doc,settings); assert.strictEqual(mem.get(storage.KEYS.kernelVersion),storage.CURRENT_KERNEL_VERSION); assert.strictEqual(mem.get(storage.KEYS.nextId),7);
  const next=storage.addTransaction({occurred_on:'2026-08-20',type:'expense',amount:1}); assert.strictEqual(next.id,8);
}

// 8) Legacy settings become a current, self-restorable backup.
{
  const mem=new Map(); const {storage}=loadStorage(mem); mem.set(storage.KEYS.settings,{birth_date:'2000-01-01',target_age:80,avg_daily_expense_override:88,show_past:true,use_initial_assets:true,initial_assets:1000}); mem.set(storage.KEYS.transactions,[]); mem.set(storage.KEYS.onboarding,true);
  const b=storage.createBackup(); assert.strictEqual(b.settings.mode,'advanced'); assert.strictEqual(b.settings.expense_mode,'manual'); assert.strictEqual(b.settings.manual_daily_expense,88); assert.strictEqual(b.settings.font_family,'system'); assert.doesNotThrow(()=>storage.validateBackupDocument(b));
}

// 9) A target age that has naturally elapsed is still a recoverable backup; data is retained and model exposes the state explicitly.
{
  const mem=new Map(); const {storage,model}=loadStorage(mem); const settings=model.normalizeSettings({birth_date:'1980-01-01',target_age:40,mode:'quick',manual_daily_expense:100});
  const doc={schema:storage.BACKUP_SCHEMA,version:1,settings,transactions:[{id:1,occurred_on:'2020-01-01',type:'income',amount:1000}],onboarding_done:true}; assert.doesNotThrow(()=>storage.validateBackupDocument(doc)); storage.importBackup(doc,settings);
  const st=model.computeStats(settings,storage.getTransactions(),new Date(2026,7,23,12)); assert.strictEqual(st.target_reached,true); assert(model.insight(st,settings).includes('目标年龄'));
}

// 10) Very large legal ledgers retain exact integer freedom-day floors without BigInt in production code.
{
  const mem=new Map(); const {model}=loadStorage(mem); const settings={birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'manual',manual_daily_expense:100}; const now=new Date(2026,7,23,12);
  for (const n of [1000,10000]) { const tx=[]; for(let i=0;i<n;i++)tx.push({id:i+1,occurred_on:'2026-08-20',type:'income',amount:999999999999});tx.push({id:n+1,occurred_on:'2026-08-20',type:'expense',amount:999999999999});const st=model.computeStats(settings,tx,now);const expected=(BigInt(n-1)*99999999999900n)/10000n;assert.strictEqual(st.income_freedom,expected>BigInt(Number.MAX_SAFE_INTEGER)?Number.MAX_SAFE_INTEGER:Number(expected)); }
}

console.log('adversarial_v051_complete.test.js: PASS');
