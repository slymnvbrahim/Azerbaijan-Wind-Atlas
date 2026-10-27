// Turbines of the selected solution, access points, indicative connection lines, and the turbine details card.
// Data is loaded lazily the first time the detail zoom level is reached.
import * as state from './state.js';
import { t, fmt } from './i18n.js';
import * as S from './solutions.js';
import { REGION_DETAIL_ZOOM } from './layers.js';
import { towerColor, turbineSvg, accessIconHtml } from './icons.js';

const DATA = 'data/';
const $ = (id) => document.getElementById(id);
const turbineLayer = L.layerGroup();
const connLayer = L.layerGroup();
const netLayer = L.layerGroup();
const accessLayer = L.layerGroup();
const markers = new Map(); // "<site_id>_<tower_m>" -> L.Marker

let map = null;
let heights = [];
let loading = null;
let accessData = null;
let shown = false;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const signed = (n, d) => (n > 0 ? '+' : '') + fmt(n, d);
const typeLabel = (type) => t(type === 'substation' ? 'access.type.substation' : 'access.type.road');
const isDetail = () => state.get('showRegion') && map.getZoom() >= REGION_DETAIL_ZOOM;

export function initTurbines(mapObj, heightList) {
  map = mapObj;
  heights = heightList;
  renderLegend();
  state.on('region:detail', refresh);
  state.on('solutionId', draw);
  state.on('turbineKey', () => {
    highlight();
    renderCard();
  });
  state.on('network', () => shown && drawConnections());
  state.on('lang', () => {
    renderLegend();
    renderCard();
    relabel();
  });
  $('turbine-close').addEventListener('click', () => state.set('turbineKey', null));
  refresh();
}

// ---------- lazy loading and show / hide ----------

function ensureLoaded() {
  if (!loading) {
    loading = Promise.all([
      S.loadSolutions(DATA + 'solutions.json'),
      S.loadTurbines(DATA + 'turbines.json'),
      fetch(DATA + 'access_points.geojson').then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
    ])
      .then(([, , ap]) => {
        accessData = ap;
        buildAccess();
        if (state.get('solutionId') == null) state.set('solutionId', S.bestSolution().id);
      })
      .catch((e) => {
        console.warn('turbines not loaded:', e);
        loading = null;
        throw e;
      });
  }
  return loading;
}

async function refresh() {
  const want = isDetail();
  if (!want) {
    shown = false;
    [turbineLayer, connLayer, netLayer, accessLayer].forEach((l) => map.removeLayer(l));
    return;
  }
  if (shown) return;
  try {
    await ensureLoaded();
  } catch (e) {
    return;
  }
  if (!isDetail()) return;
  shown = true;
  accessLayer.addTo(map);
  draw();
}

// ---------- turbines and connection lines ----------

const labelOf = (tw) => t('turbine.aria', { site: tw.site_id, h: tw.tower_m });

