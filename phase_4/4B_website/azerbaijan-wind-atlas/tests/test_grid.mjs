// Node tests for the grid decode and data checks, run against the REAL files in site/data.
// Run: node --no-warnings tests/test_grid.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { decodeAt, cellIndex, pointInGeometry, geometryOf, coverage } from '../site/js/grid.js';

const D = new URL('../site/data/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, D), 'utf8'));
const meta = json('wind_meta.json');
const g = meta.grid;
const bin = (h) => new Uint8Array(readFileSync(new URL(meta.layers[String(h)].grid, D)));
const grids = Object.fromEntries(meta.heights_m.map((h) => [h, bin(h)]));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

// --- file sizes match the grid description
for (const h of meta.heights_m) ok(grids[h].length === g.ncols * g.nrows, `grid ${h} size`);

// --- decode formula on hand-picked cells (independent re-implementation of the contract)
{
  const h = 100;
  const bytes = grids[h];
  let n = 0;
  for (let i = 0; i < bytes.length && n < 200; i += 997) {
    const row = Math.floor(i / g.ncols), col = i % g.ncols;
    const lon = g.west + (col + 0.5) * g.dlon;
    const lat = g.north - (row + 0.5) * g.dlat;
    const r = decodeAt(bytes, g, lon, lat);
    if (bytes[i] === g.nodata) assert.equal(r.status, 'nodata');
    else assert.equal(r.value, bytes[i] / g.scale + g.offset);
    n++; checks++;
  }
}

// --- edges: first/last cell, outside the extent
ok(cellIndex(g, g.west + 1e-9, g.north - 1e-9) === 0, 'top-left cell index 0');
ok(cellIndex(g, g.west + g.ncols * g.dlon - 1e-6, g.north - g.nrows * g.dlat + 1e-6) === g.ncols * g.nrows - 1, 'bottom-right cell');
ok(decodeAt(grids[100], g, g.west - 0.5, g.north - 1).status === 'out', 'west of grid');
ok(decodeAt(grids[100], g, g.west + 1, g.north + 0.5).status === 'out', 'north of grid');
ok(decodeAt(grids[100], g, g.west + 1, g.north - g.nrows * g.dlat - 0.5).status === 'out', 'south of grid');

// --- compare with candidate_sites.geojson (grid averages over ~1 km, so not identical)
const sites = json('candidate_sites.geojson').features;
console.log('candidate sites:', sites.length);
for (const h of meta.heights_m) {
  const diffs = [];
  let nodata = 0;
  for (const f of sites) {
    const [lon, lat] = f.geometry.coordinates;
    const r = decodeAt(grids[h], g, lon, lat);
    if (r.status !== 'ok') { nodata++; continue; }
    diffs.push(Math.abs(r.value - f.properties['ws' + h]));
  }
  diffs.sort((a, b) => a - b);
  const med = diffs[Math.floor(diffs.length / 2)];
  const max = diffs[diffs.length - 1];
  console.log(`  ${h} m: compared ${diffs.length}, nodata ${nodata}, median |diff| ${med.toFixed(3)} m/s, max |diff| ${max.toFixed(3)} m/s`);
  ok(diffs.length > 0, 'something compared');
}

// --- outline PIP and coverage
const outline = json('azerbaijan_outline.geojson');
const geom = geometryOf(outline);
ok(pointInGeometry(geom, 49.8671, 40.4093), 'Baku inside');
ok(pointInGeometry(geom, 46.36, 40.68), 'Ganja inside');
ok(pointInGeometry(geom, 45.41, 39.21), 'Nakhchivan inside (exclave)');
ok(!pointInGeometry(geom, 0, 0), '(0,0) outside');
ok(!pointInGeometry(geom, 51.5, 40.4), 'Caspian Sea outside');
for (const h of meta.heights_m) {
  const c = coverage(grids[h], g, geom);
  console.log(`  coverage ${h} m: ${c.validCells} valid / ${c.insideCells} inside cells = ${(c.share * 100).toFixed(2)}%`);
  ok(c.insideCells > 0 && c.share > 0 && c.share < 1, 'coverage sane');
}
// every valid cell should be inside the outline (the grid was masked with it)
{
  let outside = 0, valid = 0;
  const b = grids[100];
  for (let r = 0; r < g.nrows; r++) for (let c = 0; c < g.ncols; c++) {
    if (b[r * g.ncols + c] === g.nodata) continue;
    valid++;
    if (!pointInGeometry(geom, g.west + (c + 0.5) * g.dlon, g.north - (r + 0.5) * g.dlat)) outside++;
  }
  console.log(`  valid cells outside our outline test: ${outside} of ${valid}`);
  ok(outside / valid < 0.01, 'valid cells inside the outline');
}

// --- every turbine of every solution exists in turbines.json; best solution
const sol = json('solutions.json');
const tur = json('turbines.json');
let missing = 0, refs = 0;
for (const s of sol.solutions) for (const x of s.turbines) {
  refs++;
  if (!tur.turbines[`${x.site_id}_${x.tower_m}`]) missing++;
}
console.log(`turbine references: ${refs}, missing in turbines.json: ${missing}, unique turbines: ${Object.keys(tur.turbines).length}`);
ok(missing === 0, 'no missing turbines');
const best = sol.solutions.find((s) => s.id === sol.meta.best_svf_id);
ok(best && best.is_best_svf, 'best_svf_id resolves to an is_best_svf solution');
console.log(`best SVF solution: id ${best.id}, turbines ${best.turbines.length}; solutions ${sol.solutions.length} (meta.n_solutions ${sol.meta.n_solutions})`);
ok(sol.solutions.length === sol.meta.n_solutions, 'n_solutions matches');
ok(sol.solutions.every((s) => s.turbines.every((x) => sol.sites[x.site_id])), 'all sites have coordinates');

console.log(`\nOK: ${checks} checks passed`);
