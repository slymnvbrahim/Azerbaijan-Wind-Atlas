// Tiny shared state + event bus.
// Every state key change emits an event with the same name, so modules stay decoupled.
// Later phases can add their own events here (e.g. a "network" event) without touching the rest.

const state = {
  lang: 'az',
  height: 100,
  opacity: 0.75,
  basemap: 'esri',
  showWind: true,
  showOutline: true,
  showRegion: true,
  showSites: false,
  solutionId: null, // selected Pareto solution (set to the best-SVF one when data is loaded)
  turbineKey: null, // selected turbine "<site_id>_<tower_m>"
  tableSort: { key: 'site', dir: 1 },
};

const subs = new Map();

export function get(key) {
  return state[key];
}

export function set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  emit(key, value);
}

export function on(name, fn) {
  if (!subs.has(name)) subs.set(name, new Set());
  subs.get(name).add(fn);
  return () => subs.get(name).delete(fn);
}

export function emit(name, payload) {
  const set_ = subs.get(name);
  if (set_) set_.forEach((fn) => fn(payload));
}

// ---- network hook for a later phase (scenario simulator) ----
// setNetwork(features) takes GeoJSON line features; turbines.js then draws them instead of the
// indicative straight connection lines. Pass null to go back. No scenario logic in this phase.
let network = null;

export function setNetwork(features) {
  network = features;
  emit('network', features);
}

export function getNetwork() {
  return network;
}
