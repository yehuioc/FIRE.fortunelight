from pathlib import Path
from playwright.sync_api import sync_playwright
base=Path(__file__).resolve().parent; out=base/'screens_v030'; out.mkdir(exist_ok=True)
html=(base/'v030_preview.html').read_text(encoding='utf-8')
cases=[
 ('iphone_home_midnight',390,844,'home'),('iphone_home_paper',390,844,'home-paper'),
 ('iphone_onboarding_quick',390,844,'onb-quick'),('iphone_onboarding_advanced',390,844,'onb-advanced'),
 ('android_home_midnight',360,800,'home'),('android_home_paper',360,800,'home-paper'),
 ('small_onboarding_quick',320,568,'onb-quick'),('small_onboarding_advanced',320,568,'onb-advanced'),
 ('iphone_settings_midnight',390,844,'settings'),('iphone_settings_advanced',390,844,'settings-advanced'),('iphone_settings_paper',390,844,'settings-paper')]
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for name,w,h,mode in cases:
    page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
    source=html.replace("const mode=new URLSearchParams(location.search).get('mode')||'home';", f"const mode={mode!r};")
    page.set_content(source, wait_until='load')
    dims=page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})')
    if dims['sw']>dims['cw']: raise RuntimeError(f'{name}: horizontal overflow {dims}')
    # transaction submit should be geometrically centered
    if mode.startswith('home'):
      box=page.locator('.submit').bounding_box(); txt=page.locator('.submit').evaluate('(e)=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}')
      if not box or abs(txt['x']-(box['x']+box['width']/2))>1 or abs(txt['y']-(box['y']+box['height']/2))>1: raise RuntimeError(f'{name}: submit not centered')
    page.screenshot(path=str(out/f'{name}.png'),full_page=True)
    print(name,dims)
    page.close()
  browser.close()
