from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RENDERER = (ROOT / 'utils' / 'ritual_grid.js').read_text(encoding='utf-8')

CSS = r'''
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#06070b;color:#f4efe5;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.overlay{position:fixed;inset:0;background:#06070b;overflow:hidden}.stage{position:absolute;inset:0;background:#06070b}.stage canvas{width:100%;height:100%;display:block}
.topveil,.bottomveil{position:absolute;left:0;right:0;pointer-events:none}.topveil{top:0;height:110px;background:linear-gradient(180deg,rgba(5,6,10,.96),rgba(5,6,10,.58),transparent)}.bottomveil{bottom:0;height:155px;background:linear-gradient(0deg,rgba(5,6,10,.98),rgba(5,6,10,.64),transparent)}
.head{position:absolute;z-index:3;left:15px;right:14px;top:38px;display:flex;justify-content:space-between;align-items:flex-start}.eyebrow{font-size:9px;letter-spacing:2px;color:#957d43}.title{margin-top:5px;font-size:18px;color:#f5d981}.skip{height:29px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.05);color:#8f929b}
.foot{position:absolute;z-index:3;left:16px;right:16px;bottom:28px}.count{display:flex;align-items:baseline;gap:7px}.num{font-size:38px;line-height:1;font-weight:700;color:#f3ce68}.unit{font-size:12px;color:#858891}.copy{margin-top:9px;display:flex;justify-content:space-between;gap:10px;color:#777;font-size:10px}.copy span:first-child{color:#a3a5ab}.copy span:last-child{text-align:right;color:#666a74}
'''

