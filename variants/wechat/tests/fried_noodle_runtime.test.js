const assert=require('assert');
const store=new Map();const toasts=[];
let canvasExportMode='success';
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
global.wx={
 getStorageSync(k){return store.has(k)?clone(store.get(k)):'';},setStorageSync(k,v){store.set(k,clone(v));},removeStorageSync(k){store.delete(k);},clearStorageSync(){store.clear();},
 showToast(o){toasts.push(o&&o.title);},stopPullDownRefresh(){},navigateTo(){},setNavigationBarColor(){},getWindowInfo(){return {pixelRatio:2};},
 canvasToTempFilePath(o){ if(canvasExportMode==='success') setTimeout(()=>o&&o.success&&o.success({tempFilePath:'wxfile://grid.png'}),0); }
};
let def=null;global.Page=x=>def=x;
for(const p of ['../utils/storage','../utils/model','../utils/theme','../utils/format','../utils/ritual_grid','../utils/ritual_audio','../pages/index/index']){try{delete require.cache[require.resolve(p)]}catch{}}
const storage=require('../utils/storage');const model=require('../utils/model');require('../pages/index/index');
function apply(t,path,v){const a=path.split('.');let c=t;for(let i=0;i<a.length-1;i++){c[a[i]]??={};c=c[a[i]];}c[a.at(-1)]=v;}
function page(){const p={};for(const k of Object.keys(def))p[k]=k==='data'?clone(def.data):def[k];p.setData=function(x,cb){for(const[k,v]of Object.entries(x||{}))k.includes('.')?apply(this.data,k,v):this.data[k]=v;cb&&cb.call(this)};p.paintGrid=()=>{};p.scheduleCanvasInit=()=>{};return p;}
(async()=>{
 // Valid user but nonsense chronology: a transaction before birth must be rejected at page boundary.
 storage.clearAll();
 storage.saveConfiguration({birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'manual',manual_daily_expense:100,theme:'midnight'},10000,'2026-08-21',true);
 const p=page();p.data.today='2026-08-22';p.data.settings=model.normalizeSettings(storage.getSettings());p.data.form={type:'expense',amount:'1',note:'穿越消费',date:'1990-01-01'};
 await p.submitTransaction();
 assert(toasts.includes('交易日期不能早于出生日期'));
 assert.strictEqual(storage.getTransactions().filter(x=>x.note==='穿越消费').length,0);

 // The app is backgrounded during a live ritual: destroy must settle immediately, not wait for a RAF that may never resume.
 let destroyed=0;
 p.data.ritualActive=true;p._ritualEngine={destroy(reason){destroyed++;this.reason=reason;}};
 p.onHide();assert.strictEqual(destroyed,1);

 // Static-grid RAF never calls back: snapshot must still advance via the timeout fallback.
 p._pageHidden=false;p.data.ritualActive=false;
 p._canvas={requestAnimationFrame(){return 123;}};p._ctx={};p._canvasWidth=320;p._canvasHeight=300;p._canvasDpr=2;
 p.data.gridImagePath='';
 const t0=Date.now();
 const ok=await Promise.race([p.renderGridSnapshot({total_cells:1}),new Promise(r=>setTimeout(()=>r('hung'),600))]);
 assert.notStrictEqual(ok,'hung','static snapshot must not wait forever for Canvas RAF');
 assert.strictEqual(ok,true);
 assert(Date.now()-t0<600);

 console.log('fried_noodle_runtime.test.js: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
