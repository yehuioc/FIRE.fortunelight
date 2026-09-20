const assert = require('assert');
const store = new Map();
const toasts=[];
global.wx={
  getStorageSync(k){return store.has(k)?store.get(k):'';},
  setStorageSync(k,v){store.set(k,v);},removeStorageSync(k){store.delete(k);},
  showToast(o){toasts.push(o&&o.title);},stopPullDownRefresh(){},navigateTo(){},setNavigationBarColor(){},
  getWindowInfo(){return {pixelRatio:2};},canvasToTempFilePath(o){o&&o.success&&o.success({tempFilePath:'wxfile://grid.png'});}
};
let def=null;global.Page=x=>def=x;
for(const p of ['../utils/storage','../utils/model','../utils/theme','../pages/index/index']){try{delete require.cache[require.resolve(p)]}catch{}}
const storage=require('../utils/storage');
const model=require('../utils/model');
require('../pages/index/index');
function clone(v){return JSON.parse(JSON.stringify(v));}
function apply(t,path,v){const a=path.split('.');let c=t;for(let i=0;i<a.length-1;i++){c[a[i]]??={};c=c[a[i]];}c[a[a.length-1]]=v;}
function page(){const p={};for(const k of Object.keys(def))p[k]=k==='data'?clone(def.data):def[k];p.setData=function(x,cb){for(const[k,v]of Object.entries(x||{}))k.includes('.')?apply(this.data,k,v):this.data[k]=v;cb&&cb.call(this)};p.scheduleCanvasInit=()=>{};p.renderGridSnapshot=async()=>true;p.runRitual=async function(){this._ritualCalls=(this._ritualCalls||0)+1;return {played:true};};return p;}
(async()=>{
  storage.clearAll();
  const today=model.isoDate();
  storage.saveSettings({birth_date:'2000-01-01',target_age:80,mode:'advanced',expense_mode:'ledger',theme:'midnight'});
  storage.markOnboardingDone();
  storage.addTransaction({occurred_on:today,type:'income',amount:1000000,note:'已有资金'});
  const p=page();p.onLoad();p.renderGridSnapshot=async()=>true;
  p.data.form.type='expense';p.data.form.amount='1';p.data.form.date=today;p.data.form.category_id='meal';
  await p.submitTransaction();
  assert.strictEqual(p._ritualCalls||0,0,'first cost calibration must not play gain/loss ritual');
  assert.strictEqual(p.data.lastFeedback.kind,'calibration');
  assert.strictEqual(p.data.lastFeedback.suppressCelebration,true);
  assert(p.data.lastFeedback.detail.includes('生活成本这把尺被建立'));
  console.log('calibration_page.test.js: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
