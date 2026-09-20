from pathlib import Path
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

# JSON
for p in ROOT.rglob('*.json'):
    try:
        json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        errors.append(f'JSON parse failed: {p.relative_to(ROOT)}: {e}')

# registered page four-piece rule
app = json.loads((ROOT/'app.json').read_text(encoding='utf-8'))
for page in app.get('pages', []):
    for ext in ('.js','.json','.wxml','.wxss'):
        p = ROOT/(page+ext)
        if not p.exists(): errors.append(f'Missing page file: {page+ext}')

# JS syntax
for p in ROOT.rglob('*.js'):
    if 'visual_test' in p.parts: continue
    cp = subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
    if cp.returncode:
        errors.append(f'JS syntax failed: {p.relative_to(ROOT)}\n{cp.stderr}')

# WXML conservative checks and event handlers
html_tags = re.compile(r'<\/?(div|span|p|b|strong|small|main|section|header|footer|aside|form)(?:\s|>|/)')
allowed_tags = {'block','view','text','button','canvas','image','input','picker','switch','page-meta','scroll-view'}
handler_re = re.compile(r'\b(?:bind|catch)(?:tap|change|input|confirm|submit|longpress|touchstart|touchend|beforeleave|leave|afterleave|clickoverlay)="([A-Za-z_$][\w$]*)"')
for wxml in ROOT.rglob('*.wxml'):
    text = wxml.read_text(encoding='utf-8')
    if html_tags.search(text): errors.append(f'HTML tag found in WXML: {wxml.relative_to(ROOT)}')
    for tag in re.findall(r'<\/?([A-Za-z][\w-]*)', text):
        if tag not in allowed_tags:
            errors.append(f'Unexpected WXML component <{tag}> in {wxml.relative_to(ROOT)}')
    # simple tag balance
    stack=[]
    for m in re.finditer(r'<(/?)([A-Za-z][\w-]*)([^>]*)>', text):
        closing, tag, rest = m.groups()
        if rest.rstrip().endswith('/') or tag in ('page-meta',):
            continue
        if closing:
            if not stack or stack[-1] != tag:
                errors.append(f'WXML tag balance problem: {wxml.relative_to(ROOT)} around </{tag}>')
                break
            stack.pop()
        else:
            stack.append(tag)
    if stack: errors.append(f'WXML unclosed tags: {wxml.relative_to(ROOT)}: {stack[-5:]}')

    js = wxml.with_suffix('.js')
    if js.exists():
        js_text = js.read_text(encoding='utf-8')
        for handler in handler_re.findall(text):
            if not re.search(r'\b'+re.escape(handler)+r'\s*\(', js_text):
                errors.append(f'Handler {handler} missing in {js.relative_to(ROOT)}')

# forbidden/deprecated patterns
forbidden = {
    'window.': 'Browser window API',
    'document.': 'Browser document API',
    'getSystemInfoSync': 'Deprecated WeChat API',
    'backdrop-filter': 'WXSS conservative forbidden property',
    'wx.request': 'Unexpected network API in local-only build',
    'wx.uploadFile': 'Unexpected network API in local-only build',
    'wx.downloadFile': 'Unexpected network API in local-only build',
    'wx.login': 'Unexpected login API in no-login build',
    'wx.getLocation': 'Unexpected permission API in current build',
    'wx.getUserProfile': 'Unexpected profile API in v0.3.3',
    'wx.vibrateShort': 'Unwanted whole-device haptic feedback in current build',
}
for p in list(ROOT.rglob('*.js')) + list(ROOT.rglob('*.wxss')) + list(ROOT.rglob('*.wxml')):
    if 'tests' in p.parts or 'docs' in p.parts or 'visual_test' in p.parts: continue
    text=p.read_text(encoding='utf-8')
    for token, why in forbidden.items():
        if token in text: errors.append(f'{why} ({token}) in {p.relative_to(ROOT)}')

# Startup integrity block -> onboarding -> home must be mutually exclusive.
index = (ROOT/'pages/index/index.wxml').read_text(encoding='utf-8')
for token in ('<block wx:if="{{startupBlocked}}">', '<block wx:elif="{{showOnboarding}}">', '<block wx:else>', '<canvas type="2d" id="lifeCanvas"'):
    if token not in index: errors.append(f'Startup/onboarding/home structure missing: {token}')

