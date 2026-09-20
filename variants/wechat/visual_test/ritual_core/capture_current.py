from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time, os

ROOT = Path(__file__).resolve().parents[2]
RENDERER = (ROOT / 'utils' / 'ritual_grid.js').read_text(encoding='utf-8')
OUT = Path(__file__).resolve().parent / 'screens_v041_final'
OUT.mkdir(parents=True, exist_ok=True)

BASE_CSS = r'''
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#06070b;color:#f4efe5;overflow:hidden}
.overlay{height:100vh;padding:34px 14px 20px;display:flex;flex-direction:column;background:radial-gradient(circle at 50% 42%,rgba(255,209,102,.08),rgba(6,7,11,.96) 58%,#05060a 100%)}
.overlay.out{background:radial-gradient(circle at 50% 42%,rgba(151,91,70,.075),rgba(6,7,11,.97) 60%,#05060a 100%)}
.head{height:72px;display:flex;justify-content:space-between}.eyebrow{color:#957d43;font-size:10px;letter-spacing:2px}.title{margin-top:6px;font-size:18px;font-weight:650;color:#f5d981}.out .title{color:#d9b3a4}.skip{height:29px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.055);color:#8f929b}
.stage{position:relative;min-height:0;flex:1;border-radius:14px;overflow:hidden;background:#090b10;border:1px solid rgba(255,255,255,.055);box-shadow:inset 0 0 40px rgba(0,0,0,.34),0 14px 35px rgba(0,0,0,.28)}canvas{width:100%;height:100%;display:block}.foot{height:112px;padding:10px 3px 0}.count{display:flex;align-items:baseline;gap:7px}.num{font-size:34px;line-height:1;font-weight:700;color:#f3ce68}.out .num{color:#d7aa99}.unit{color:#858891;font-size:12px}.copy{margin-top:9px;display:flex;justify-content:space-between;color:#737781;font-size:10px;gap:10px}.copy span:last-child{text-align:right}.track{height:3px;margin-top:8px;background:rgba(255,255,255,.065);border-radius:4px;overflow:hidden}.fill{height:100%;width:0;background:linear-gradient(90deg,#8d6a1f,#f1c75b,#fff1a6)}.out .fill{background:linear-gradient(90deg,#5a4030,#9d6552,#d4a18e)}
.paper{background:radial-gradient(circle at 50% 42%,rgba(168,116,31,.1),rgba(238,231,219,.96) 60%,#e7ded1 100%);color:#302820}.paper .stage{background:#e5ddcf;border-color:#d6cbbb;box-shadow:inset 0 0 30px rgba(79,56,31,.06),0 11px 30px rgba(79,56,31,.08)}.paper .eyebrow{color:#92702f}.paper .title{color:#8e631e}.paper .num{color:#9b691d}.paper .unit,.paper .copy{color:#756b60}.paper .track{background:rgba(75,58,38,.1)}
#perf{position:fixed;right:8px;bottom:5px;color:#555;font:9px monospace}
'''

