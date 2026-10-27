"""Headless smoke test. Leaflet files are served from a local npm copy (the sandbox cannot reach unpkg);
basemap tiles are replaced by a flat 1x1 PNG, so screenshots do NOT show real tiles.
Usage: python3 tests/smoke.py <leaflet_package_dir> <out_dir>"""
import sys, base64, threading, http.server, socketserver, functools, json, os
from playwright.sync_api import sync_playwright

LEAFLET, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Q, directory=os.path.join(os.path.dirname(__file__), '..', 'site'))
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8791), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

errors, requests = [], []
def route(r):
    u = r.request.url
    if 'unpkg.com/leaflet@1.9.4/dist/leaflet.js' in u:
        r.fulfill(path=f'{LEAFLET}/dist/leaflet.js', content_type='application/javascript')
    elif 'unpkg.com/leaflet@1.9.4/dist/leaflet.css' in u:
        r.fulfill(path=f'{LEAFLET}/dist/leaflet.css', content_type='text/css')
    elif 'arcgisonline.com' in u or 'openstreetmap.org' in u:
        r.fulfill(body=PNG, content_type='image/png')
    else:
        r.continue_()

def run(p, viewport, tag, mobile=False):
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome') if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else p.chromium.launch()
    ctx = b.new_context(viewport=viewport, has_touch=mobile, is_mobile=mobile)
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append((tag, m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errors.append((tag, 'pageerror', str(e))))
    pg.on('request', lambda r: requests.append((tag, r.url)))
    pg.route('**/*', route)
    pg.goto('http://127.0.0.1:8791/index.html'); pg.wait_for_selector('.leaflet-image-layer', state='attached', timeout=15000)
    pg.wait_for_timeout(1200)
    res = {}
    res['title'] = pg.title()
    res['subtitle'] = pg.inner_text('.subtitle')
    res['banner'] = pg.inner_text('#banner')
    res['badge'] = pg.inner_text('.region-badge')
    res['zoom_initial'] = pg.evaluate('document.querySelector(".leaflet-container") && 1')
    res['legend_ticks'] = pg.inner_text('#legend-ticks').split()
    res['heights'] = pg.eval_on_selector_all('#heightsel button', 'els=>els.map(e=>e.textContent+":"+e.getAttribute("aria-checked"))')
    res['png_requests_initial'] = sorted({u.split('/')[-1] for t,u in requests if t==tag and u.endswith('.png') and 'wind_' in u})
    pg.screenshot(path=f'{OUT}/{tag}_1_initial.png')
    # click the badge -> zoom to region
    pg.click('.region-badge'); pg.wait_for_timeout(1500)
    res['badge_after_zoom'] = pg.locator('.region-badge').count()
    # click in the middle of the map (inside study region after zoom)
    box = pg.locator('#map').bounding_box()
    pg.mouse.click(box['x'] + box['width']*0.5 + (0 if mobile else 140), box['y'] + box['height']*0.5)
    pg.wait_for_selector('.leaflet-popup-content table', timeout=8000)
    res['popup_az'] = pg.inner_text('.leaflet-popup-content').replace('\n', ' | ')
    res['coords'] = pg.inner_text('#coords-readout')
    pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/{tag}_2_region_click.png')
    # switch height and language
    pg.click('#heightsel button[data-h="150"]'); pg.wait_for_timeout(1200)
    res['png_requests_after_150'] = sorted({u.split('/')[-1] for t,u in requests if t==tag and u.endswith('.png') and 'wind_' in u})
    pg.click('.lang button[data-lang="en"]'); pg.wait_for_timeout(300)
    res['popup_en'] = pg.inner_text('.leaflet-popup-content').replace('\n', ' | ')
    res['title_en'] = pg.title()
    # click outside Azerbaijan (Caspian Sea, far east of the view)
    pg.mouse.click(box['x'] + 8, box['y'] + box['height']*0.5); pg.wait_for_timeout(600)
    pg.wait_for_function('document.querySelector(".leaflet-popup-content") && !document.querySelector(".leaflet-popup-content table")', timeout=5000)
    res['popup_other'] = pg.inner_text('.leaflet-popup-content').replace('\n', ' | ')
    # opacity slider + sites toggle + basemap switch
    res['layers_collapsed_initially'] = pg.evaluate("document.getElementById('layers-panel').classList.contains('collapsed')")
    if res['layers_collapsed_initially']: pg.click('#layers-toggle')  # open the panel like a user would
    res['layers_expanded_after_click'] = pg.get_attribute('#layers-toggle', 'aria-expanded')
    pg.fill('#rng-opacity', '0.4'); res['opacity_label'] = pg.inner_text('#out-opacity')
    pg.check('#chk-sites'); pg.wait_for_timeout(500)
    res['site_dots'] = pg.evaluate('document.querySelectorAll("canvas.leaflet-zoom-animated").length')
    pg.check('input[name=basemap][value=osm]'); pg.wait_for_timeout(300)
    res['footer'] = pg.inner_text('#footer')
    pg.check('input[name=basemap][value=plain]'); pg.wait_for_timeout(300)
    res['plain_class'] = pg.evaluate('document.getElementById("map").classList.contains("basemap-plain")')
    pg.screenshot(path=f'{OUT}/{tag}_3_en_sites_plain.png')
    b.close()
    return res

with sync_playwright() as p:
    out = {'desktop': run(p, {'width': 1400, 'height': 850}, 'desktop'),
           'mobile': run(p, {'width': 390, 'height': 800}, 'mobile', mobile=True)}
print(json.dumps(out, ensure_ascii=False, indent=1))
real_errors = [e for e in errors if not ('arcgisonline' in e[2] or 'tile.openstreetmap' in e[2])]
print('console errors/warnings:', json.dumps(real_errors, ensure_ascii=False, indent=1) if real_errors else 'none')
srv.shutdown()