# current rendering architecture:
# - scrollable page only displays an ordinary image snapshot
# - snapshot Canvas stays outside the visible scroll area
# - real-time Canvas is allowed only inside the fixed ritual overlay
if index.count('<canvas type="2d" id="lifeCanvas"') != 1:
    errors.append('Expected exactly one lifeCanvas snapshot node')
if index.count('<canvas type="2d" id="ritualCanvas"') != 1:
    errors.append('Expected exactly one ritualCanvas node inside ritual overlay')
if 'class="life-grid-image"' not in index or 'src="{{gridImagePath}}"' not in index:
    errors.append('Scrollable life grid must use an exported image snapshot')
index_js = (ROOT/'pages/index/index.js').read_text(encoding='utf-8')
index_css = (ROOT/'pages/index/index.wxss').read_text(encoding='utf-8')
if 'wx.canvasToTempFilePath' not in index_js:
    errors.append('Canvas snapshot export missing')
if '.snapshot-canvas {' not in index_css or 'left: -12000px;' not in index_css:
    errors.append('Snapshot canvas must stay outside the visible scroll viewport')
if '.ritual-overlay {' not in index_css or 'position: fixed;' not in index_css:
    errors.append('Ritual overlay must be fixed to the viewport')
if 'class="ritual-top-veil"' not in index or 'class="ritual-bottom-veil"' not in index:
    errors.append('Immersive ritual veils missing')
if 'ritual-progress-track' in index:
    errors.append('Ritual must not regress into a dashboard progress bar')
if 'inset: 0;' not in index_css or '.ritual-stage {' not in index_css:
    errors.append('Ritual Canvas must occupy the full viewport stage')
if "require('../../utils/ritual_grid')" not in index_js or 'new ritualLib.RitualGrid' not in index_js:
    errors.append('Core RitualGrid engine is not wired into the index page')
if 'wx.vibrateShort' in index_js:
    errors.append('Whole-device vibration must not be used as ritual feedback')

# current core fidelity gates: crisp zoom, completion-synced feedback, synthesized ritual sound,
# and a scroll-safe breathing marker for “today”.
ritual_text = (ROOT/'utils/ritual_grid.js').read_text(encoding='utf-8')
audio_text = (ROOT/'utils/ritual_audio.js').read_text(encoding='utf-8')
for token in ('visibleGridWindow', '_drawGridBase(ctx, before, palette, visible)', 'config.onCellStart', 'beforeLit + completed'):
    if token not in ritual_text:
        errors.append(f'Core ritual fidelity token missing: {token}')
if "require('../../utils/ritual_audio')" not in index_js or 'new ritualAudioLib.RitualAudio' not in index_js:
    errors.append('Ritual WebAudio synthesis is not wired into the transaction gesture path')
if 'createWebAudioContext' not in audio_text or 'celebrateChord' not in audio_text:
    errors.append('Ritual audio synthesis implementation incomplete')
if 'class="today-marker"' not in index or 'todayMarkerStyle' not in index_js:
    errors.append('Scroll-safe breathing today marker missing')
if 'wx:if="{{!gridImagePath}}" class="grid-loading"' not in index:
    errors.append('Grid loading state must depend on missing image, not wx:else after the today marker')
if index.count('class="freedom-ripple') < 5 or 'CURRENT HORIZON FULLY COVERED' not in index or 'class="freedom-word">FREE<' not in index:
    errors.append('Full-screen FREE celebration structure is incomplete')
for token in ('.freedom-stage {', '.freedom-ripple--1', '.freedom-ripple--5', '@keyframes freedom-ripple'):
    if token not in index_css:
        errors.append(f'FREE celebration visual token missing: {token}')

# Every wx:for in this project must have an explicit stable key.
for wxml in ROOT.rglob('*.wxml'):
    for tag in re.findall(r'<[^>]*\bwx:for="[^"]+"[^>]*>', wxml.read_text(encoding='utf-8')):
        if 'wx:key=' not in tag:
            errors.append(f'wx:for without wx:key in {wxml.relative_to(ROOT)}: {tag[:80]}')


