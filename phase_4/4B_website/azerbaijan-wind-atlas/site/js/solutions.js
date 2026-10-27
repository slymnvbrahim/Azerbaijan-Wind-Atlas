// Solutions data access. Part 1 only needs the best-compromise turbine count for the region badge.
// Part 2 extends this module (scatter plot, presets, table, downloads).

let data = null;

let solPromise = null;
/** Loads solutions.json once (later calls return the same promise). */
export function loadSolutions(url) {
  if (!solPromise) {
    solPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.json();
      })
      .then((j) => (data = j));
    solPromise.catch(() => (solPromise = null));
  }
  return solPromise;
}

let tur = null; // turbines.json
let turPromise = null;
/** Loads turbines.json once (lazy: called when the detail zoom level is first reached). */
export function loadTurbines(url) {
  if (!turPromise) {
    turPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.json();
      })
      .then((j) => (tur = j));
    turPromise.catch(() => (turPromise = null));
  }
  return turPromise;
}

/** For tests: inject parsed JSON instead of fetching. */
export function setData(solutionsJson, turbinesJson) {
  data = solutionsJson;
  tur = turbinesJson;
}

export const allSolutions = () => data.solutions;
export const isLoaded = () => data !== null && tur !== null;
export const nSolutions = () => data.meta.n_solutions;
export const siteCount = () => Object.keys(data.sites).length;
export const getSolution = (id) => data.solutions.find((s) => s.id === id) || null;
export const turbineKey = (x) => `${x.site_id}_${x.tower_m}`;
export const getTurbine = (key) => (tur ? tur.turbines[key] || null : null);

/** Full turbine records of a solution, in the solution's order. Throws if one is missing. */
export function solutionTurbines(id) {
  const s = data && getSolution(id);
  if (!s) return [];
  return s.turbines.map((x) => {
    const rec = getTurbine(turbineKey(x));
    if (!rec) throw new Error('turbine missing in turbines.json: ' + turbineKey(x));
    return rec;
  });
}

export function bestSolution() {
  if (!data) return null;
  return (
    data.solutions.find((s) => s.id === data.meta.best_svf_id) ||
    data.solutions.find((s) => s.is_best_svf) ||
    null
  );
}

/** Number of turbines in the best-SVF solution, or null if solutions are not loaded. */
export function bestTurbineCount() {
  const b = bestSolution();
  return b ? b.turbines.length : null;
}

// ---------- presets ----------

function argBest(list, valueOf, dir) {
  let best = null;
  for (const s of list) {
    if (best === null || (dir > 0 ? valueOf(s) > valueOf(best) : valueOf(s) < valueOf(best))) best = s;
  }
  return best;
}

/** Solution ids of the four presets. Ties go to the earlier (higher-SVF) solution. */
export function presetPicks() {
  const L = data.solutions;
  return {
    best: bestSolution().id,
    energy: argBest(L, (s) => s.objectives.aep_gwh, +1).id,
    access: argBest(L, (s) => s.objectives.mean_access, +1).id,
    cost: argBest(L, (s) => s.objectives.cost_units, -1).id,
  };
}

// ---------- turbine table ----------

export const COLUMNS = [
  { key: 'site', value: (x) => x.site_id, text: true },
  { key: 'tower', value: (x) => x.tower_m },
  { key: 'wind', value: (x) => x.hub_ws },
  { key: 'aep', value: (x) => x.aep_mwh },
  { key: 'cf', value: (x) => x.capacity_factor * 100 },
  { key: 'access', value: (x) => x.access_score },
  { key: 'dist', value: (x) => x.dist_km },
  { key: 'cost', value: (x) => x.cost_units },
];

/** Sorted copy of turbine records (stable). dir: 1 ascending, -1 descending. */
export function sortTurbines(rows, key, dir) {
  const col = COLUMNS.find((c) => c.key === key) || COLUMNS[0];
  return rows
    .map((r, i) => [r, i])
    .sort((a, b) => {
      const va = col.value(a[0]);
      const vb = col.value(b[0]);
      const c = col.text ? String(va).localeCompare(String(vb)) : va - vb;
      return c * dir || a[1] - b[1];
    })
    .map((p) => p[0]);
}

// ---------- export (client side) ----------

const CSV_FIELDS = [
  'site_id', 'tower_m', 'lon', 'lat', 'hub_ws', 'hub_ws_percentile', 'aep_mwh', 'capacity_factor',
  'cost_units', 'access_score', 'dist_km', 'nearest_access_id', 'nearest_access_name', 'nearest_access_type',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV of a solution, one row per turbine. Decimal point is always "." (machine readable). */
export function solutionCsv(id) {
  const s = getSolution(id);
  const lines = [['solution_id', 'svf', ...CSV_FIELDS].join(',')];
  for (const x of solutionTurbines(id)) {
    lines.push([s.id, s.svf, ...CSV_FIELDS.map((f) => x[f])].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** GeoJSON: turbine points + indicative connection lines; solution objectives in "solution". */
export function solutionGeojson(id, note) {
  const s = getSolution(id);
  const list = solutionTurbines(id);
  const features = list.map((x) => ({
    type: 'Feature',
    properties: { kind: 'turbine', ...Object.fromEntries(CSV_FIELDS.map((f) => [f, x[f]])) },
    geometry: { type: 'Point', coordinates: [x.lon, x.lat] },
  }));
  list.forEach((x) =>
    features.push({
      type: 'Feature',
      properties: {
        kind: 'connection_indicative', site_id: x.site_id, tower_m: x.tower_m,
        nearest_access_id: x.nearest_access_id, length_km: x.connection.length_km_file,
        note: 'indicative straight line, not a cable or road design',
      },
      geometry: { type: 'LineString', coordinates: x.connection.coordinates },
    })
  );
  return {
    type: 'FeatureCollection',
    solution: { id: s.id, svf: s.svf, svf_rank: s.svf_rank, is_best_svf: s.is_best_svf, ...s.objectives },
    note: note || '',
    features,
  };
}

/** Browser download of a text file (client side only). */
export function downloadText(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
