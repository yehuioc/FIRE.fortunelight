const assert=require('assert');
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function apply(t,path,v){const a=path.split('.');let c=t;for(let i=0;i<a.length-1;i++){c[a[i]]??={};c=c[a[i]];}c[a.at(-1)]=v;}
function page(def){const p={};for(const[k,v]of Object.entries(def))p[k]=k==='data'?clone(v):v;p.setData=function(x,cb){for(const[k,v]of Object.entries(x||{}))k.includes('.')?apply(this.data,k,v):this.data[k]=v;cb&&cb.call(this)};return p;}

(async()=>{
  // Settings save followed by immediate manual back/unload: delayed auto-back must not pop another page.
  {
    const mem=new Map();let backs=0,def;global.wx={getStorageSync:k=>mem.has(k)?clone(mem.get(k)):'',setStorageSync:(k,v)=>mem.set(k,clone(v)),removeStorageSync:k=>mem.delete(k),setNavigationBarColor(){},showToast(){},navigateBack(){backs++;}};global.Page=x=>def=x;
    for(const p of ['../utils/storage','../utils/model','../utils/theme','../pages/settings/settings']){try{delete require.cache[require.resolve(p)]}catch{}}
    const storage=require('../utils/storage'),model=require('../utils/model');storage.saveConfiguration(model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}),1000,'2026-08-23',true);require('../pages/settings/settings');const p=page(def);p.onLoad();p.save();p.onUnload();await new Promise(r=>setTimeout(r,520));assert.strictEqual(backs,0);
  }

  // A late import callback after settings unload must not replace data.
  {
    const mem=new Map();let chooseSuccess=null,def;global.wx={getStorageSync:k=>mem.has(k)?clone(mem.get(k)):'',setStorageSync:(k,v)=>mem.set(k,clone(v)),removeStorageSync:k=>mem.delete(k),setNavigationBarColor(){},showToast(){},chooseMessageFile(o){chooseSuccess=o.success;}};global.Page=x=>def=x;
    for(const p of ['../utils/storage','../utils/model','../utils/theme','../pages/settings/settings']){try{delete require.cache[require.resolve(p)]}catch{}}
    const storage=require('../utils/storage'),model=require('../utils/model');storage.saveConfiguration(model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}),1000,'2026-08-23',true);const before=JSON.stringify(storage.getTransactions());require('../pages/settings/settings');const p=page(def);p.onLoad();p.importBackup();p.onUnload();chooseSuccess&&chooseSuccess({tempFiles:[{path:'/late.json',size:1}]});assert.strictEqual(JSON.stringify(storage.getTransactions()),before);
  }
  console.log('lifecycle_race_v051.test.js: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