# Product architecture gates for the unified kernel.
index_wxml = (ROOT/'pages/index/index.wxml').read_text(encoding='utf-8')
settings_wxml = (ROOT/'pages/settings/settings.wxml').read_text(encoding='utf-8')
index_wxss = (ROOT/'pages/index/index.wxss').read_text(encoding='utf-8')
for stale in ('观察期', '7 天先', '7 天当观察期'):
    if stale in index_wxml or stale in settings_wxml:
        errors.append(f'Stale waiting-period UX text found: {stale}')
for required in ("onboarding.mode === 'quick'", "onboarding.mode === 'advanced'", 'manual_daily_expense', 'opening_balance', 'initial_assets'):
    if required not in index_wxml:
        errors.append(f'Quick/advanced onboarding structure missing token: {required}')
for required in ("form.mode === 'quick'", "form.mode === 'advanced'", "form.theme === 'midnight'", "form.theme === 'paper'"):
    if required not in settings_wxml:
        errors.append(f'Settings mode/theme structure missing token: {required}')
if '.submit-btn { width: 100%;' not in index_wxss or 'align-items: center; justify-content: center;' not in index_wxss:
    errors.append('Primary transaction button must use flex centering rather than line-height centering')
if 'theme-paper' not in index_wxss:
    errors.append('Paper theme styles missing from index')

# Quick / advanced must still share one unchanged calculation kernel.
model_text = (ROOT/'utils/model.js').read_text(encoding='utf-8')
storage_text = (ROOT/'utils/storage.js').read_text(encoding='utf-8')
for forbidden in ('currentAssets = Math.max(0, settings.initial_assets + netSavings)', 'effectiveWealth'):
    if forbidden in model_text:
        errors.append(f'Unauthorized second formula found: {forbidden}')
for token in ("decSub(totalIncomeExact, totalExpenseExact)", "decSub(totalExpenseExact, totalIncomeExact)", 'assetFreedom + incomeFreedom'):
    if token not in model_text:
        errors.append(f'Unified exact-money formula token missing: {token}')
if 'BigInt(' in model_text or 'BigInt(' in storage_text:
    errors.append('Production money kernel must not depend on native BigInt in WeChat runtime')
for token in ('OPENING_KIND', 'setOpeningBalance', 'migrateKernelV033'):
    if token not in storage_text:
        errors.append(f'Opening-baseline support missing: {token}')
if '这里只记真正改变自由时间的事件；公式始终不变。' not in index_wxml:
    errors.append('Unified-kernel freedom-event explanation missing')


# v0.5.1 UX / backup / long-term-use gates.
index_json = json.loads((ROOT/'pages/index/index.json').read_text(encoding='utf-8'))
project_config = json.loads((ROOT/'project.config.json').read_text(encoding='utf-8'))
if index_json.get('navigationBarTitleText', None) != '': errors.append('Home native navigation title must stay empty')
if not any(isinstance(x, dict) and x.get('type') == 'folder' and x.get('value') == '.git' for x in project_config.get('packOptions',{}).get('ignore',[])):
    errors.append('Git metadata must be excluded from WeChat upload package')
for token in ('已有备份？直接恢复','01 · 先选一个舒服的样子','05 · 建立你的第一盏灯','data-scale="110"','start="1900-01-01"'):
    if token not in index_wxml: errors.append(f'v0.5.1 onboarding gate missing: {token}')
for token in ('数据备份与恢复','导出完整备份','导入备份','两种“起始”不是一回事','字体大小','start="1900-01-01"'):
    if token not in settings_wxml: errors.append(f'v0.5.1 settings gate missing: {token}')
for token in ('getTransactionsStrict','createBackup','validateBackupDocument','advanced_dormant','CURRENT_KERNEL_VERSION'):
    if token not in storage_text and token not in model_text: errors.append(f'v0.5.1 data-integrity gate missing: {token}')

# v0.5.2 true-device display gates.
for token in ('class="topbar__brand"', 'style="color:{{inputTextColor}};"', 'placeholder-style="color:{{inputPlaceholderColor}};"'):
    if token not in index_wxml and token not in settings_wxml:
        errors.append(f'v0.5.2 true-device gate missing: {token}')
