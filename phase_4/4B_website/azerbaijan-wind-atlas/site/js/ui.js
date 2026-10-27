// DOM side: panels, controls, legend, height selector, banner, footer, cards, modal, point readout.
// User input goes into the state module; layers.js reacts to it.
import * as state from './state.js';
import { t, fmt, setLang } from './i18n.js';
import { BASEMAPS, getMap, zoomToRegion } from './layers.js';
import { bestTurbineCount } from './solutions.js';

let meta = null;
let region = null;
let cov = null; // coverage info of the wind layer, set by app.js
let lastPoint = null;
let modalKind = null;

const $ = (id) => document.getElementById(id);
const isMobile = () => window.matchMedia('(max-width: 800px)').matches;

function invalidateSoon() {
  const map = getMap();
  if (map) setTimeout(() => map.invalidateSize(), 230);
}

// ---------- source raster bounds (union over all heights, from wind_meta) ----------

function sourceBounds() {
  const all = Object.values(meta.source_rasters).map((r) => r.bounds); // [west, south, east, north]
  return {
    n: all.length,
    w: Math.min(...all.map((b) => b[0])),
    s: Math.min(...all.map((b) => b[1])),
    e: Math.max(...all.map((b) => b[2])),
    north: Math.max(...all.map((b) => b[3])),
  };
}

function boundsParams() {
  const b = sourceBounds();
  return { count: b.n, w: fmt(b.w, 2), e: fmt(b.e, 2), s: fmt(b.s, 2), north: fmt(b.north, 2) };
}

// ---------- init ----------

export function initUI(context) {
  meta = context.meta;
  region = context.region;

  // keyboard-modality flag for the focus ring (see style.css)
  window.addEventListener('keydown', (e) => e.key === 'Tab' && document.body.classList.add('kbd'));
  window.addEventListener('pointerdown', () => document.body.classList.remove('kbd'));

  // language switch
  document.querySelectorAll('.lang button').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  // menu / modal
  $('btn-about').addEventListener('click', () => openModal('about'));
  $('btn-methods').addEventListener('click', () => openModal('methods'));
  $('modal-close').addEventListener('click', () => $('modal').close());
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) $('modal').close(); // click on the backdrop
  });
  $('modal').addEventListener('close', () => {
    modalKind = null;
  });

  // panels
  const layersPanel = $('layers-panel');
  const setLayersCollapsed = (c) => {
    layersPanel.classList.toggle('collapsed', c);
    $('layers-toggle').setAttribute('aria-expanded', String(!c));
  };
  $('layers-toggle').addEventListener('click', () =>
    setLayersCollapsed(!layersPanel.classList.contains('collapsed'))
  );
  setLayersCollapsed(isMobile());

  const setRightCollapsed = (c) => {
    document.body.classList.toggle('right-collapsed', c);
    $('right-toggle').setAttribute('aria-expanded', String(!c));
    invalidateSoon();
  };
  $('right-toggle').addEventListener('click', () =>
    setRightCollapsed(!document.body.classList.contains('right-collapsed'))
  );
  setRightCollapsed(isMobile());

  // layer controls -> state
  document.querySelectorAll('input[name="basemap"]').forEach((r) => {
    r.checked = r.value === state.get('basemap');
    r.addEventListener('change', () => r.checked && state.set('basemap', r.value));
  });
  bindCheck('chk-wind', 'showWind');
  bindCheck('chk-outline', 'showOutline');
  bindCheck('chk-region', 'showRegion');
  bindCheck('chk-sites', 'showSites');
  const rng = $('rng-opacity');
  rng.value = String(state.get('opacity'));
  rng.addEventListener('input', () => state.set('opacity', parseFloat(rng.value)));
  state.on('opacity', renderOpacityLabel);

  buildHeightSelector();
  renderAll();

  // re-render texts with numbers on language change
  state.on('lang', () => {
    renderAll();
    if (modalKind) renderModal();
  });
  state.on('basemap', renderFooter);
  state.on('height', () => {
    renderDataCard();
    updateHeightButtons();
  });
  state.on('wind:error', () => {
    const el = $('load-error');
    el.textContent = t('error.load');
    el.hidden = false;
  });
}

function bindCheck(id, key) {
  const el = $(id);
  el.checked = state.get(key);
  el.addEventListener('change', () => state.set(key, el.checked));
  state.on(key, (v) => {
    el.checked = v;
  });
}