def make_html(kind='ignite'):
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{CSS}</style><script>var module={{exports:{{}}}};{RENDERER}</script></head><body>
<div class="overlay"><div class="stage" id="stage"><canvas id="canvas"></canvas></div><div class="topveil"></div><div class="bottomveil"></div><div class="head"><div><div class="eyebrow">BUY BACK YOUR TIME</div><div class="title" id="title"></div></div><button class="skip">跳过</button></div><div class="foot"><div class="count"><span id="num" class="num"></span><span class="unit">天自由</span></div><div class="copy"><span id="live"></span><span id="progress"></span></div></div></div>
<script>
const lib=module.exports; const kind='{kind}';
const palette={{background:'#0b0e13',unlit:'#292d35',lit:'#ffd166',asset:'#9cc3ff',bloom:'#fff4d6',ash:'#5a4030',ember:'#d77957',past:'#1a1d23',trackedPast:'#343126'}};
let before,after;if(kind==='ignite'){{before={{total_cells:20000,future_cells:20000,past_cells:0,tracked_past_cells:0,asset_lit:0,income_lit:100,lit_count:100}};after={{...before,income_lit:112,lit_count:112}};}}else{{before={{total_cells:20000,future_cells:20000,past_cells:0,tracked_past_cells:0,asset_lit:0,income_lit:112,lit_count:112}};after={{...before,income_lit:100,lit_count:100}};}}
num.textContent=before.lit_count; title.textContent=(kind==='ignite'?'买回 ':'交换 ')+12+(kind==='ignite'?' 天自由':' 天未来自由');progress.textContent='共 12 天';live.textContent='镜头正在寻找新的自由边界';
const canvas=document.getElementById('canvas'),stage=document.getElementById('stage');function offscreen(w,h){{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}}
window.__samples=[];
async function start(){{const r=stage.getBoundingClientRect(); const engine=new lib.RitualGrid(canvas,{{createOffscreenCanvas:offscreen}});engine.resize(r.width,r.height,1);window.__engine=engine;const t0=performance.now();let last=performance.now();const result=await engine.run({{before,after,palette,kind,onProgress:(done,all,current,triggered)=>{{num.textContent=current;const active=Math.max(0,(triggered||0)-done);if(done>=all)live.textContent=kind==='ignite'?'这段时间，已经属于你':'新的自由边界已经落定';else if(active>0)live.textContent=`第 ${{Math.min(all,done+1)}} 天 · ${{kind==='ignite'?'正在被点亮':'正在被交换'}}`;else live.textContent='镜头正在寻找新的自由边界';progress.textContent=done>0?(kind==='ignite'?`已买回 ${{done}} / ${{all}} 天`:`已交换 ${{done}} / ${{all}} 天`):`共 ${{all}} 天`;const now=performance.now();window.__samples.push(now-last);last=now;}}}});window.__result=result;window.__elapsed=performance.now()-t0;window.__done=true;}}
requestAnimationFrame(start);
</script></body></html>'''

def canvas_color_counts(page):
    return page.evaluate('''() => {
      const c=document.getElementById('canvas'),x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data;
      let gold=0,dark=0,warm=0,bloom=0;
      for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];if(a<10) continue;
        if(r>175 && g>125 && b<155) gold++;
        if(r>=28 && r<75 && g>=28 && g<80 && b>=28 && b<95) dark++;
        if(r>75 && r<190 && g>45 && g<135 && b<115) warm++;
        if(r>220 && g>180 && b>130) bloom++;
      }
      return {gold,dark,warm,bloom,w:c.width,h:c.height};
    }''')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

    p=browser.new_page(viewport={'width':390,'height':844})
    p.set_content(make_html('ignite'), wait_until='load')
    p.wait_for_timeout(3400)
    current=int(p.locator('#num').inner_text())
    assert 100 < current < 112, f'ignite numeric feedback not mid-flight: {current}'
    cc=canvas_color_counts(p)
    assert cc['gold'] > 150, f'ignite should visibly contain gold cells: {cc}'
    assert cc['dark'] > 1000, f'ignite should retain unlit field: {cc}'
    assert cc['bloom'] > 5, f'ignite should contain bloom highlight: {cc}'
    live=p.locator('#live').inner_text()
    assert '正在被点亮' in live or '已经属于你' in live, live
    p.wait_for_function('window.__done===true', timeout=18000)
    assert int(p.locator('#num').inner_text()) == 112
    result=p.evaluate('window.__result'); elapsed=p.evaluate('window.__elapsed')
    assert result['frames'] > 250 and elapsed > 6000
    assert elapsed/result['frames'] < 32, f'local ignite average frame interval too high: {elapsed/result["frames"]:.1f}ms'
    p.close()

    p=browser.new_page(viewport={'width':390,'height':844})
    p.set_content(make_html('extinguish'), wait_until='load')
    p.wait_for_timeout(4200)
    current=int(p.locator('#num').inner_text())
    assert 100 < current < 112, f'extinguish numeric feedback not mid-flight: {current}'
    cc=canvas_color_counts(p)
    assert cc['warm'] > 20, f'extinguish should visibly pass through warm/ash tones: {cc}'
    assert cc['dark'] > 1000
    live=p.locator('#live').inner_text()
    assert '正在被交换' in live or '已经落定' in live, live
    p.wait_for_function('window.__done===true', timeout=20000)
    assert int(p.locator('#num').inner_text()) == 100
    result=p.evaluate('window.__result'); elapsed=p.evaluate('window.__elapsed')
    assert result['frames'] > 300 and elapsed > 7500
    assert elapsed/result['frames'] < 32, f'local extinguish average frame interval too high: {elapsed/result["frames"]:.1f}ms'
    p.close()

    # 320x568：Canvas 本身铺满视口；反馈浮层必须完整落在安全可见区内。
    p=browser.new_page(viewport={'width':320,'height':568})
    p.set_content(make_html('ignite'), wait_until='load')
    p.wait_for_timeout(1200)
    geo=p.evaluate('''() => {const s=stage.getBoundingClientRect(), f=document.querySelector('.foot').getBoundingClientRect(), h=document.querySelector('.head').getBoundingClientRect();return {sx:s.x,sy:s.y,sw:s.width,sh:s.height,fb:f.bottom,ht:h.top,hb:h.bottom,vw:innerWidth,vh:innerHeight}}''')
    assert abs(geo['sx']) < .5 and abs(geo['sy']) < .5 and abs(geo['sw']-geo['vw']) < .5 and abs(geo['sh']-geo['vh']) < .5, geo
    assert geo['fb'] <= geo['vh'] + 0.5 and geo['ht'] >= 0 and geo['hb'] < geo['vh'], geo
    p.close()
    browser.close()

print('ritual_visual_acceptance.py: PASS')