def html(kind='ignite', theme='midnight'):
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{BASE_CSS}</style><script>var module={{exports:{{}}}};{RENDERER}</script></head><body>
<div id="overlay" class="overlay"><div class="head"><div><div class="eyebrow" id="eyebrow">BUY BACK YOUR TIME</div><div class="title" id="title">点亮 12 天自由</div></div><button class="skip" onclick="engine&&engine.skip()">跳过</button></div><div id="stage" class="stage"><canvas id="canvas"></canvas></div><div class="foot"><div class="count"><span id="num" class="num">100</span><span class="unit">天自由</span></div><div class="copy"><span id="copy1">0 / 12 格</span><span id="copy2">一天天买回属于自己的时间</span></div><div class="track"><div id="fill" class="fill"></div></div></div></div><div id="perf"></div>
<script>
const lib=module.exports; const kind='{kind}'; const isPaper={str(theme=='paper').lower()}; const overlay=document.getElementById('overlay'); if(kind==='extinguish') overlay.classList.add('out'); if(isPaper) overlay.classList.add('paper');
const palette=isPaper?{{background:'#e5ddcf',unlit:'#cfc4b4',lit:'#a8741f',asset:'#58769a',bloom:'#fff3d2',ash:'#8f7868',ember:'#a65f4d',past:'#d9d0c3',trackedPast:'#9b8e78'}}:{{background:'#0b0e13',unlit:'#292d35',lit:'#ffd166',asset:'#9cc3ff',bloom:'#fff4d6',ash:'#5a4030',ember:'#d77957',past:'#1a1d23',trackedPast:'#343126'}};
let before,after;if(kind==='ignite'){{before={{total_cells:20000,future_cells:20000,past_cells:0,tracked_past_cells:0,asset_lit:0,income_lit:100,lit_count:100}};after={{...before,income_lit:112,lit_count:112}};}}else{{before={{total_cells:20000,future_cells:20000,past_cells:0,tracked_past_cells:0,asset_lit:0,income_lit:112,lit_count:112}};after={{...before,income_lit:100,lit_count:100}};document.getElementById('eyebrow').textContent='TIME REPRICED';document.getElementById('title').textContent='熄灭 12 天自由';document.getElementById('copy2').textContent='生活成本正在重新标记自由边界';document.getElementById('num').textContent='112';}}
const canvas=document.getElementById('canvas'),stage=document.getElementById('stage');let engine;function offscreen(w,h){{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}}
async function start(){{const r=stage.getBoundingClientRect();engine=new lib.RitualGrid(canvas,{{createOffscreenCanvas:offscreen}});engine.resize(r.width,r.height,Math.min(devicePixelRatio||1,2));window.engine=engine;const t0=performance.now();const result=await engine.run({{before,after,palette,kind,onProgress:(done,all,current,triggered)=>{{document.getElementById('num').textContent=current;document.getElementById('copy1').textContent=`${{done}} / ${{all}} 格完成`;const active=Math.max(0,(triggered||0)-done);document.getElementById('copy2').textContent=active>0?(kind==='ignite'?`${{active}} 格正在绽放`:`${{active}} 格正在黯淡`):(kind==='ignite'?'一天天买回属于自己的时间':'生活成本正在重新标记自由边界');document.getElementById('fill').style.width=`${{Math.round(done/all*100)}}%`;}}}});const elapsed=performance.now()-t0;document.getElementById('perf').textContent=`frames=${{result.frames}} elapsed=${{Math.round(elapsed)}}ms avg=${{(elapsed/Math.max(1,result.frames)).toFixed(1)}}ms`;window.__ritualResult=result;window.__ritualDone=true;}}
requestAnimationFrame(start);
</script></body></html>'''

scenarios = [
    ('ignite_midnight_390', 390, 844, 'ignite', 'midnight', [300, 1300, 3400, 5900, 7800]),
    ('extinguish_midnight_390', 390, 844, 'extinguish', 'midnight', [300, 1600, 4200, 7200, 9800]),
    ('ignite_paper_390', 390, 844, 'ignite', 'paper', [300, 1300, 3400, 5900, 7800]),
    ('ignite_small_320', 320, 568, 'ignite', 'midnight', [300, 1300, 3400, 5900, 7800]),
]
only = os.environ.get('ONLY','').strip()
if only:
    scenarios = [x for x in scenarios if x[0] == only]
perf = {}
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for name,w,h,kind,theme,times in scenarios:
        page = browser.new_page(viewport={'width':w,'height':h}, device_scale_factor=1)
        page.set_content(html(kind,theme), wait_until='load')
        elapsed=0
        for i,t in enumerate(times):
            wait=max(0,t-elapsed); page.wait_for_timeout(wait); elapsed=t
            page.screenshot(path=str(OUT/f'{name}_f{i}.png'), full_page=True)
        page.wait_for_function('window.__ritualDone === true', timeout=20000)
        perf[name] = page.evaluate('window.__ritualResult')
        page.close()
    # raw 1000-cell performance, exact renderer
    if not os.environ.get('SKIP_PERF'):
        page=browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=1)
        h1000=html('ignite','midnight').replace('income_lit:112,lit_count:112','income_lit:1100,lit_count:1100').replace('点亮 12 天自由','点亮 1000 天自由').replace('0 / 12 格','0 / 1000 格')
        page.set_content(h1000,wait_until='load'); t=time.time(); page.wait_for_function('window.__ritualDone === true',timeout=20000); perf['ignite_1000']={**page.evaluate('window.__ritualResult'),'wallMs':round((time.time()-t)*1000)}; page.close()
    browser.close()
(OUT/'performance.json').write_text(json.dumps(perf,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(perf,ensure_ascii=False,indent=2))