function renderAll() {
  renderBanner();
  renderFooter();
  renderLegend();
  renderOpacityLabel();
  renderRegionCard();
  renderDataCard();
  renderPointPanel();
  updateLeafletLabels();
  document.querySelectorAll('.lang button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === state.get('lang')));
  });
}

function updateLeafletLabels() {
  const zin = document.querySelector('.leaflet-control-zoom-in');
  const zout = document.querySelector('.leaflet-control-zoom-out');
  if (zin) {
    zin.title = t('map.zoomIn');
    zin.setAttribute('aria-label', t('map.zoomIn'));
  }
  if (zout) {
    zout.title = t('map.zoomOut');
    zout.setAttribute('aria-label', t('map.zoomOut'));
  }
}

// ---------- coverage (from the grid, set by app.js) ----------

export function setCoverage(c) {
  cov = c;
  renderBanner();
  renderDataCard();
}

// ---------- banner and footer ----------

function renderBanner() {
  const el = $('banner');
  const lang = state.get('lang');
  el.textContent = '';
  const disc = document.createElement('span');
  disc.textContent = meta['disclaimer_' + lang] || meta.disclaimer_en;
  el.appendChild(disc);
  el.appendChild(document.createTextNode(' ' + t('banner.connection')));
  if (cov && cov.share < 0.95) {
    const warn = document.createElement('strong');
    warn.className = 'banner-warn';
    warn.textContent = ' ⚠ ' + t('banner.coverage', { share: fmt(cov.share * 100, 1), ...boundsParams() });
    el.appendChild(warn);
  }
}

function renderFooter() {
  const el = $('footer');
  el.textContent = '';
  const parts = [...meta.attribution];
  parts.forEach((txt, i) => {
    const s = document.createElement('span');
    s.textContent = txt;
    el.appendChild(s);
  });
  const bm = BASEMAPS[state.get('basemap')];
  if (bm.attribution) {
    const s = document.createElement('span');
    s.innerHTML = bm.attribution; // constant strings defined in layers.js
    el.appendChild(s);
  }
  const lf = document.createElement('a');
  lf.href = 'https://leafletjs.com';
  lf.target = '_blank';
  lf.rel = 'noopener';
  lf.textContent = 'Leaflet ' + (window.L ? window.L.version : '');
  el.appendChild(lf);
}

// ---------- legend and height selector ----------

function renderLegend() {
  const { stops, vmin, vmax } = meta.ramp;
  const span = vmax - vmin;
  const grad = stops
    .map((s) => `${s.color} ${(((s.v - vmin) / span) * 100).toFixed(2)}%`)
    .join(', ');
  $('legend-bar').style.background = `linear-gradient(to top, ${grad})`;
  const ticks = $('legend-ticks');
  ticks.textContent = '';
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const v = vmin + (span * i) / n;
    const s = document.createElement('span');
    s.style.bottom = (i / n) * 100 + '%';
    s.textContent = fmt(v, 0) + (i === n ? '+' : ''); // top of the scale is clamped: "10+"
    ticks.appendChild(s);
  }
}

function buildHeightSelector() {
  const box = $('heightsel');
  box.textContent = '';
  const heights = [...meta.heights_m].sort((a, b) => b - a); // top = highest, like GWA
  const unit = document.createElement('span');
  unit.className = 'heightsel-unit';
  unit.setAttribute('aria-hidden', 'true');
  unit.textContent = t('height.unit');
  box.appendChild(unit);
  heights.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.h = String(h);
    b.textContent = String(h);
    b.title = `${h} ${t('height.unit')}`;
    b.addEventListener('click', () => state.set('height', h));
    b.addEventListener('keydown', (e) => {
      const i = heights.indexOf(Number(b.dataset.h));
      let j = i;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = Math.max(0, i - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = Math.min(heights.length - 1, i + 1);
      else return;
      e.preventDefault();
      state.set('height', heights[j]);
      box.querySelector(`[data-h="${heights[j]}"]`).focus();
    });
    box.appendChild(b);
  });
  updateHeightButtons();
  state.on('lang', () => {
    unit.textContent = t('height.unit');
  });
}

