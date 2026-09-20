const assert=require('assert');const fs=require('fs');const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function applyPath(t,path,v){const a=path.split('.');let c=t;for(let i=0;i<a.length-1;i++){c[a[i]]??={};c=c[a[i]];}c[a.at(-1)]=v;}
function instantiate(def){const p={};for(const[k,v]of Object.entries(def))p[k]=k==='data'?clone(v):v;p.setData=function(x,cb){for(const[k,v]of Object.entries(x||{}))k.includes('.')?applyPath(this.data,k,v):this.data[k]=v;cb&&cb.call(this);};return p;}
function fresh(extra={}){const mem=new Map(),toasts=[];global.wx={getStorageSync:k=>mem.has(k)?clone(mem.get(k)):'',setStorageSync:(k,v)=>mem.set(k,clone(v)),removeStorageSync:k=>mem.delete(k),setNavigationBarColor(){},showToast:o=>toasts.push(o&&o.title),showModal:o=>o&&o.success&&o.success({confirm:true,cancel:false}),navigateBack(){},navigateTo(){},reLaunch(){},stopPullDownRefresh(){},getWindowInfo(){return{pixelRatio:2}},...extra};for(const p of ['../utils/storage','../utils/model','../utils/theme','../utils/format','../pages/settings/settings','../pages/index/index','../pages/history/history']){try{delete require.cache[require.resolve(p)]}catch{}}return{mem,toasts,storage:require('../utils/storage'),model:require('../utils/model')};}
function loadPage(path){let def=null;global.Page=x=>def=x;delete require.cache[require.resolve(path)];require(path);return instantiate(def);}

// 1) Advanced settings survive Quick -> save -> close page -> reopen -> Advanced.
{
 const e=fresh();const s=e.storage,m=e.model;const adv=m.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger',tracking_days_override:90,use_initial_assets:true,initial_assets:5000,show_past:true,manual_daily_expense:123,theme:'midnight'});s.saveConfiguration(adv,10000,'2026-08-20',true);
 let p=loadPage('../pages/settings/settings');p.onLoad();p.selectMode({currentTarget:{dataset:{mode:'quick'}}});p.save();if(p._saveBackTimer)clearTimeout(p._saveBackTimer);
 const quick=s.getSettings();assert.strictEqual(quick.mode,'quick');assert.strictEqual(quick.advanced_dormant.expense_mode,'ledger');assert.strictEqual(quick.advanced_dormant.initial_assets,5000);assert.strictEqual(quick.advanced_dormant.show_past,true);
 p=loadPage('../pages/settings/settings');p.onLoad();p.selectMode({currentTarget:{dataset:{mode:'advanced'}}});assert.strictEqual(p.data.form.expense_mode,'ledger');assert.strictEqual(Number(p.data.form.tracking_days_override),90);assert.strictEqual(p.data.form.use_initial_assets,true);assert.strictEqual(Number(p.data.form.initial_assets),5000);assert.strictEqual(p.data.form.show_past,true);
}

// 2) Merely sampling quick mode in onboarding must not erase advanced inputs.
{
 const e=fresh();let p=loadPage('../pages/index/index');p.scheduleCanvasInit=function(){};p.refreshState=function(){};p.onLoad();p.setData({'onboarding.mode':'advanced','onboarding.expense_mode':'ledger','onboarding.use_initial_assets':true,'onboarding.initial_assets':'5000','onboarding.show_past':true});p.selectOnboardingMode({currentTarget:{dataset:{mode:'quick'}}});p.selectOnboardingMode({currentTarget:{dataset:{mode:'advanced'}}});assert.strictEqual(p.data.onboarding.expense_mode,'ledger');assert.strictEqual(p.data.onboarding.use_initial_assets,true);assert.strictEqual(Number(p.data.onboarding.initial_assets),5000);assert.strictEqual(p.data.onboarding.show_past,true);
}

// 3) History UI is bounded even with years of normal use; full ledger remains in storage.
{
 const e=fresh();const s=e.storage,m=e.model;s.saveSettings(m.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}));s.markOnboardingDone();const rows=[];for(let i=1;i<=1250;i++)rows.push({id:i,occurred_on:'2026-08-20',type:i%2?'income':'expense',amount:1,note:'x'});e.mem.set(s.KEYS.transactions,rows);
 const p=loadPage('../pages/history/history');p.onShow();assert.strictEqual(p.data.count,1250);assert.strictEqual(p.data.items.length,100);assert.strictEqual(p.data.hasMore,true);p.loadMore();assert.strictEqual(p.data.items.length,200);assert.strictEqual(s.getTransactions().length,1250);
}

