const assert=require('assert');
const mem=new Map();
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const ONE_MB=1024*1024;
global.wx={
  getStorageSync(k){return mem.has(k)?clone(mem.get(k)):'';},
  setStorageSync(k,v){if(bytes(v)>ONE_MB)throw new Error('SINGLE_KEY_LIMIT');mem.set(k,clone(v));},
  removeStorageSync(k){mem.delete(k);}
};
try{delete require.cache[require.resolve('../utils/storage')]}catch{}
const storage=require('../utils/storage');

// v0.5.x single-key data migrates once and old unknown classification is preserved honestly.
const legacy=[];for(let i=0;i<1000;i++)legacy.push({id:i+1,occurred_on:`2026-${String(1+(i%9)).padStart(2,'0')}-${String(1+(i%27)).padStart(2,'0')}`,type:'expense',amount:10+(i%5),note:'旧账'});
mem.set(storage.KEYS.transactions,legacy);mem.set(storage.KEYS.nextId,1000);
const migrated=storage.getTransactionsStrict();
assert.strictEqual(migrated.length,1000);
assert.strictEqual(mem.has(storage.KEYS.transactions),false,'legacy single-key ledger should be removed after verified bucket migration');
assert(migrated.every(x=>x.category_id==='uncategorized'&&x.nature==='unset'));
const idx=mem.get(storage.KEYS.ledgerIndex);assert(idx&&idx.months.length===9);
idx.months.forEach(month=>assert(bytes(mem.get(storage.bucketKey(month)))<ONE_MB));

// 10k rows with long Chinese notes still stay split by month; no bucket gets near the 1 MB key ceiling.
storage.clearAll();
const rows=[];let id=1;
for(let year=2022;year<=2026;year++)for(let month=1;month<=12;month++)for(let day=1;day<=28;day++)for(let k=0;k<6;k++){
  if(rows.length>=10000)break;
  rows.push({id:id++,occurred_on:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,type:'expense',amount:12.34,category_id:k%2?'meal':'snack_drink',detail_tag:k%2?'日常吃饭':'奶茶',nature:k%2?'necessary':'avoidable',note:'这是用于验证长期账本分桶与中文备注空间占用的四十字以内测试内容'});
}
const t0=Date.now();storage.saveTransactions(rows);const writeMs=Date.now()-t0;
const index=mem.get(storage.KEYS.ledgerIndex);assert(index.months.length>12);
let maxBucket=0;index.months.forEach(month=>{const n=bytes(mem.get(storage.bucketKey(month)));maxBucket=Math.max(maxBucket,n);assert(n<ONE_MB);});
const t1=Date.now();const back=storage.getTransactionsStrict();const readMs=Date.now()-t1;
assert.strictEqual(back.length,10000);
const page=storage.getTransactionPage(0,100);assert.strictEqual(page.items.length,100);assert.strictEqual(page.total,10000);assert.strictEqual(page.hasMore,true);
console.log(`v060_storage_buckets.test.js: PASS (10k write ${writeMs}ms, read ${readMs}ms, max bucket ${maxBucket} bytes)`);
