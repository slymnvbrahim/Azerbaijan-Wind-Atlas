// Map and layers: basemaps, wind overlay, outline, study region (+ badge), candidate sites.
// Reads state changes (ui.js writes them) and updates the map. Uses the global `L` (Leaflet 1.9.4).
import * as state from './state.js';
import { t, fmt } from './i18n.js';
import { bestTurbineCount } from './solutions.js';
import { siteIconHtml } from './icons.js';

export { setNetwork } from './state.js';

const DATA = 'data/';
export const REGION_DETAIL_ZOOM = 8; // below: highlighted region + badge, from here: detail level

export const BASEMAPS = {
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  },
  plain: { url: null, maxZoom: 19, attribution: '' }, // no tiles: CSS background only
};

// ---------- colour ramp helpers (from wind_meta.ramp) ----------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS colour for a wind speed, linear in RGB between the ramp stops, clamped at both ends. */
export function rampColor(ramp, v) {
  const s = ramp.stops;
  if (v <= s[0].v) return s[0].color;
  if (v >= s[s.length - 1].v) return s[s.length - 1].color;
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i].v) {
      const a = hexToRgb(s[i - 1].color);
      const b = hexToRgb(s[i].color);
      const f = (v - s[i - 1].v) / (s[i].v - s[i - 1].v);
      const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return s[s.length - 1].color;
}

// ---------- module state ----------

let map = null;
let ctx = null; // { meta, outline, region }
let tileLayer = null;
let windOverlay = null;
let windHeight = null;
let windToken = 0;
let outlineLayer = null;
let regionLayer = null;
let regionBadge = null;
let regionBounds = null;
let outlineBounds = null;
let sitesLayer = null; // small dots (zoom 8-9)
let siteIcons = null; // small grey turbine icons (zoom >= 10)
let sitesLoading = false;

export function getMap() {
  return map;
}

export function initLayers(mapEl, context) {
  ctx = context;
  const { meta, outline, region } = ctx;

  map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: false, // attributions are shown in the footer strip (see ui.js)
    preferCanvas: true,
    maxZoom: 18,
    minZoom: 4,
  });
  map.createPane('wind').style.zIndex = 250;
  map.createPane('outline').style.zIndex = 350;
  map.getPane('outline').style.pointerEvents = 'none';

  L.control.zoom({ position: 'topright' }).addTo(map);
  addHomeControl();
  addCoordsAndScale(mapEl);

  outlineLayer = L.geoJSON(outline, {
    pane: 'outline',
    interactive: false,
    style: { color: '#ffffff', weight: 1.3, opacity: 0.95, fill: false },
  });
  outlineBounds = outlineLayer.getBounds();

  regionLayer = L.geoJSON(region, { interactive: false, style: regionStyle() });
  regionBounds = regionLayer.getBounds();
  regionBadge = makeBadge();

  fitAzerbaijan();
  applyBasemap();
  syncWind();
  syncOutline();
  syncRegion();

  // state -> map
  state.on('basemap', applyBasemap);
  state.on('height', syncWind);
  state.on('showWind', syncWind);
  state.on('opacity', () => windOverlay && windOverlay.setOpacity(state.get('opacity')));
  state.on('showOutline', syncOutline);
  state.on('showRegion', syncRegion);
  state.on('showSites', syncSites);
  state.on('height', () => {
    styleSites();
    recolorSiteIcons();
  });
  map.on('zoomend', () => {
    styleSites();
    updateSites();
  });
  state.on('lang', refreshBadgeText);
  map.on('zoomend', syncRegion);
  return map;
}

// ---------- view helpers ----------

export function fitAzerbaijan() {
  const mobile = window.matchMedia('(max-width: 800px)').matches;
  map.fitBounds(outlineBounds, { paddingTopLeft: [mobile ? 10 : 290, 10], paddingBottomRight: [10, 10] });
}

export function zoomToRegion() {
  const mobile = window.matchMedia('(max-width: 800px)').matches;
  map.fitBounds(regionBounds, { paddingTopLeft: [mobile ? 20 : 290, 20], paddingBottomRight: [20, 20] });
}