function draw() {
  if (!shown || !S.isLoaded()) return;
  turbineLayer.clearLayers();
  markers.clear();
  const list = S.solutionTurbines(state.get('solutionId'));
  list.forEach((tw) => {
    const key = S.turbineKey(tw);
    const icon = L.divIcon({
      className: 'tb-wrap',
      html: turbineSvg({ size: 32, ring: towerColor(heights, tw.tower_m) }),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const m = L.marker([tw.lat, tw.lon], { icon, keyboard: true, title: labelOf(tw), zIndexOffset: 1000 });
    m._tw = tw;
    m.on('add', () => {
      const el = m.getElement();
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', labelOf(tw));
      el.classList.toggle('selected', key === state.get('turbineKey'));
    });
    m.on('click', () => select(key));
    markers.set(key, m);
    turbineLayer.addLayer(m);
  });
  turbineLayer.addTo(map);
  drawConnections();
}

/** Indicative straight lines; a later phase can replace them via state.setNetwork(features). */
function drawConnections() {
  connLayer.clearLayers();
  netLayer.clearLayers();
  const net = state.getNetwork();
  if (net) {
    L.geoJSON(net, { interactive: false, style: { color: '#ffffff', weight: 2.5 } }).addTo(netLayer);
    map.removeLayer(connLayer);
    netLayer.addTo(map);
    return;
  }
  map.removeLayer(netLayer);
  markers.forEach((m) => {
    const ll = m._tw.connection.coordinates.map(([lon, lat]) => [lat, lon]);
    L.polyline(ll, { color: '#000', weight: 4.5, opacity: 0.45, interactive: false }).addTo(connLayer);
    L.polyline(ll, { color: '#fff', weight: 2, dashArray: '6 6', interactive: false }).addTo(connLayer);
  });
  connLayer.addTo(map);
}

function highlight() {
  markers.forEach((m, key) => {
    const el = m.getElement();
    if (el) el.classList.toggle('selected', key === state.get('turbineKey'));
  });
}

function relabel() {
  markers.forEach((m) => {
    const el = m.getElement();
    if (el) {
      el.setAttribute('aria-label', labelOf(m._tw));
      el.title = labelOf(m._tw);
    }
  });
}

function select(key) {
  state.set('turbineKey', key);
  if (document.body.classList.contains('right-collapsed')) $('right-toggle').click();
  const card = $('turbine-card');
  if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
}

// ---------- access points ----------

function accessPopup(p) {
  const lang = state.get('lang');
  const desc = p['description_' + lang] || '';
  return (
    `<p><strong>${esc(p.name)}</strong> ${esc(desc)}</p>` +
    `<table class="kv-table"><tbody>` +
    `<tr><th scope="row">${t('access.id')}</th><td>${esc(p.id)}</td></tr>` +
    `<tr><th scope="row">${t('access.type')}</th><td>${esc(typeLabel(p.type))}</td></tr>` +
    `<tr><th scope="row">${t('access.name')}</th><td>${esc(p.name)}</td></tr>` +
    (p.voltage ? `<tr><th scope="row">${t('access.voltage')}</th><td>${esc(p.voltage)}</td></tr>` : '') +
    `</tbody></table><p class="small">${t('access.source')}</p>`
  );
}

function buildAccess() {
  accessLayer.clearLayers();
  accessData.features.forEach((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const icon = L.divIcon({ className: 'ap-wrap', html: accessIconHtml(p.type), iconSize: [22, 22], iconAnchor: [11, 11] });
    const m = L.marker([lat, lon], { icon, keyboard: true, title: p.name || p.id, zIndexOffset: 500 });
    m.bindPopup(() => accessPopup(p));
    m.on('add', () => {
      const el = m.getElement();
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', t('access.aria', { id: p.id }));
    });
    accessLayer.addLayer(m);
  });
}

// ---------- legend (layers panel) ----------

function renderLegend() {
  const ul = $('tower-legend-list');
  if (!ul) return;
  ul.textContent = '';
  [...heights].sort((a, b) => a - b).forEach((h) => {
    const li = document.createElement('li');
    li.innerHTML = turbineSvg({ size: 22, ring: towerColor(heights, h) });
    const s = document.createElement('span');
    s.textContent = `${h} ${t('height.unit')}`;
    li.appendChild(s);
    ul.appendChild(li);
  });
}

// ---------- details card (right panel) ----------

function renderCard() {
  const card = $('turbine-card');
  const key = state.get('turbineKey');
  const tw = key && S.isLoaded() ? S.getTurbine(key) : null;
  if (!tw) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const box = $('turbine-detail');
  box.textContent = '';
  const add = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    box.appendChild(el);
    return el;
  };
  add('h4', `${tw.site_id} · ${tw.tower_m} ${t('height.unit')}`, 'tcard-title');
  add('p', state.get('lang') === 'az' ? tw.why_az : tw.why_en);

  const dl = document.createElement('dl');
  dl.className = 'kv';
  const row = (k, v) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  };
  row(t('turbine.hubWs'), `${fmt(tw.hub_ws, 2)} ${t('legend.unit')}`);
  row(t('turbine.percentile', { n: S.siteCount() }), fmt(tw.hub_ws_percentile, 1) + ' %');
  row(t('turbine.cf'), fmt(tw.capacity_factor * 100, 1) + ' %');
  row(t('turbine.aep'), `${fmt(tw.aep_mwh / 1000, 2)} GWh/${state.get('lang') === 'az' ? 'il' : 'yr'}`);
  row(t('turbine.tower'), `${tw.tower_m} ${t('height.unit')}`);
  row(t('turbine.cost'), fmt(tw.cost_units, 2));
  const volt = tw.nearest_access_voltage ? `, ${tw.nearest_access_voltage}` : '';
  row(
    t('turbine.access'),
    `${tw.nearest_access_id} · ${tw.nearest_access_name} (${typeLabel(tw.nearest_access_type)}${volt}), ${fmt(tw.dist_km, 1)} km`
  );
  box.appendChild(dl);

  if (tw.alternatives && tw.alternatives.length) {
    add('h4', t('turbine.alternatives'), 'tcard-sub');
    const ul = document.createElement('ul');
    ul.className = 'alt-list';
    tw.alternatives.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = t('turbine.altRow', {
        h: a.tower_m,
        de: signed(a.delta_aep_mwh / 1000, 2),
        dp: signed(a.delta_aep_pct, 1),
        dc: signed(a.delta_cost_units, 2),
      });
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  add('p', t('turbine.inSolutions', { n: tw.in_n_solutions, total: S.nSolutions() }), 'tcard-n');
  add('p', t('turbine.honesty'), 'warn');
}
