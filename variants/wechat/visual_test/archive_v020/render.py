from pathlib import Path
from playwright.sync_api import sync_playwright

base = Path(__file__).resolve().parent
out = base / 'screens'
out.mkdir(exist_ok=True)
html = (base / 'preview.html').read_text(encoding='utf-8')

cases = [
    ('iphone_onboarding1', 390, 844, 'onboarding1'),
    ('iphone_onboarding2', 390, 844, 'onboarding2'),
    ('iphone_onboarding3', 390, 844, 'onboarding3'),
    ('iphone_onboarding4', 390, 844, 'onboarding4'),
    ('iphone_home', 390, 844, 'home'),
    ('android_onboarding1', 360, 800, 'onboarding1'),
    ('android_home', 360, 800, 'home'),
    ('small_onboarding1', 320, 568, 'onboarding1'),
    ('small_onboarding4', 320, 568, 'onboarding4'),
    ('small_home', 320, 568, 'home'),
]

# set_content cannot carry a query string. Inject a deterministic mode before the page script reads location.search.
def with_mode(source: str, mode: str) -> str:
    marker = "const p=new URLSearchParams(location.search), mode=p.get('mode')||'onboarding1';"
    return source.replace(marker, f"const mode={mode!r};")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for name, w, h, mode in cases:
        page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        page.set_content(with_mode(html, mode), wait_until='load')
        dims = page.evaluate('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})')
        if dims['sw'] > dims['cw']:
            raise RuntimeError(f'{name}: horizontal overflow {dims}')
        page.screenshot(path=str(out / f'{name}.png'), full_page=True)
        print(name, dims)
        page.close()
    browser.close()