function addHomeControl() {
  const Home = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const a = L.DomUtil.create('button', 'home-btn', div);
      a.type = 'button';
      a.innerHTML = '&#8962;';
      a.dataset.i18nAria = 'map.home';
      a.dataset.i18nTitle = 'map.home';
      a.setAttribute('aria-label', t('map.home'));
      a.title = t('map.home');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, 'click', fitAzerbaijan);
      return div;
    },
  });
  new Home().addTo(map);
}

function addCoordsAndScale() {
  // added first so the scale bar sits above the readout (bottom controls stack upwards)
  const Coords = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'coords-readout');
      div.id = 'coords-readout';
      div.textContent = '';
      div.setAttribute('aria-hidden', 'true');
      return div;
    },
  });
  new Coords().addTo(map);
  L.control.scale({ position: 'bottomleft', metric: true, imperial: true }).addTo(map);

  let raf = 0;
  const show = (latlng) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const p = latlng.wrap();
      document.getElementById('coords-readout').textContent = fmt(p.lat, 5) + ' : ' + fmt(p.lng, 5);
    });
  };
  map.on('mousemove', (e) => show(e.latlng));
  map.on('click', (e) => show(e.latlng));
  state.on('lang', () => {
    const c = map.getCenter();
    const el = document.getElementById('coords-readout');
    if (el && el.textContent !== '') show(c);
  });
}

// ---------- basemap ----------

function applyBasemap() {
  const key = state.get('basemap');
  const def = BASEMAPS[key];
  if (tileLayer) {
    map.removeLayer(tileLayer);
    tileLayer = null;
  }
  map.getContainer().classList.toggle('basemap-plain', !def.url);
  if (def.url) {
    tileLayer = L.tileLayer(def.url, { maxZoom: def.maxZoom, maxNativeZoom: def.maxZoom });
    tileLayer.addTo(map);
  }
}

// ---------- wind overlay (lazy: only the selected height is requested) ----------

function makeOverlay(h) {
  return L.imageOverlay(DATA + ctx.meta.layers[String(h)].png, ctx.meta.png.leaflet_bounds, {
    pane: 'wind',
    opacity: 0,
    interactive: false,
    alt: '',
  });
}

export function syncWind() {
  const want = state.get('showWind');
  const h = state.get('height');
  if (!want) {
    windToken++;
    if (windOverlay) map.removeLayer(windOverlay);
    windOverlay = null;
    windHeight = null;
    return;
  }
  if (windOverlay && windHeight === h) {
    windOverlay.setOpacity(state.get('opacity'));
    return;
  }
  const mine = ++windToken;
  const next = makeOverlay(h);
  next.once('load', () => {
    if (mine !== windToken) {
      map.removeLayer(next); // a newer request superseded this one
      return;
    }
    if (windOverlay) map.removeLayer(windOverlay);
    windOverlay = next;
    windHeight = h;
    next.setOpacity(state.get('opacity'));
  });
  next.once('error', () => {
    map.removeLayer(next);
    state.emit('wind:error', h);
  });
  next.addTo(map);
}

// ---------- outline ----------

function syncOutline() {
  if (state.get('showOutline')) outlineLayer.addTo(map);
  else map.removeLayer(outlineLayer);
}

// ---------- study region ----------

function regionStyle() {
  const detail = map && map.getZoom() >= REGION_DETAIL_ZOOM;
  return detail
    ? { color: '#111', weight: 2.5, dashArray: '8 5', fill: true, fillColor: '#fff', fillOpacity: 0.04 }
    : { color: '#111', weight: 3, fill: true, fillColor: '#fff', fillOpacity: 0.4 };
}

function makeBadge() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'region-badge';
  L.DomEvent.disableClickPropagation(btn);
  L.DomEvent.on(btn, 'click', zoomToRegion);
  const marker = L.marker(regionBounds.getCenter(), {
    icon: L.divIcon({ className: 'region-badge-wrap', html: btn, iconSize: [0, 0] }),
    keyboard: false,
    zIndexOffset: 1000,
  });
  marker._btn = btn;
  return marker;
}

