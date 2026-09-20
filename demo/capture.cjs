/* Capture real product UI against a synthetic, isolated ledger. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const work = path.join(__dirname, '.work');
const assets = path.join(__dirname, 'assets');
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(assets, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = work;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const python = process.env.FORTUNE_TEST_PYTHON || path.join(root,'.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const pause = ms => new Promise(r=>setTimeout(r,ms));
let browser, server, log;
const evidence = {synthetic:true, source_app_version:'1.0.0', events:[], clips:{}, errors:[]};

async function freePort() {
  const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
async function command(file,args) {
  return new Promise((resolve,reject)=>cp.execFile(file,args,{cwd:root,windowsHide:true,maxBuffer:2e6},(err,out,stderr)=>err?reject(Error(stderr||err.message)):resolve(out)));
}

async function main() {
  const port=await freePort(), base=`http://127.0.0.1:${port}`;
  const database=path.join(work,`capture-${Date.now()}.db`);
  log=fs.openSync(path.join(work,'app.log'),'w');
  server=cp.spawn(python,['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',String(port)],{cwd:root,windowsHide:true,env:{...process.env,FORTUNE_DB_PATH:database},stdio:['ignore',log,log]});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(100);}
  const api=async(route,body)=>{const r=await fetch(base+'/api'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(await r.text());return r.json();};
  const today=new Date(), day=iso(today);
  const rows=[{id:1,type:'income',amount:30000,occurred_on:day,system_kind:'opening_balance',note:'起始自由本金',created_at:day}];
  const categories=[['meal','日常餐饮',72],['transport','通勤',28],['housing_comms','住宿与通信',1200],['study_work','书籍与工具',160],['entertainment','周末生活',120],['household','日常用品',80]];
  let totalExpense=0;
  for(let i=27;i>=1;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);
    const [category,note,amount]=categories[i%categories.length];totalExpense+=amount;
    rows.push({id:rows.length+1,type:'expense',amount,occurred_on:iso(d),category_id:category,detail_tag:note,nature:i%3?'necessary':'adjustable',note,created_at:iso(d)});
  }
  const earlier=new Date(today);earlier.setDate(earlier.getDate()-28);
  rows.push({id:rows.length+1,type:'income',amount:totalExpense,occurred_on:iso(earlier),note:'示例期间新增财富',created_at:iso(earlier)});
  const settings={birth_date:'2000-01-01',target_age:80,mode:'quick',expense_mode:'manual',manual_daily_expense:100,theme:'midnight',font_family:'system',font_scale:100,ritual_enabled:true,sound_enabled:false,habit_center:true,weekly_review_enabled:false,missed_prompt_enabled:false,home_module_order:['overview','life','entry','habits']};
  const document={schema:'fortune-light-backup',version:1,settings,transactions:rows,expense_presets:[]};
  const preview=await api('/backup/preview',document);await api('/backup/restore',{document,...preview,confirm:true});
  evidence.before=(await api('/state')).stats;assert.equal(evidence.before.freedom_days_bought,300);
  browser=await chromium.launch({headless:true,executablePath:process.env.FORTUNE_BROWSER||chromium.executablePath()});
  async function pageContext(record=false){
    const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2,...(record?{recordVideo:{dir:work,size:{width:1280,height:900}}}:{})});
    const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))evidence.errors.push('external request');});
    const origin=Date.now();await page.goto(base);await page.waitForFunction(()=>Number(document.querySelector('#freedom-days').textContent)>0);
    await page.addStyleTag({content:'html{scroll-behavior:auto!important} #toast{display:none!important}'});
    await page.evaluate(()=>{const cursor=document.createElement('div');cursor.id='demo-cursor';cursor.style.cssText='position:fixed;left:-60px;top:-60px;width:20px;height:20px;border:2px solid #e9c477;border-radius:50%;background:#e9c47744;box-shadow:0 0 0 6px #e9c47715;pointer-events:none;z-index:999999;transform:translate(-50%,-50%);';document.body.append(cursor);document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});document.addEventListener('mousedown',()=>cursor.style.background='#ffe7a7cc');document.addEventListener('mouseup',()=>cursor.style.background='#e9c47744');});
    if(!record)await page.addStyleTag({content:'#demo-cursor{display:none!important}'});
    return {context,page,origin};
  }
  let {context,page}=await pageContext();
  await pause(800);await page.screenshot({path:path.join(assets,'home.png')});
  await page.locator('[data-module=overview]').screenshot({path:path.join(assets,'overview-300.png')});
  await page.locator('[data-module=life]').screenshot({path:path.join(assets,'life-300.png')});
  await context.close();

  async function clip(kind,amount,expected,duration){
    const c=await pageContext(true), {page,context}=c;
    await page.locator('[data-module=entry]').scrollIntoViewIfNeeded();
    if(kind==='income')await page.locator('[data-type=income]').click();
    else{await page.locator('#tx-category').selectOption('entertainment');await page.locator('#tx-nature').selectOption('adjustable');}
    await page.locator('#tx-note').fill(kind==='income'?'项目收入':'周末短途体验');
    await page.locator('#tx-amount').focus();await page.mouse.move(450,450);
    const start=(Date.now()-c.origin)/1000;
    await page.locator('#tx-amount').pressSequentially(String(amount),{delay:170});
    await pause(650);const button=await page.locator('#submit-tx').boundingBox();
    await page.mouse.move(button.x+button.width*.65,button.y+button.height*.5,{steps:18});await pause(300);
    const submitAt=(Date.now()-c.origin)/1000-start;
    await page.locator('#submit-tx').click();
    await page.locator('#ritual-overlay').waitFor({state:'visible'});
    await page.locator('#ritual-overlay').waitFor({state:'hidden',timeout:22000});
    await page.waitForFunction(n=>Number(document.querySelector('#freedom-days').textContent.replaceAll(',',''))===n,expected);
    await page.locator('[data-module=overview]').scrollIntoViewIfNeeded();await pause(750);
    await page.locator('[data-module=overview]').screenshot({path:path.join(assets,`overview-${expected}.png`)});
    const end=(Date.now()-c.origin)/1000;
    const video=page.video();await context.close();const recording=await video.path();
    const actual=end-start;
    await command(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',recording,'-t',String(actual),'-an','-vf',`setpts=${duration/actual}*PTS,fps=30`,'-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',path.join(assets,kind+'.mp4')]);
    evidence.clips[kind]={raw_seconds:actual,edited_seconds:duration,submit_at:submitAt*duration/actual,capture:recording};
    const stats=(await api('/state')).stats;assert.equal(stats.freedom_days_bought,expected);
    evidence.events.push({kind,amount,days:expected,net:stats.net_savings});console.log(kind,expected);
  }
  await clip('income',3000,330,10.3);
  await clip('expense',300,327,9.3);

  ({context,page}=await pageContext());
  await page.locator('nav [data-page=analysis]').click();await page.waitForFunction(()=>document.querySelector('#category-bars').textContent.includes('正餐'));
  await pause(600);await page.screenshot({path:path.join(assets,'analysis.png')});
  await page.locator('#trend-chart').screenshot({path:path.join(assets,'trend.png')});
  await page.locator('nav [data-page=history]').click();await page.waitForFunction(()=>document.querySelector('#history-list').textContent.includes('周末短途体验'));
  await pause(200);await page.screenshot({path:path.join(assets,'history.png')});
  await page.locator('nav [data-page=home]').click();await page.locator('#open-settings').click();await page.locator('#cfg-theme').selectOption('paper');
  await page.locator('#settings-form button[type=submit]').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');await pause(500);
  await page.screenshot({path:path.join(assets,'home-paper.png')});await context.close();
  assert.deepEqual(evidence.errors,[]);fs.writeFileSync(path.join(work,'capture-evidence.json'),JSON.stringify(evidence,null,2));
  console.log('CAPTURE COMPLETE: 300 → 330 → 327; synthetic data; no external network');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server){server.kill();}if(log!==undefined)fs.closeSync(log);});