if 'grid-template-columns: minmax(0, 1fr) auto' not in index_wxss:
    errors.append('v0.5.2 home header must reserve a separate action column')
if '.theme-paper .money-input input, .theme-paper .money-input__field { color:#40372e; }' not in index_wxss:
    errors.append('v0.5.2 paper onboarding money-input contrast gate missing')
settings_wxss = (ROOT/'pages/settings/settings.wxss').read_text(encoding='utf-8')
if '.theme-paper .control, .theme-paper .money-control input, .theme-paper .money-control__input { color: #40372e; }' not in settings_wxss:
    errors.append('v0.5.2 paper settings money-input contrast gate missing')

# v0.6.1 habit-loop gates.
activity_wxml = (ROOT/'pages/activity/activity.wxml').read_text(encoding='utf-8')
habits_text = (ROOT/'utils/habits.js').read_text(encoding='utf-8')
for token in ('记录中心','最近 12 周记录活动','上周回顾','最近常用','本次记录后，自由天数估算','成就解锁'):
    if token not in index_wxml: errors.append(f'v0.6.1 home habit gate missing: {token}')
for token in ('正式成就','奇怪成就','你不是为了把账记漂亮'):
    if token not in activity_wxml: errors.append(f'v0.6.1 activity gate missing: {token}')
for token in ('activityGrid','achievementData','frequentPresets','missedPrompt','weeklyReviewState'):
    if token not in habits_text: errors.append(f'v0.6.1 habit kernel missing: {token}')
for token in ('自由天数轻提示','温和漏记提示','每周回顾提醒灯'):
    if token not in settings_wxml: errors.append(f'v0.6.1 settings gate missing: {token}')


activity_js = (ROOT/'pages/activity/activity.js').read_text(encoding='utf-8')
analysis_js = (ROOT/'pages/analysis/analysis.js').read_text(encoding='utf-8')
if 'settings.habit_center ? habitUtil.summary' not in activity_js:
    errors.append('v0.6.1 activity page must honor the record-center switch')
if 'review=previous' not in index_js or 'review=previous' not in activity_js or 'previousWeekReview' not in analysis_js:
    errors.append('v0.6.1 weekly review must open the completed previous week')
if 'lastFeedback.delta === 0' not in index_wxml:
    errors.append('v0.6.1 fractional freedom hint must stay subordinate to integer lamp ritual')

# Release metadata must agree with the candidate version.
app_js = (ROOT/'app.js').read_text(encoding='utf-8')
version_txt = (ROOT/'VERSION.txt').read_text(encoding='utf-8')
if "version: '0.6.2'" not in app_js or 'Version: 0.6.2' not in version_txt:
    errors.append('Release version metadata mismatch: app.js and VERSION.txt must both be 0.6.2')

# Theme-aware pages require page-meta as the first rendered WXML node.
for rel in ('pages/index/index.wxml','pages/settings/settings.wxml','pages/history/history.wxml','pages/guide/guide.wxml','pages/analysis/analysis.wxml','pages/activity/activity.wxml'):
    text = (ROOT/rel).read_text(encoding='utf-8').lstrip()
    if not text.startswith('<page-meta '):
        errors.append(f'page-meta must be the first node in {rel}')

if errors:
    print('\n'.join('ERROR: '+e for e in errors))
    sys.exit(1)
print('static_check.py: PASS')

# Math-model regression guard: both modes share the original ledger kernel.
model_text = (ROOT / 'utils' / 'model.js').read_text(encoding='utf-8')
storage_text = (ROOT / 'utils' / 'storage.js').read_text(encoding='utf-8')
assert 'effectiveWealth' not in model_text, 'Unauthorized effective-wealth formula found'
assert 'currentAssets = Math.max(0, settings.initial_assets + netSavings)' not in model_text, 'Legacy quick balance formula found'
assert 'decSub(totalIncomeExact, totalExpenseExact)' in model_text, 'Exact net-savings subtraction missing'
assert 'assetFreedom + incomeFreedom' in model_text, 'Original split freedom formula missing'
assert 'BigInt(' not in model_text and 'BigInt(' not in storage_text, 'Production runtime must not depend on native BigInt'
assert 'setOpeningBalance' in storage_text, 'Opening baseline mechanism missing'