function refreshBadgeText() {
  const btn = regionBadge._btn;
  const n = bestTurbineCount();
  const text = n === null ? t('region.badgeNoCount') : t('region.badge', { n });
  btn.textContent = text;
  btn.setAttribute('aria-label', t('region.badgeAria') + ': ' + text);
}

function syncRegion() {
  const show = state.get('showRegion');
  const detail = map.getZoom() >= REGION_DETAIL_ZOOM;
  regionLayer.setStyle(regionStyle());
  if (show) regionLayer.addTo(map);
  else map.removeLayer(regionLayer);
  if (show && !detail) {
    refreshBadgeText();
    regionBadge.addTo(map);
  } else {
    map.removeLayer(regionBadge);
  }
  state.emit('region:detail', show && detail); // Part 2 hooks turbines / access points here
}

export function refreshRegionBadge() {
  refreshBadgeText();
}

// ---------- candidate sites (lazy-loaded) ----------

/** Candidate sites exist only from zoom 8: tiny dots at 8-9, small grey turbine icons from 10. */
const SITES_MIN_ZOOM = 8;
const SITES_ICON_ZOOM = 10;

function siteRadius() {
  return 2.5;
}

function siteTip(p) {
  const sel = state.get('height');
  return `${p.site_id}: ${fmt(p['ws' + sel], 2)} ${t('legend.unit')} (${sel} ${t('height.unit')})`;
}

function siteIcon(p) {
  const fill = rampColor(ctx.meta.ramp, p['ws' + state.get('height')]);
  return L.divIcon({ className: 'site-wrap', html: siteIconHtml(16, fill), iconSize: [16, 16], iconAnchor: [8, 8] });
}

function recolorSiteIcons() {
  if (siteIcons) siteIcons.eachLayer((m) => m.setIcon(siteIcon(m._props)));
}

function setLayerShown(layer, on) {
  if (!layer) return;
  if (on && !map.hasLayer(layer)) layer.addTo(map);
  if (!on && map.hasLayer(layer)) map.removeLayer(layer);
}

function updateSites() {
  const on = state.get('showSites');
  const z = map.getZoom();
  setLayerShown(sitesLayer, on && z >= SITES_MIN_ZOOM && z < SITES_ICON_ZOOM);
  setLayerShown(siteIcons, on && z >= SITES_ICON_ZOOM);
}

/** Recolour by the selected height and resize by zoom, without reloading the data. */
function styleSites() {
  if (!sitesLayer) return;
  const h = state.get('height');
  const r = siteRadius();
  sitesLayer.eachLayer((m) => {
    m.setStyle({ fillColor: rampColor(ctx.meta.ramp, m.feature.properties['ws' + h]) });
    m.setRadius(r);
  });
}

async function syncSites() {
  if (!state.get('showSites')) {
    updateSites();
    return;
  }
  if (!sitesLayer && !sitesLoading) {
    sitesLoading = true;
    try {
      const r = await fetch(DATA + 'candidate_sites.geojson');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const gj = await r.json();
      sitesLayer = L.geoJSON(gj, {
        pointToLayer: (f, latlng) => {
          const h = state.get('height');
          const m = L.circleMarker(latlng, {
            radius: siteRadius(),
            weight: 1,
            color: '#ffffff',
            fillColor: rampColor(ctx.meta.ramp, f.properties['ws' + h]),
            fillOpacity: 1,
          });
          m.bindTooltip(() => siteTip(f.properties));
          return m;
        },
      });
      siteIcons = L.layerGroup(
        gj.features.map((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const m = L.marker([lat, lon], { icon: siteIcon(f.properties), keyboard: false, zIndexOffset: -2000 });
          m._props = f.properties;
          m.bindTooltip(() => siteTip(f.properties));
          return m;
        })
      );
    } catch (e) {
      console.warn('Candidate sites could not be loaded:', e);
      state.set('showSites', false);
    } finally {
      sitesLoading = false;
    }
  }
  updateSites();
}
