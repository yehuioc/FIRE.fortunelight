/* Fortune Light desktop controller. SQLite owns truth; animations never write it. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => '¥' + Number(n || 0).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
  const integer = n => Number(n || 0).toLocaleString('zh-CN');
  const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = () => iso();
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate()-1); return iso(d); };
  let S = null, busy = false, page = 'home', txType = 'expense', editId = null, historyOffset = 0;
  let historyRows = [], historyTotal = 0, analysisRequest = 0, historyRequest = 0;
  let pendingEntry = null, restoreDocument = null, restorePreview = null, order = [], dormant = {};
  let onboardingStep = 0, onboardingAppearance = {}, lastDay = today();
  const moduleNames = {overview:'自由概览',life:'人生方格',habits:'记录中心',entry:'记一笔真实的账'};
  const switchNames = {sound_enabled:'仪式声音',ritual_enabled:'点亮 / 熄灭仪式',inline_tips_enabled:'记账区简短说明',freedom_delta_hint:'小数自由天数提示',habit_center:'首页记录中心',achievements_enabled:'成就',quick_entry_enabled:'最近常用快捷入口',missed_prompt_enabled:'温和漏记提示',weekly_review_enabled:'每周回顾提醒灯'};
  const audio = new window.RitualAudio();
  let grid;
  try { grid = new window.LifeGrid($('#grid'), audio); grid.mount(); } catch (_) { $('#grid-empty').textContent = '当前浏览器无法绘制方格，账本与统计仍可使用。'; }

  async function api(path, method = 'GET', body) {
    const response = await fetch('/api' + path, {method, headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store'});
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch (_) { throw new Error('服务未返回有效数据，请检查本地服务是否仍在运行。'); }
    if (!response.ok) {
      let detail = result.detail || '操作未完成';
      if (Array.isArray(detail)) detail = detail.map(x => x.msg).join('；');
      throw new Error(String(detail));
    }
    return result;
  }
  function clearError() { $('#error-banner').hidden = true; $$('.form-error').forEach(x => x.remove()); }
  function reportError(error) {
    const message = error.message || String(error);
    const dialog = $$('dialog[open]').at(-1);
    if (dialog) {
      dialog.querySelector('.form-error')?.remove();
      const block = document.createElement('p'); block.className = 'form-error notice'; block.setAttribute('role','alert'); block.textContent = message; dialog.prepend(block); block.scrollIntoView({block:'nearest'});
    } else { $('#error-banner').textContent = message; $('#error-banner').hidden = false; }
  }
  const safe = fn => async event => { clearError(); try { await fn(event); } catch (error) { reportError(error); } };
  function toast(title, detail = '') {
    $('#toast').innerHTML = `<strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}`;
    $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 9500);
  }
  function closeDialogs() { $$('dialog[open]').forEach(d => d.close()); }
  function dialogOpen(id) { clearError(); if (!$(id).open) $(id).showModal(); }
  function options(select, labels, first) {
    select.innerHTML = (first === undefined ? '' : `<option value="">${esc(first)}</option>`) + Object.entries(labels).map(([id,label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('');
  }
  function appearance(s) {
    document.documentElement.dataset.theme = s.theme || 'midnight';
    document.documentElement.style.setProperty('--scale', (Number(s.font_scale) || 100) / 100);
    document.documentElement.style.setProperty('--font', s.font_family === 'serif' ? '"Songti SC",SimSun,Georgia,serif' : 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif');
    audio.setMuted(!s.sound_enabled); grid?.setTheme(s.theme);
  }
  async function refresh() {
    S = await api('/state');
    render();
    return S;
  }
  function render() {
    const s = S.stats, cfg = S.settings || {};
    appearance(cfg);
    $('#version').textContent = 'v' + S.version;
    $('#first-run').hidden = !!S.settings;
    $('#freedom-days').textContent = integer(s.freedom_days_bought);
    $('#fractional-days').textContent = s.cost_ready ? `连续估算 ${Number(s.freedom_days_exact).toFixed(2)} 天 · 方格只显示完整日` : '等待有效的生活成本估计，再把资源换成时间。';
    $('#cost-label').textContent = s.cost_source;
    $('#net-savings').textContent = money(s.net_savings);
    $('#daily-cost').textContent = s.cost_ready ? money(s.avg_daily_expense) : '尚未建立';
    $('#total-income').textContent = money(s.total_income);
    $('#total-expense').textContent = money(s.total_expense);
    const ratio = s.future_cells > 0 ? s.lit_count / s.future_cells : 0;
    $('#coverage').textContent = `${(ratio * 100).toFixed(1)}% 已覆盖`;
    $('#remaining').textContent = `尚余 ${integer(Math.max(0,s.future_cells-s.lit_count))} 天`;
    $('.progress-track').setAttribute('aria-valuenow', (ratio * 100).toFixed(1));
    $('#asset-bar').style.width = `${s.future_cells ? s.asset_lit / s.future_cells * 100 : 0}%`;
    $('#income-bar').style.width = `${s.future_cells ? s.income_lit / s.future_cells * 100 : 0}%`;
    let modelNote = `${s.cost_source} · 观察跨度 ${integer(s.tracking_days)} 天。`;
    if (s.expense_mode === 'ledger') modelNote += ' 累计生活消耗 ÷ 首笔记录至今天（或覆盖天数）；漏记和补账会改变估计。';
    if (s.use_initial_assets) modelNote += ` 独立资产 ${money(s.initial_assets)}，单独折算 ${integer(s.asset_freedom)} 天，不受负净储蓄直接扣减。`;
    if (s.overflow) modelNote += ` 超出当前人生区间 ${integer(s.overflow)} 天。`;
    if (s.target_reached) modelNote += ' 已到达人生坐标，可在设置中调整目标年龄。';
    $('#model-note').textContent = modelNote;
    $('#excluded-note').hidden = !s.excluded_count;
    $('#excluded-note').textContent = `${s.excluded_count} 笔记录因日期在今天之后或出生日期之前暂不计入自由模型，完整账本和备份仍保留它们。`;
    grid?.setData(s);
    $('#grid-empty').hidden = Boolean(s.total_cells && grid);
    $('#grid-caption').textContent = `${integer(s.future_cells)} 个剩余人生方格 · 一格一天 · 描边为今天。${s.fully_covered ? '当前区间已覆盖。' : ''}`;
    $('#asset-legend').hidden = !s.use_initial_assets;
    $('#past-legend').hidden = !s.show_past;
    const homeOrder = cfg.home_module_order || Object.keys(moduleNames);
    homeOrder.forEach((id,i) => { const module = $(`[data-module="${id}"]`); if (module) module.style.order = i; });
    $('[data-module="habits"]').hidden = cfg.habit_center === false;
    $('#entry-tip').hidden = cfg.inline_tips_enabled === false;
    $('#submit-tx').disabled = busy || !S.settings;
    $('#recent-list').innerHTML = transactionList(S.transactions.slice(0,6));
    renderHabits(); renderPresets();
    const review = S.habits.weekly_review;
    $('#weekly-review').hidden = cfg.weekly_review_enabled === false || !review.available;
    $('#weekly-review').classList.toggle('unread', review.unread);
    requestAnimationFrame(() => grid?.resize());
  }
  function transactionList(rows) {
    if (!rows.length) return '<p class="empty">还没有记录。真实发生时，再留下一笔。</p>';
    return rows.map(t => `<div class="transaction ${t.type}"><span class="transaction-mark">${t.type==='income'?'↗':'↘'}</span><div class="transaction-info"><strong>${esc(t.note || (t.type==='income'?'新增财富':'生活消耗'))}</strong><small>${esc(t.occurred_on)}${t.system_kind ? ' · 系统基准收入' : t.type==='expense' ? ` · ${esc(S.categories[t.category_id])}${t.detail_tag ? ' / '+esc(t.detail_tag) : ''} · ${esc(S.natures[t.nature])}` : ''}</small></div><span class="transaction-amount">${t.type==='income'?'+':'−'}${money(t.amount)}</span><div class="transaction-actions">${t.system_kind ? '<button data-opening>设置</button>' : `<button data-edit="${t.id}">编辑</button><button data-delete="${t.id}" aria-label="删除 ${esc(t.note || '记录')}">删除</button>`}</div></div>`).join('');
  }
  function habitStats() {
    const h = S.habits;
    return `<div><strong>${integer(h.recorded_days)}</strong><span>累计记录天数</span></div><div><strong>${integer(h.current_streak)}</strong><span>当前连续 · 最长 ${h.longest_streak} 天</span></div><div><strong>${h.coverage_pct}%</strong><span>最近 ${h.coverage_denominator} 天覆盖率</span></div>`;
  }
  function renderHabits() {
    $('#habit-stats').innerHTML = $('#activity-stats').innerHTML = habitStats();
    const heat = S.habits.grid.map(c => `<div class="heat-cell ${c.future?'future':''}" data-level="${c.level}" title="${c.date} · ${c.count} 笔" aria-label="${c.date}，${c.count} 笔"></div>`).join('');
    $('#home-heatmap').innerHTML = $('#activity-heatmap').innerHTML = heat;
    $('#achievement-card').hidden = S.settings?.achievements_enabled === false;
    $('#achievements').innerHTML = S.habits.achievements.map(a => `<div class="achievement ${a.unlocked?'unlocked':''}"><strong>${a.unlocked?'✦':'◇'} ${esc(a.name)}</strong><span>${a.unlocked?'已解锁':`${a.current} / ${a.target}`}</span></div>`).join('');
    $('#missed-prompt').hidden = !S.habits.missed_prompt || S.settings?.missed_prompt_enabled === false;
    $('#missed-prompt').innerHTML = esc(S.habits.missed_prompt || '') + '<button id="backfill-yesterday">补一笔真实记录</button>';
  }
  function renderPresets() {
    const selected = $('#tx-preset').value;
    const category = $('#tx-category').value;
    $('#tx-preset').innerHTML = '<option value="">不使用标签</option>' + S.presets.filter(p => p.category_id === category).map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    if ([...$('#tx-preset').options].some(o => o.value===selected)) $('#tx-preset').value = selected;
    $('#frequent-presets').hidden = S.settings?.quick_entry_enabled === false || !S.habits.frequent_presets.length;
    $('#frequent-presets').innerHTML = '<span class="caption">最近常用</span>' + S.habits.frequent_presets.map(p => `<button type="button" data-use-preset="${p.id}">${esc(p.label)} <span>${esc(S.categories[p.category_id])}</span></button>`).join('');
    $('#preset-list').innerHTML = S.presets.length ? S.presets.map(p => `<div class="transaction"><div class="transaction-info"><strong>${esc(p.label)}</strong><small>${esc(S.categories[p.category_id])} · ${esc(S.natures[p.nature])}${p.note ? ' · '+esc(p.note) : ''}</small></div><button data-remove-preset="${p.id}">移除</button></div>`).join('') : '<p class="empty">还没有快捷标签。为常见场景取个名字。</p>';
  }
  function applyPreset(id) {
    const p = S.presets.find(x => x.id===Number(id)); if (!p) return;
    setType('expense'); $('#tx-category').value = p.category_id; renderPresets(); $('#tx-preset').value = String(p.id); $('#tx-nature').value = p.nature;
    if (!$('#tx-note').value) $('#tx-note').value = p.note;
    $('#tx-amount').focus();
  }
  function setType(type) {
    txType = type; $$('[data-type]').forEach(b => {b.classList.toggle('selected',b.dataset.type===type);b.setAttribute('aria-pressed',String(b.dataset.type===type));});
    $('#expense-fields').hidden = type==='income'; $('#submit-tx').textContent = type==='income'?'记录新增财富':'记录生活消耗';
  }
  function fillSelects() {
    ['#tx-category','#edit-category','#preset-category'].forEach(id => options($(id),S.categories));
    ['#tx-nature','#edit-nature','#preset-nature'].forEach(id => { options($(id),S.natures); $(id).value='unset'; });
    ['#history-category','#trend-category'].forEach(id => options($(id),S.categories,'全部分类'));
    $('#tx-category').value='uncategorized';
  }
  async function navigate(next) {
    if (!S) return;
    closeDialogs(); clearError();
    page = next; $$('.page').forEach(p => p.hidden = p.id!=='page-'+next);
    $$('nav [data-page]').forEach(b => b.classList.toggle('active',b.dataset.page===next));
    const headings={home:['把钱翻译成时间','你的自由，正在发生。'],analysis:['看清每一次选择','自由，花在了哪里。'],history:['真实记录，随时修正','让每一笔，都有来处。'],activity:['不必打卡，也能留下痕迹','记录，是为了更自由。'],presets:['让记录更顺手','为日常场景取个名字。'],guide:['指南 / 理念','为了选择，而记录。']};
    $('#page-eyebrow').textContent=headings[next][0]; $('#page-title').textContent=headings[next][1];
    history.replaceState(null,'','#'+next);
    if (next==='analysis') await loadAnalysis();
    if (next==='history') { historyOffset=0; await loadHistory(); }
    if (next==='home') requestAnimationFrame(() => {grid?.resume();grid?.resize();}); else grid?.pause();
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function loadHistory() {
    const key=++historyRequest;
    const args=new URLSearchParams({limit:'100',offset:String(historyOffset),q:$('#history-query').value,type:$('#history-type').value,category_id:$('#history-category').value});
    const data=await api('/transactions?'+args); if(key!==historyRequest)return;
    historyRows=data.transactions;historyTotal=data.total;
    $('#history-list').innerHTML=transactionList(historyRows);$('#history-count').textContent=`共 ${integer(data.total)} 笔匹配记录，每页最多显示 100 笔。`;
    $('#history-page').textContent=`${Math.floor(historyOffset/100)+1} / ${Math.max(1,Math.ceil(data.total/100))}`;
    $('#history-prev').disabled=historyOffset===0;$('#history-next').disabled=historyOffset+100>=data.total;
  }
  async function loadAnalysis() {
    const request=++analysisRequest;
    const args=new URLSearchParams({period:$('#analysis-period').value,anchor:$('#analysis-anchor').value,category_id:$('#trend-category').value,detail_tag:$('#trend-tag').value});
    const data=await api('/analysis?'+args);if(request!==analysisRequest)return;
    $('#analysis-range').textContent=`本期 ${data.start} 至 ${data.end} · 对比 ${data.previous_start} 至 ${data.previous_end} · ${data.record_count} 笔生活消耗`;
    $('#analysis-metrics').innerHTML=`<div><span>本期生活消耗</span><strong>${money(data.total)}</strong></div><div><span>上期同期</span><strong>${money(data.previous_total)}</strong></div><div><span>金额变化</span><strong>${data.delta>0?'+':''}${money(data.delta)}</strong><small>${data.delta_pct===null?'上期为 0，不计算增长率':`${data.delta_pct>0?'+':''}${data.delta_pct}%`}</small></div>`;
    const bars=rows => rows.length ? rows.map(r=>`<div class="bar-row"><div class="split"><span>${esc(r.name)}</span><span>${money(r.amount)} · ${r.share}%</span></div><div class="track"><div class="fill" style="width:${r.share}%"></div></div></div>`).join('') : '<p class="empty">这个周期还没有生活消耗。</p>';
    $('#category-bars').innerHTML=bars(data.categories);$('#nature-bars').innerHTML=bars(data.natures);
    const currentTag=$('#trend-tag').value;$('#trend-tag').innerHTML='<option value="">全部标签</option>'+data.tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');if(data.tags.includes(currentTag))$('#trend-tag').value=currentTag;
    renderTrend(data.trend);
    $('#export-csv').href='/api/analysis.csv?'+new URLSearchParams({period:data.period,anchor:$('#analysis-anchor').value});
  }
  function renderTrend(rows) {
    const w=900,h=230,pad=45,max=Math.max(1,...rows.map(r=>r.amount)),step=(w-pad*2)/Math.max(1,rows.length);
    const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),muted=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const bars=rows.map((r,i)=>{const height=r.amount/max*(h-65);return `<g><title>${esc(r.key)}：${money(r.amount)}</title><rect x="${pad+i*step+step*.15}" y="${h-35-height}" width="${step*.7}" height="${height}" rx="2" fill="${accent}"/>${i%Math.max(1,Math.ceil(rows.length/8))===0?`<text x="${pad+i*step+step/2}" y="${h-10}" text-anchor="middle" font-size="12" fill="${muted}">${esc(r.key.slice(5))}</text>`:''}</g>`;}).join('');
    $('#trend-chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="所选分类或标签的生活消耗趋势，下方可查看文字明细"><text x="5" y="18" fill="${muted}" font-size="12">${money(max)}</text><line x1="${pad}" y1="${h-35}" x2="${w-pad}" y2="${h-35}" stroke="${muted}" opacity=".3"/>${bars}</svg>`;
    $('#trend-table').innerHTML='<table><thead><tr><th>日期</th><th>生活消耗</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(r.key)}</td><td>${money(r.amount)}</td></tr>`).join('')+'</tbody></table>';
  }
  async function weeklyReview() {
    $('#analysis-period').value='week';$('#analysis-anchor').value=S.habits.weekly_review.anchor;$('#trend-category').value='';$('#trend-tag').value='';
    await navigate('analysis'); await api('/review/seen','POST',{}); await refresh();
  }
  async function playRitual(result,before) {
    if(!grid || result.animation==='none' || S.settings?.ritual_enabled===false || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    document.body.classList.remove('grid-expanded');$('#expand-grid').textContent='放大查看 ↗';
    $('#ritual-title').textContent=result.title;$('#ritual-count').textContent=integer(result.lit_before)+' 天';
    $('#ritual-overlay').hidden=false;document.body.classList.add('ritual-active');grid.resume();grid.setData(before);grid.resize();
    grid.onProgress=n=>$('#ritual-count').textContent=integer(n)+' 天';
    try { if(result.delta>0)await grid.lightUp(result.lit_before,result.lit_after);else await grid.extinguish(result.lit_after,result.lit_before); }
    finally { grid.cancel();grid.onProgress=null;document.body.classList.remove('ritual-active');$('#ritual-overlay').hidden=true;grid.setData(result.stats);grid.resize(); }
  }
  async function submitTransaction(event) {
    event.preventDefault();if(busy || !S.settings)return;
    const preset=S.presets.find(p=>p.id===Number($('#tx-preset').value));
    const body={type:txType,amount:$('#tx-amount').value,occurred_on:$('#tx-date').value,note:$('#tx-note').value.trim(),category_id:$('#tx-category').value,nature:$('#tx-nature').value,detail_tag:preset?.label || ''};
    const signature=JSON.stringify(body);
    if(pendingEntry?.signature!==signature)pendingEntry={signature,key:crypto.randomUUID()};body.entry_key=pendingEntry.key;
    busy=true;$('#submit-tx').disabled=true;const before=S.stats;let committed=false;
    try {
      try { if(S.settings.sound_enabled)audio.ensure(); } catch (_) { /* sound never blocks saving */ }
      const result=await api('/transactions','POST',body);committed=true;pendingEntry=null;
      $('#tx-amount').value='';$('#tx-note').value='';
      try { await playRitual(result,before); } catch (_) { toast('记录已保存','方格动画未完成，正在显示真实结果。'); }
      await refresh();
      $('.hero-number').classList.remove('flip');requestAnimationFrame(()=>$('.hero-number').classList.add('flip'));
      const deltaHint=S.settings.freedom_delta_hint!==false ? `本次连续估算 ${result.exact_delta>=0?'+':''}${result.exact_delta.toFixed(2)} 天。 ` : '';
      toast(result.title,deltaHint+result.detail);
      if(result.celebrate && !document.hidden){try{audio.celebrateChord();}catch(_){}dialogOpen('#celebration');}
    } catch(error) { if(committed)throw new Error('记录已经保存，但刷新失败。请刷新页面查看，不必重复输入。');throw error; }
    finally {busy=false;$('#submit-tx').disabled=false;}
  }
  function openSettings() {
    if(!S)return;
    const s=S.settings || {mode:'quick',expense_mode:'manual',manual_daily_expense:100,target_age:80,font_scale:100,home_module_order:Object.keys(moduleNames),...onboardingAppearance};
    $('#cfg-birth').value=s.birth_date || '';$('#cfg-birth').max=today();$('#cfg-age').value=s.target_age;
    $('#cfg-mode').value=s.mode;$('#cfg-cost-mode').value=s.expense_mode;$('#cfg-cost').value=s.manual_daily_expense || 100;$('#cfg-opening').value=S.opening_balance;
    $('#cfg-days').value=s.tracking_days_override || 0;$('#cfg-past').checked=!!s.show_past;$('#cfg-assets-enabled').checked=!!s.use_initial_assets;$('#cfg-assets').value=s.initial_assets || 0;
    $('#cfg-theme').value=s.theme || 'midnight';$('#cfg-font').value=s.font_family || 'system';$('#cfg-scale').value=s.font_scale || 100;
    $('#feedback-switches').innerHTML=Object.entries(switchNames).map(([id,label])=>`<label class="check"><input id="cfg-${id}" type="checkbox" ${s[id]===false || (id==='sound_enabled'&&!s[id])?'':'checked'}>${label}</label>`).join('');
    dormant={...(s.advanced_dormant || {})};order=[...(s.home_module_order || Object.keys(moduleNames))];renderOrder();settingsVisibility();closeDialogs();dialogOpen('#settings-dialog');
  }
  function renderOrder() {
    $('#module-order').innerHTML=order.map((id,i)=>`<li><span>${moduleNames[id]}</span><button type="button" data-move="${i}" data-dir="-1" aria-label="上移${moduleNames[id]}" ${i===0?'disabled':''}>↑</button><button type="button" data-move="${i}" data-dir="1" aria-label="下移${moduleNames[id]}" ${i===order.length-1?'disabled':''}>↓</button></li>`).join('');
  }
  function settingsVisibility() {
    const advanced=$('#cfg-mode').value==='advanced',ledger=advanced && $('#cfg-cost-mode').value==='ledger';
    $('#advanced-cost').hidden=!advanced;$('#advanced-fields').hidden=!advanced;$('#manual-cost-field').hidden=ledger;$('#tracking-field').hidden=!ledger;$('#cfg-cost').required=!ledger;
  }
  function advancedValues(){return {expense_mode:$('#cfg-cost-mode').value,manual_daily_expense:$('#cfg-cost').value,show_past:$('#cfg-past').checked,use_initial_assets:$('#cfg-assets-enabled').checked,initial_assets:$('#cfg-assets').value,tracking_days_override:Number($('#cfg-days').value)};}
  function switchMode(){
    if($('#cfg-mode').value==='quick'){dormant=advancedValues();if(!Number($('#cfg-cost').value))$('#cfg-cost').value='100';}
    else if(Object.keys(dormant).length){$('#cfg-cost-mode').value=dormant.expense_mode || 'manual';$('#cfg-cost').value=dormant.manual_daily_expense || 100;$('#cfg-days').value=dormant.tracking_days_override || 0;$('#cfg-past').checked=!!dormant.show_past;$('#cfg-assets-enabled').checked=!!dormant.use_initial_assets;$('#cfg-assets').value=dormant.initial_assets || 0;}
    settingsVisibility();
  }
  async function saveSettings(event){
    event.preventDefault();if(busy)return;busy=true;const submit=$('#settings-form button[type="submit"]');submit.disabled=true;
    const body={...advancedValues(),birth_date:$('#cfg-birth').value,target_age:Number($('#cfg-age').value),mode:$('#cfg-mode').value,opening_balance:$('#cfg-opening').value,theme:$('#cfg-theme').value,font_family:$('#cfg-font').value,font_scale:Number($('#cfg-scale').value),home_module_order:order,advanced_dormant:dormant};
    Object.keys(switchNames).forEach(k=>body[k]=$('#cfg-'+k).checked);
    try{await api('/settings','POST',body);$('#settings-dialog').close();await refresh();toast('设置已保存','生活成本与人生坐标已重新计算。');}
    finally{busy=false;submit.disabled=false;$('#submit-tx').disabled=!S.settings;}
  }
  function startOnboarding(){onboardingStep=0;closeDialogs();renderOnboarding();dialogOpen('#onboarding-dialog');}
  function renderOnboarding(){
    const slides=[
      '<p class="eyebrow">01 / 03 · 一盏属于你的灯</p><h2>把钱，翻译成时间。</h2><p>不止知道赚了多少、花了多少。试着看见：现有的自由资源，为自己买回了多少可以自主选择的日子。</p><label>阅读主题<select id="onboard-theme"><option value="midnight">深夜金</option><option value="paper">纸上自由</option></select></label><label>阅读字号<select id="onboard-scale"><option value="90">90%</option><option value="100" selected>100%</option><option value="110">110%</option></select></label>',
      '<p class="eyebrow">02 / 03 · 真实比漂亮重要</p><h2>记下现实，不给消费打分。</h2><p>新增财富买回未来时间。生活消耗把未来自由交换成今天的价值。值不值，由你决定。</p><p>账户互转、借款本金、已记过的消费还款不重复计入。退款和报销可以修正原支出。</p><p>一格代表一天，未跨整数边界时也会告诉你小数变化。动画只表达数据，随时可以跳过。</p>',
      '<p class="eyebrow">03 / 03 · 从今天的估计开始</p><h2>先给自由一个坐标。</h2><p>填写出生日期、目标年龄、日均生活成本与起始自由本金，就能看到第一张人生方格。</p><p>目标年龄不是寿命预测，生活成本可以持续校准。全部点亮表示当前假设下的区间被覆盖，不是永久退休证明。</p><p>数据只存在本机。使用一段时间后，记得从设置导出完整 JSON 备份。</p>'
    ];
    $('#onboarding-content').innerHTML=slides[onboardingStep];$('#onboarding-prev').hidden=onboardingStep===0;$('#onboarding-next').textContent=onboardingStep===2?(S.settings?'回到我的指南灯':'建立我的指南灯'):'继续';
    if(onboardingStep===0){$('#onboard-theme').value=S.settings?.theme || onboardingAppearance.theme || 'midnight';$('#onboard-scale').value=String(S.settings?.font_scale || onboardingAppearance.font_scale || 100);}
  }
  async function previewRestore(event){
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(file.size>64*1024*1024)throw new Error('备份超过 64 MB，请使用数据库备份方式迁移。');
    try{restoreDocument=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch(_){throw new Error('文件不是有效 JSON，原账本没有改变。');}
    restorePreview=await api('/backup/preview','POST',restoreDocument);
    $('#restore-preview').innerHTML=`<p>来源：${esc(restorePreview.source)}</p><div class="summary-metrics"><div><span>待恢复记录</span><strong>${integer(restorePreview.transaction_count)}</strong></div><div><span>当前记录</span><strong>${integer(restorePreview.current_count)}</strong></div><div><span>快捷标签</span><strong>${restorePreview.preset_count}</strong></div></div><p class="note">按当前日期重新计算：${integer(restorePreview.stats.freedom_days_bought)} 个完整自由日。${restorePreview.stats.excluded_count ? `其中 ${restorePreview.stats.excluded_count} 笔日期在当前模型区间之外，保留但暂不计入。` : ''}</p>`;
    closeDialogs();dialogOpen('#restore-dialog');
  }
  async function confirmRestore(){
    if(busy || !restorePreview)return;busy=true;$('#confirm-restore').disabled=true;
    try{const result=await api('/backup/restore','POST',{document:restoreDocument,...restorePreview,confirm:true});closeDialogs();restoreDocument=null;restorePreview=null;await refresh();fillSelects();render();await navigate('home');toast('账本已恢复','恢复前的数据库副本保存在：'+result.recovery_backup);}
    finally{busy=false;$('#confirm-restore').disabled=false;$('#submit-tx').disabled=!S.settings;}
  }
  function openEdit(id){
    const t=[...S.transactions,...historyRows].find(x=>x.id===id);if(!t)return;
    editId=id;$('#edit-type').value=t.type;$('#edit-date').value=t.occurred_on;$('#edit-date').max=today();$('#edit-date').min=S.settings?.birth_date || '';
    $('#edit-amount').value=t.amount;$('#edit-category').value=t.category_id;$('#edit-nature').value=t.nature;$('#edit-tag').value=t.detail_tag;$('#edit-note').value=t.note;
    dialogOpen('#edit-dialog');
  }
  async function saveEdit(event){
    event.preventDefault();if(busy)return;busy=true;const b=$('#edit-form button[type="submit"]');b.disabled=true;
    try{await api('/transactions/'+editId,'PUT',{type:$('#edit-type').value,occurred_on:$('#edit-date').value,amount:$('#edit-amount').value,category_id:$('#edit-category').value,nature:$('#edit-nature').value,detail_tag:$('#edit-tag').value,note:$('#edit-note').value});$('#edit-dialog').close();await refresh();if(page==='history')await loadHistory();toast('记录已修正','统计、分类分析和自由天数已重新计算。');}
    finally{busy=false;b.disabled=false;$('#submit-tx').disabled=!S.settings;}
  }
  async function deleteTransaction(id){
    if(busy || !confirm('删除这笔真实记录？删除后会重新计算账本。'))return;busy=true;
    try{await api('/transactions/'+id,'DELETE');await refresh();if(page==='history'){if(historyRows.length===1&&historyOffset>0)historyOffset-=100;await loadHistory();}toast('记录已删除','账本已经重新计算。');}
    finally{busy=false;$('#submit-tx').disabled=!S.settings;}
  }

  document.addEventListener('click',safe(async e=>{
    const b=e.target.closest('button,a');if(!b)return;
    if(b.dataset.close!==undefined){b.closest('dialog').close();return;}
    if(b.dataset.page){e.preventDefault();await navigate(b.dataset.page);}
    if(b.dataset.restore!==undefined)$('#restore-file').click();
    if(b.dataset.type)setType(b.dataset.type);
    if(b.dataset.edit)openEdit(Number(b.dataset.edit));
    if(b.dataset.delete)await deleteTransaction(Number(b.dataset.delete));
    if(b.dataset.opening!==undefined)openSettings();
    if(b.dataset.usePreset)applyPreset(b.dataset.usePreset);
    if(b.dataset.removePreset){await api('/presets/'+b.dataset.removePreset,'DELETE');await refresh();}
    if(b.dataset.move!==undefined){const i=Number(b.dataset.move),j=i+Number(b.dataset.dir);if(j>=0&&j<order.length){[order[i],order[j]]=[order[j],order[i]];renderOrder();}}
    if(b.id==='backfill-yesterday'){$('#tx-date').value=yesterday();$('[data-module="entry"]').scrollIntoView({block:'center',behavior:'smooth'});$('#tx-amount').focus();}
  }));
  $('#entry-form').addEventListener('submit',safe(submitTransaction));
  $('#settings-form').addEventListener('submit',safe(saveSettings));
  $('#edit-form').addEventListener('submit',safe(saveEdit));
  $('#open-settings').addEventListener('click',openSettings);$('#setup-now').addEventListener('click',openSettings);
  $('#cfg-mode').addEventListener('change',switchMode);$('#cfg-cost-mode').addEventListener('change',settingsVisibility);
  $('#tx-category').addEventListener('change',()=>{$('#tx-preset').value='';renderPresets();});$('#tx-preset').addEventListener('change',e=>applyPreset(e.target.value));
  $('#weekly-review').addEventListener('click',safe(weeklyReview));
  $('#refresh-analysis').addEventListener('click',safe(loadAnalysis));$('#analysis-period').addEventListener('change',safe(loadAnalysis));$('#trend-category').addEventListener('change',safe(async()=>{$('#trend-tag').value='';await loadAnalysis();}));$('#trend-tag').addEventListener('change',safe(loadAnalysis));
  $('#search-history').addEventListener('click',safe(async()=>{historyOffset=0;await loadHistory();}));$('#history-query').addEventListener('keydown',safe(async e=>{if(e.key==='Enter'){historyOffset=0;await loadHistory();}}));
  $('#history-prev').addEventListener('click',safe(async()=>{historyOffset=Math.max(0,historyOffset-100);await loadHistory();}));$('#history-next').addEventListener('click',safe(async()=>{historyOffset+=100;await loadHistory();}));
  $('#preset-form').addEventListener('submit',safe(async e=>{e.preventDefault();const b=$('#preset-form button[type="submit"]');b.disabled=true;try{await api('/presets','POST',{category_id:$('#preset-category').value,label:$('#preset-label').value,note:$('#preset-note').value,nature:$('#preset-nature').value});$('#preset-label').value='';$('#preset-note').value='';await refresh();toast('快捷标签已保存');}finally{b.disabled=false;}}));
  $('#restore-file').addEventListener('change',safe(previewRestore));$('#confirm-restore').addEventListener('click',safe(confirmRestore));
  $('#replay-guide').addEventListener('click',startOnboarding);$('#onboarding-prev').addEventListener('click',()=>{onboardingStep--;renderOnboarding();});
  $('#onboarding-next').addEventListener('click',()=>{if(onboardingStep===0&&!S.settings){onboardingAppearance={theme:$('#onboard-theme').value,font_scale:Number($('#onboard-scale').value)};appearance(onboardingAppearance);}if(onboardingStep<2){onboardingStep++;renderOnboarding();}else{$('#onboarding-dialog').close();if(!S.settings)openSettings();}});
  $('#skip-ritual').addEventListener('click',()=>grid?.cancel());
  $('#expand-grid').addEventListener('click',()=>{document.body.classList.toggle('grid-expanded');$('#expand-grid').textContent=document.body.classList.contains('grid-expanded')?'收起 ×':'放大查看 ↗';grid?.resize();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){grid?.cancel();document.body.classList.remove('grid-expanded');$('#expand-grid').textContent='放大查看 ↗';requestAnimationFrame(()=>grid?.resize());}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)grid?.cancel();else if(!busy&&today()!==lastDay){lastDay=today();refresh().catch(reportError);}});
  window.addEventListener('hashchange',safe(async()=>{const next=location.hash.slice(1);if($('#page-'+next))await navigate(next);}));
  window.addEventListener('resize',()=>grid?.resize());
  new ResizeObserver(()=>grid?.resize()).observe($('#canvas-wrap'));
  (async()=>{
    $('#tx-date').value=today();$('#tx-date').max=today();$('#analysis-anchor').value=today();$('#analysis-anchor').max=today();
    await refresh();fillSelects();setType('expense');render();
    const next=location.hash.slice(1);if(next&&$('#page-'+next))await navigate(next);
    if(!S.settings)startOnboarding();
  })().catch(reportError);
})();