// 4) “Skip” clicked before RitualGrid exists is queued and immediately applied once the engine starts.
(async()=>{
 const e=fresh();const p=loadPage('../pages/index/index');let skipped=false,resolveRun;const engine={run(){return new Promise(r=>{resolveRun=r;});},skip(){skipped=true;resolveRun&&resolveRun({skipped:true});},destroy(){}};p.initRitualCanvas=()=>new Promise(resolve=>{p.skipRitual();resolve(engine);});p.data.ritualActive=true;p.data.settings=e.model.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100});const before={lit_count:1,future_cells:100},after={lit_count:2,future_cells:100};await p.runRitual(before,after,{delta:1,kind:'light_up'});assert.strictEqual(skipped,true);

// 5) Page hide during a live ritual settles it instead of leaving a suspended timeline.
 let destroyed='';p.data.ritualActive=true;p._ritualEngine={destroy:r=>{destroyed=r;}};p.onHide();assert.strictEqual(destroyed,'page_hidden');assert.strictEqual(p._skipRequested,true);

// 6) FREE is not terminal data state: a subsequent real expense can move the boundary back below full coverage.
 const m=e.model;const settings=m.normalizeSettings({birth_date:'2000-01-01',target_age:27,mode:'advanced',expense_mode:'manual',manual_daily_expense:100});const now=new Date(2026,7,23,12);const life=m.computeStats(settings,[{id:1,occurred_on:'2026-08-20',type:'income',amount:100000}],now);if(life.future_cells>0){const enough=(life.future_cells+10)*100;const full=m.computeStats(settings,[{id:1,occurred_on:'2026-08-20',type:'income',amount:enough}],now);const afterExpense=m.computeStats(settings,[{id:1,occurred_on:'2026-08-20',type:'income',amount:enough},{id:2,occurred_on:'2026-08-20',type:'expense',amount:2000}],now);assert(full.progress===1);assert(afterExpense.lit_count<full.lit_count);assert(m.feedbackForChange(full,afterExpense,'expense',settings,2000).delta<0);}

// 7) Rebuilt onboarding over an existing ledger must preserve it and reject a birth date that would ghost old rows.
 {
  const env=fresh();const s2=env.storage,m2=env.model;env.mem.set(s2.KEYS.transactions,[{id:1,occurred_on:'2005-01-01',type:'income',amount:10000,note:'old'}]);
  let q=loadPage('../pages/index/index');q.scheduleCanvasInit=function(){};q.renderGridSnapshot=function(){};q.onLoad();q.setData({guideStep:5,'onboarding.birth_date':'2010-01-01','onboarding.target_age':'80','onboarding.manual_daily_expense':'100','onboarding.opening_balance':'0'});q.nextGuide();assert(env.toasts.some(x=>String(x).includes('已有账本早于出生日期')));assert.strictEqual(s2.getTransactions().length,1);
  q.setData({'onboarding.birth_date':'2000-01-01'});q.nextGuide();assert.strictEqual(s2.getTransactions().filter(x=>x.system_kind!==s2.OPENING_KIND).length,1);
 }

// 8) Rapid double-tap after successful onboarding cannot initialize twice.
 {
  const env=fresh();const s2=env.storage;let calls=0;const original=s2.saveConfiguration;s2.saveConfiguration=(...a)=>{calls++;return original(...a);};let q=loadPage('../pages/index/index');q.scheduleCanvasInit=function(){};q.renderGridSnapshot=function(){};q.onLoad();q.setData({guideStep:5,'onboarding.birth_date':'2000-01-01','onboarding.target_age':'80','onboarding.manual_daily_expense':'100','onboarding.opening_balance':'1000'});q.nextGuide();q.nextGuide();assert.strictEqual(calls,1);
 }

// 9) Export filenames remain unique even under two exports in the same tick.
 {
  const paths=[];const env=fresh({env:{USER_DATA_PATH:'/u'},getFileSystemManager(){return{writeFile(o){paths.push(o.filePath);o.success&&o.success();}}},shareFileMessage(o){o.success&&o.success();}});const s2=env.storage,m2=env.model;s2.saveConfiguration(m2.normalizeSettings({birth_date:'2000-01-01',target_age:80,mode:'quick',manual_daily_expense:100}),0,'2026-08-20',true);const q=loadPage('../pages/settings/settings');q.onLoad();q.exportBackup();q.exportBackup();assert.strictEqual(paths.length,2);assert.notStrictEqual(paths[0],paths[1]);
 }

// 10) Product copy never instructs the user to use a nonexistent transaction editor for refunds.
 const copies=fs.readFileSync('pages/index/index.wxml','utf8')+fs.readFileSync('pages/guide/guide.wxml','utf8')+fs.readFileSync('pages/history/history.js','utf8');assert(copies.includes('删除原支出'));assert(copies.includes('最终真实净消耗'));assert(!copies.includes('优先修正原支出'));
 console.log('fried_noodle_v051_complete.test.js: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