function updateHeightButtons() {
  document.querySelectorAll('#heightsel button').forEach((b) => {
    const on = Number(b.dataset.h) === state.get('height');
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function renderOpacityLabel() {
  $('out-opacity').textContent = Math.round(state.get('opacity') * 100) + '%';
}

// ---------- cards ----------

function renderRegionCard() {
  const el = $('region-card');
  const props = region.features[0].properties;
  const n = bestTurbineCount();
  el.textContent = '';
  const dl = document.createElement('dl');
  dl.className = 'kv';
  const row = (k, v) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  };
  if (props.area_km2 != null) row(t('regionCard.area'), fmt(props.area_km2, 1) + ' km²');
  el.appendChild(dl);
  if (n !== null) {
    const p = document.createElement('p');
    p.textContent = t('regionCard.best', { n });
    el.appendChild(p);
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = t('regionCard.zoom');
  b.addEventListener('click', zoomToRegion);
  el.appendChild(b);
}

function renderDataCard() {
  const el = $('data-card');
  el.textContent = '';
  const add = (text, cls) => {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    el.appendChild(p);
  };
  if (cov) {
    add(
      t('data.coverageLine', {
        valid: fmt(cov.validCells, 0),
        inside: fmt(cov.insideCells, 0),
        share: fmt(cov.share * 100, 1),
      }),
      cov.share < 0.95 ? 'warn' : ''
    );
  }
  add(t('data.sources', boundsParams()));
  const h = state.get('height');
  const st = meta.layers[String(h)] && meta.layers[String(h)].stats_png_pixels;
  if (st) {
    add(t('data.stats', { h, min: fmt(st.min, 2), mean: fmt(st.mean, 2), max: fmt(st.max, 2) }));
  }
  add(t('data.gridNote'), 'small');
}

// ---------- point readout (shared by popup and right panel) ----------

/**
 * @param {null | {loading:true} | {error:true} | {lat:number, lon:number, inside:boolean,
 *        rows:{h:number, status:string, value?:number}[]}} p
 */
export function pointHTML(p) {
  if (!p) return `<p class="hint">${t('point.hint')}</p>`;
  if (p.loading) return `<p>${t('point.loading')}</p>`;
  if (p.error) return `<p class="warn">${t('point.error')}</p>`;
  const coords = `<p class="coords">${t('point.lat')}: ${fmt(p.lat, 5)} &middot; ${t('point.lon')}: ${fmt(p.lon, 5)}</p>`;
  if (!p.inside) return coords + `<p class="warn">${t('point.outside')}</p>`;
  const anyOk = p.rows.some((r) => r.status === 'ok');
  if (!anyOk) return coords + `<p class="warn">${t('point.noDataInside')}</p>`;
  const rows = p.rows
    .map((r) => {
      const val =
        r.status === 'ok'
          ? `${fmt(r.value, 2)} ${t('legend.unit')}`
          : `<span class="muted">${t('point.nodata')}</span>`;
      return `<tr><th scope="row">${r.h} ${t('height.unit')}</th><td>${val}</td></tr>`;
    })
    .join('');
  const hole = p.rows.some((r) => r.status !== 'ok') ? `<p class="small">${t('point.holeNote')}</p>` : '';
  return (
    coords +
    `<table class="kv-table" aria-label="${t('point.speed')}">` +
    `<thead><tr><th>${t('point.height')}</th><th>${t('point.speed')}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    hole
  );
}

export function setPoint(p) {
  lastPoint = p;
  renderPointPanel();
}

export function getLastPoint() {
  return lastPoint;
}

function renderPointPanel() {
  $('point-panel').innerHTML = pointHTML(lastPoint);
}

// ---------- modal ----------

export function openModal(kind) {
  modalKind = kind;
  renderModal();
  const dlg = $('modal');
  if (!dlg.open) dlg.showModal();
}

function renderModal() {
  const title = $('modal-title');
  const box = $('modal-content');
  box.textContent = '';
  const p = (text) => {
    const el = document.createElement('p');
    el.textContent = text;
    box.appendChild(el);
  };
  if (modalKind === 'about') {
    title.textContent = t('about.title');
    p(t('about.p1'));
    p(t('about.p2'));
    p(t('about.p3'));
  } else {
    title.textContent = t('methods.title');
    const h = document.createElement('h3');
    h.textContent = t('methods.sources');
    box.appendChild(h);
    const ul = document.createElement('ul');
    meta.attribution.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    p(meta.licence_note);
    p(t('methods.tiles'));
    p(t('methods.limit'));
    p(t('methods.pending'));
  }
}
