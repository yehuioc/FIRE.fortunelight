from pathlib import Path
from playwright.sync_api import sync_playwright
base=Path(__file__).resolve().parent; out=base/'screens'; out.mkdir(exist_ok=True)
html=(base/'secondary.html').read_text(encoding='utf-8')
cases=[('iphone_settings',390,844,'settings'),('iphone_guide',390,844,'guide'),('iphone_history',390,844,'history'),('android_settings',360,800,'settings')]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for name,w,h,fn in cases:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='load'); page.evaluate(f'{fn}()')
        dims=page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})')
        if dims['sw']>dims['cw']: raise RuntimeError(f'{name} overflow {dims}')
        page.screenshot(path=str(out/f'{name}.png'),full_page=True)
        print(name,dims)
        page.close()
    browser.close()
