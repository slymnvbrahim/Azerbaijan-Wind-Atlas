// Bootstrap: load data, create the map, wire click readout.
import * as state from './state.js';
import { initLang, t, applyStatic } from './i18n.js';
import { loadGrid, decodeAt, pointInGeometry, geometryOf, coverage } from './grid.js';
import { loadSolutions } from './solutions.js';
import { initLayers, refreshRegionBadge } from './layers.js';
import { initTurbines } from './turbines.js';
import { initPanels } from './panels.js';
import { initUI, setCoverage, setPoint, pointHTML, getLastPoint } from './ui.js';

const DATA = 'data/';

async function getJSON(name) {
  const r = await fetch(DATA + name);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + name);
  return r.json();
}

async function main() {
  initLang();
  let meta, outline, region;
  try {
    [meta, outline, region] = await Promise.all([
      getJSON('wind_meta.json'),
      getJSON('azerbaijan_outline.geojson'),
      getJSON('region_polygon.geojson'),
    ]);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('load-error');
    el.textContent = t('error.load');
    el.hidden = false;
    return;
  }

  // keep the default height only if the data has it, otherwise use the middle one
  if (!meta.heights_m.includes(state.get('height'))) {
    state.set('height', meta.heights_m[Math.floor(meta.heights_m.length / 2)]);
  }

  const map = initLayers(document.getElementById('map'), { meta, outline, region });
  initUI({ meta, region });
  initTurbines(map, meta.heights_m);
  applyStatic();

  // solutions are only needed for the badge text in Part 1; the map works without them
  loadSolutions(DATA + 'solutions.json')
    .then(() => {
      initPanels({ windMeta: meta });
      refreshRegionBadge();
      state.emit('lang', state.get('lang')); // re-render cards that show the turbine count
    })
    .catch((e) => {
      console.warn('solutions.json not loaded:', e);
      document.getElementById('sol-plot').textContent = t('solutions.error');
    });

  // coverage of the wind layer (how much of Azerbaijan actually has values)
  const outlineGeom = geometryOf(outline);
  const g = meta.grid;
  loadGrid(DATA + meta.layers[String(state.get('height'))].grid)
    .then((bytes) => setCoverage(coverage(bytes, g, outlineGeom)))
    .catch((e) => console.warn('coverage not computed:', e));

  // ----- click readout -----
  let popup = null;
  let clickToken = 0;
  const heights = [...meta.heights_m].sort((a, b) => b - a);

  map.on('click', async (e) => {
    const { lat, lng } = e.latlng.wrap();
    const mine = ++clickToken;
    setPoint({ loading: true });
    popup = L.popup({ maxWidth: 280, autoPanPaddingTopLeft: [window.matchMedia('(max-width: 800px)').matches ? 10 : 290, 10] }).setLatLng(e.latlng).setContent(pointHTML({ loading: true })).openOn(map);
    let point;
    try {
      const grids = await Promise.all(heights.map((h) => loadGrid(DATA + meta.layers[String(h)].grid)));
      point = {
        lat,
        lon: lng,
        inside: pointInGeometry(outlineGeom, lng, lat),
        rows: heights.map((h, i) => ({ h, ...decodeAt(grids[i], g, lng, lat) })),
      };
    } catch (err) {
      console.warn(err);
      point = { error: true };
    }
    if (mine !== clickToken) return; // a newer click superseded this one
    setPoint(point);
    popup.setContent(pointHTML(point));
  });

  state.on('lang', () => {
    if (popup && popup.isOpen()) popup.setContent(pointHTML(getLastPoint()));
  });
}

main();
