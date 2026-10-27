// Scatter plot of the Pareto solutions (plain SVG, no chart library).
// x = relative cost, y = annual energy (GWh), colour = mean access score.
import { t, fmt } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 250;
const M = { l: 48, r: 10, t: 10, b: 40 };
const LOW = [207, 227, 246];
const HIGH = [11, 42, 99];

/** Sequential colour for a normalised value 0..1 (light = low access, dark = high access). */
export function accessColor(f) {
  const c = LOW.map((a, i) => Math.round(a + (HIGH[i] - a) * Math.max(0, Math.min(1, f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function niceTicks(min, max, n = 5) {
  const raw = (max - min || 1) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * @param {HTMLElement} box container
 * @param {object[]} sols solutions (objectives.cost_units / aep_gwh / mean_access)
 * @param {{selectedId:number, bestId:number, onSelect:(id:number)=>void}} o
 */
export function drawPlot(box, sols, o) {
  box.textContent = '';
  const xs = sols.map((s) => s.objectives.cost_units);
  const ys = sols.map((s) => s.objectives.aep_gwh);
  const as = sols.map((s) => s.objectives.mean_access);
  const xt = niceTicks(Math.min(...xs), Math.max(...xs));
  const yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const [x0, x1] = [xt[0], xt[xt.length - 1]];
  const [y0, y1] = [yt[0], yt[yt.length - 1]];
  const aMin = Math.min(...as);
  const aMax = Math.max(...as);
  const X = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const Y = (v) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scatter', role: 'group', 'aria-label': t('plot.aria') }, box);
  xt.forEach((v) => {
    el('line', { x1: X(v), x2: X(v), y1: M.t, y2: H - M.b, class: 'grid' }, svg);
    el('text', { x: X(v), y: H - M.b + 14, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = fmt(v, v % 1 ? 1 : 0);
  });
  yt.forEach((v) => {
    el('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: 'grid' }, svg);
    el('text', { x: M.l - 5, y: Y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, svg).textContent = fmt(v, v % 1 ? 1 : 0);
  });
  el('text', { x: (M.l + W - M.r) / 2, y: H - 5, class: 'axis', 'text-anchor': 'middle' }, svg).textContent = t('plot.x');
  const yl = el('text', { x: 12, y: (M.t + H - M.b) / 2, class: 'axis', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(M.t + H - M.b) / 2})` }, svg);
  yl.textContent = t('plot.y');

  // draw order: ordinary dots first, then the best-SVF and the selected one on top
  const order = [...sols].sort((a, b) => (a.id === o.selectedId) - (b.id === o.selectedId) || (a.id === o.bestId) - (b.id === o.bestId));
  const byCost = [...sols].sort((a, b) => a.objectives.cost_units - b.objectives.cost_units).map((s) => s.id);
  const dots = new Map();
  order.forEach((s) => {
    const ob = s.objectives;
    const c = el('circle', {
      cx: X(ob.cost_units), cy: Y(ob.aep_gwh), r: s.id === o.selectedId ? 6 : 4.5,
      fill: accessColor((ob.mean_access - aMin) / (aMax - aMin || 1)),
      class: 'dot' + (s.id === o.selectedId ? ' sel' : ''),
      tabindex: s.id === o.selectedId ? 0 : -1, role: 'button',
      'aria-pressed': String(s.id === o.selectedId),
      'aria-label': t('plot.point', { id: s.id, aep: fmt(ob.aep_gwh, 1), cost: fmt(ob.cost_units, 2), acc: fmt(ob.mean_access, 2) }),
    }, svg);
    el('title', {}, c).textContent = c.getAttribute('aria-label') + (s.id === o.bestId ? ' (' + t('plot.best') + ')' : '');
    c.addEventListener('click', () => o.onSelect(s.id));
    c.dataset.id = s.id;
    dots.set(s.id, c);
    if (s.id === o.bestId) {
      // diamond ring marks the best-SVF solution
      const x = X(ob.cost_units), y = Y(ob.aep_gwh), r = 9;
      el('path', { d: `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`, class: 'best-mark', 'pointer-events': 'none' }, svg);
    }
  });
  // roving tabindex: arrows move focus along the cost axis, Enter / Space select
  svg.addEventListener('keydown', (e) => {
    const id = Number(e.target.dataset && e.target.dataset.id);
    if (!dots.has(id)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      o.onSelect(id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = byCost.indexOf(id) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = dots.get(byCost[Math.max(0, Math.min(byCost.length - 1, i))]);
      next.tabIndex = 0;
      e.target.tabIndex = -1;
      next.focus();
    }
  });
  return { aMin, aMax };
}
