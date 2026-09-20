const assert = require('assert');
const r = require('../utils/ritual_grid');

function fakeGradient(){ return {addColorStop(){}}; }
function context({throwAfter=Infinity}={}){
  let draws=0;
  return {
    fillStyle:'',globalCompositeOperation:'source-over',imageSmoothingEnabled:true,
    setTransform(){},clearRect(){},save(){},restore(){},translate(){},scale(){},beginPath(){},rect(){},fill(){},drawImage(){},
    fillRect(){ if(++draws>throwAfter) throw new Error('DRAW_BOOM'); },
    createRadialGradient(){return fakeGradient();},createLinearGradient(){return fakeGradient();}
  };
}
function canvas(ctx){ return {width:1,height:1,getContext(){return ctx;}}; }
const palette={background:'#000',unlit:'#222',lit:'#ffd166',asset:'#9cc3ff',bloom:'#fff4d6',ash:'#5a4030',past:'#111',trackedPast:'#333'};
const before={total_cells:1000,future_cells:1000,past_cells:0,tracked_past_cells:0,asset_lit:0,income_lit:100,lit_count:100};
const after={...before,income_lit:120,lit_count:120};

(async()=>{
  // destroy() must settle the pending run quickly.
  let t=0;
  const e1=new r.RitualGrid(canvas(context()),{now:()=>t,requestFrame:cb=>setTimeout(()=>{t+=16;cb(t)},1),cancelFrame:id=>clearTimeout(id)});
  e1.resize(390,600,1);
  const p1=e1.run({before,after,palette,kind:'ignite'});
  setTimeout(()=>e1.destroy('test-destroy'),5);
  const result1=await Promise.race([p1,new Promise((_,rej)=>setTimeout(()=>rej(new Error('destroy did not settle')),250))]);
  assert.strictEqual(result1.aborted,true);

  // Starting a new run must settle the old one instead of leaving it pending.
  t=0;
  const e2=new r.RitualGrid(canvas(context()),{now:()=>t,requestFrame:cb=>setTimeout(()=>{t+=16;cb(t)},1),cancelFrame:id=>clearTimeout(id)});
  e2.resize(390,600,1);
  const old=e2.run({before,after,palette,kind:'ignite'});
  await new Promise(r=>setTimeout(r,4));
  const newer=e2.run({before,after:{...before,income_lit:101,lit_count:101},palette,kind:'ignite',timing:{focusMs:1,igniteMs:2,settleMs:1,maxSequenceMs:1}});
  const oldResult=await Promise.race([old,new Promise((_,rej)=>setTimeout(()=>rej(new Error('restart did not settle old run')),250))]);
  assert.strictEqual(oldResult.aborted,true);
  await newer;

  // Drawing exceptions must reject, not become uncaught + pending.
  t=0;
  const e3=new r.RitualGrid(canvas(context({throwAfter:3})),{now:()=>t,requestFrame:cb=>setTimeout(()=>{t+=16;cb(t)},1),cancelFrame:id=>clearTimeout(id)});
  e3.resize(390,600,1);
  let rejected=false;
  try { await e3.run({before,after,palette,kind:'ignite'}); } catch(err) { rejected=/DRAW_BOOM/.test(String(err)); }
  assert.strictEqual(rejected,true);

  // Resize during run must preserve a valid backing size and still settle.
  t=0;
  const c4=canvas(context());
  const e4=new r.RitualGrid(c4,{now:()=>t,requestFrame:cb=>setTimeout(()=>{t+=16;cb(t)},1),cancelFrame:id=>clearTimeout(id)});
  e4.resize(390,600,2);
  const p4=e4.run({before,after:{...before,income_lit:103,lit_count:103},palette,kind:'ignite',timing:{focusMs:10,igniteMs:30,settleMs:10,maxSequenceMs:30}});
  setTimeout(()=>e4.resize(320,480,3),5);
  const r4=await p4;
  assert.strictEqual(r4.aborted,false);
  assert.strictEqual(c4.width,960);
  assert.strictEqual(c4.height,1440);

  console.log('ritual_fault_regression.test.js: PASS');
})().catch(err=>{console.error(err);process.exit(1)});
