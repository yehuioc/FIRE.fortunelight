from pathlib import Path
from playwright.sync_api import sync_playwright
base=Path(__file__).resolve().parent
out=base/'screens_v050_core'; out.mkdir(exist_ok=True)
html=(base/'v050_core_preview.html').read_text(encoding='utf-8')
cases=[('home390',390,844,'home'),('home320',320,568,'home'),('guide390',390,844,'guide'),('guide320',320,568,'guide'),('free390',390,844,'free'),('free320',320,568,'free')]
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for name,w,h,m in cases:
        pg=b.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        source=html.replace("const q=new URLSearchParams(location.search).get('m')||'home';", f"const q={m!r};")
        pg.set_content(source, wait_until='load')
        dims=pg.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})')
        if dims['sw']>dims['cw']: raise RuntimeError(f'{name}: horizontal overflow {dims}')
        pg.screenshot(path=str(out/f'{name}.png'),full_page=(m!='free'))
        print(name,dims)
        pg.close()
    b.close()
