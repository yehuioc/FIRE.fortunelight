/* Real browser acceptance against disposable SQLite. npm install --no-save playwright if needed. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'tmp'), {recursive:true});
const tmp = fs.mkdtempSync(path.join(root, 'tmp', 'browser-'));
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = path.join(root, '.evidence');
fs.mkdirSync(evidence, { recursive: true });
const python = process.env.FORTUNE_TEST_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const date = new Date();
const today = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
let server, browser, page, log;
const errors = [], unexpectedNetwork = [];

async function freePort() {
  const s = net.createServer();
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  const p = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return p;
}
async function main() {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  log = fs.openSync(path.join(tmp,'server.log'),'w');
  server = cp.spawn(python,['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',String(port)], {cwd:root,env:{...process.env,FORTUNE_DB_PATH:path.join(tmp,'browser.db')},stdio:['ignore',log,log],windowsHide:true});
  for(let i=0;i<100;i++) { try { if((await fetch(base+'/api/health')).ok)break; }catch(_){} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({headless:true,executablePath:process.env.FORTUNE_BROWSER || chromium.executablePath(),downloadsPath:path.join(tmp,'downloads')});
  const context = await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base) && !r.url().startsWith('data:'))unexpectedNetwork.push(r.url());});
  page.on('dialog',d=>d.accept());
  page.setDefaultTimeout(10000);
  const api = async (route,body) => { const r=await context.request.fetch(base+'/api'+route,{method:body?'POST':'GET',data:body});assert.equal(r.ok(),true,await r.text());return r.json(); };
  await page.goto(base);
  await page.locator('#onboarding-dialog').waitFor({state:'visible'});
  await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();
  await page.locator('#cfg-birth').fill('2000-01-01');await page.locator('#cfg-cost').fill('80');await page.locator('#cfg-opening').fill('8000');
  await page.locator('#settings-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#freedom-days').textContent==='100');
  console.log('PASS first-run setup yields 100 exact days');
  await page.locator('#tx-amount').fill('800');await page.locator('#tx-category').selectOption('meal');await page.locator('#tx-nature').selectOption('necessary');await page.locator('#tx-note').fill('真实午餐测试');
  await page.locator('#submit-tx').click();await page.locator('#ritual-overlay').waitFor({state:'visible'});await page.locator('#skip-ritual').click();
  await page.waitForFunction(()=>document.querySelector('#freedom-days').textContent==='90');
  assert.equal((await api('/state')).transaction_count,2);
  console.log('PASS transaction saves first, skip aligns to authoritative 90 days');
  await page.locator('#open-settings').click();await page.locator('#cfg-ritual_enabled').uncheck();await page.locator('#settings-form button[type=submit]').click();
  await page.locator('#settings-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled);
  await page.locator('#tx-amount').fill('0.29');await page.locator('#tx-note').fill('<img src=x onerror=alert(1)>');await page.locator('#submit-tx').click();
  await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled && document.querySelector('#tx-amount').value==='');
  assert.equal(await page.locator('#recent-list img').count(),0);
  await page.locator('nav [data-page=history]').click();await page.locator('#history-query').fill('真实午餐测试');await page.locator('#search-history').click();
  await page.waitForFunction(()=>document.querySelectorAll('#history-list .transaction').length===1);
  await page.locator('#history-list [data-edit]').click();await page.locator('#edit-amount').fill('400');await page.locator('#edit-form button[type=submit]').click();
  await page.locator('#edit-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#history-list').textContent.includes('400.00'));
  assert.equal((await api('/state')).stats.total_expense,400.29);
  console.log('PASS search, edit, recomputation and escaped user text');
  await page.locator('nav [data-page=home]').click();await page.locator('[data-page=presets]').click();
  await page.locator('#preset-category').selectOption('meal');await page.locator('#preset-label').fill('工作午餐');await page.locator('#preset-note').fill('默认备注');await page.locator('#preset-nature').selectOption('necessary');await page.locator('#preset-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#preset-list').textContent.includes('工作午餐'));
  await page.locator('nav [data-page=home]').click();await page.locator('#tx-category').selectOption('meal');await page.locator('#tx-preset').selectOption({label:'工作午餐'});
  assert.equal(await page.locator('#tx-note').inputValue(),'默认备注');assert.equal(await page.locator('#tx-amount').inputValue(),'');
  await page.locator('#tx-amount').fill('20');await page.locator('#submit-tx').click();await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled && document.querySelector('#tx-amount').value==='');
  assert.equal(await page.locator('#frequent-presets').isVisible(),true);
  await page.locator('nav [data-page=analysis]').click();await page.waitForFunction(()=>document.querySelector('#category-bars').textContent.includes('正餐'));
  await page.locator('#trend-category').selectOption('meal');await page.locator('#trend-tag').selectOption('工作午餐');
  await page.waitForFunction(()=>document.querySelector('#trend-table').textContent.includes('20.00'));
  await page.screenshot({path:path.join(evidence,'analysis-desktop.png'),fullPage:true});
  const downloadWait=page.waitForEvent('download');await page.locator('#export-csv').click();const dl=await downloadWait;await dl.saveAs(path.join(tmp,'report.csv'));
  assert(fs.readFileSync(path.join(tmp,'report.csv'),'utf8').includes('工作午餐'));
  console.log('PASS presets, nature, category/tag trend and CSV download');
  await page.locator('nav [data-page=home]').click();await page.locator('#open-settings').click();
  await page.locator('#cfg-theme').selectOption('paper');await page.locator('#cfg-scale').selectOption('115');await page.locator('#cfg-habit_center').uncheck();
  await page.getByText('首页模块顺序',{exact:true}).click();await page.locator('[data-move="3"][data-dir="-1"]').click();await page.locator('[data-move="2"][data-dir="-1"]').click();await page.locator('[data-move="1"][data-dir="-1"]').click();
  await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');
  assert.equal(await page.locator('[data-module=habits]').isVisible(),false);
  assert.equal(await page.locator('[data-module=entry]').evaluate(e=>e.style.order),'0');
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='paper');
  await page.screenshot({path:path.join(evidence,'desktop-paper.png'),fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
    const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert(sizes.scroll<=sizes.client,`horizontal overflow at ${width}: ${JSON.stringify(sizes)}`);
    await page.screenshot({path:path.join(evidence,`mobile-${width}-paper-115.png`),fullPage:true});
  }
  console.log('PASS persisted theme, 115% fonts, module order, hidden record center, 320/390px layout');
  await page.setViewportSize({width:1440,height:1050});await page.locator('#open-settings').click();
  const backupWait=page.waitForEvent('download');await page.locator('a[href="/api/backup"]').click();const backup=await backupWait;const backupPath=path.join(tmp,'backup.json');await backup.saveAs(backupPath);
  const original=await api('/state');
  await page.locator('#settings-dialog [data-close]').first().click();await page.locator('#tx-amount').fill('30');await page.locator('#submit-tx').click();await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled && document.querySelector('#tx-amount').value==='');
  await page.locator('#restore-file').setInputFiles(backupPath);await page.locator('#restore-dialog').waitFor({state:'visible'});await page.locator('#confirm-restore').click();await page.locator('#restore-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled);
  assert.equal((await api('/state')).transaction_count,original.transaction_count);
  await page.locator('#open-settings').click();await page.locator('#cfg-theme').selectOption('midnight');await page.locator('#cfg-scale').selectOption('100');await page.locator('#cfg-habit_center').check();await page.locator('#cfg-ritual_enabled').check();
  await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='midnight');
  await page.screenshot({path:path.join(evidence,'desktop-midnight.png'),fullPage:true});
  console.log('PASS JSON download, preview, restore and persistent preferences');
  await page.locator('#tx-amount').fill('80');await page.locator('[data-type=income]').click();await page.locator('#submit-tx').click();await page.locator('#ritual-overlay').waitFor({state:'visible'});
  await page.waitForTimeout(900);await page.screenshot({path:path.join(evidence,'ritual-active.png')});
  await page.locator('#ritual-overlay').waitFor({state:'hidden',timeout:12000});await page.waitForFunction(()=>!document.querySelector('#submit-tx').disabled);
  console.log('PASS one-day ritual completes naturally');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpectedNetwork,[]);
  console.log('BROWSER ACCEPTANCE PASS; no page errors or external network requests');
}

main().catch(async error=>{
  console.error(error.stack || error);
  console.error('Page errors:',JSON.stringify(errors));
  if(page)await page.screenshot({path:path.join(evidence,'browser-failure.png'),fullPage:true}).catch(()=>{});
  if(page)console.error((await page.locator('body').innerText()).slice(0,7000));
  process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close();
  if(server){server.kill();await new Promise(r=>server.once('exit',r));}
  if(log!==undefined)fs.closeSync(log);
  // Keep evidence and a failing fixture for diagnosis; all are project-local and ignored.
  console.log('Fixture:',tmp);
});
