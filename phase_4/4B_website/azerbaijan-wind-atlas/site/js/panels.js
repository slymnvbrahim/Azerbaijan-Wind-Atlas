// Solutions panel: scatter plot, presets, objectives, sortable turbine table, downloads.
// Selecting a solution only sets state.solutionId; turbines.js redraws markers and lines.
import * as state from './state.js';
import { t, fmt } from './i18n.js';
import * as S from './solutions.js';
import { drawPlot, accessColor } from './plot.js';

const DATA = 'data/';
const $ = (id) => document.getElementById(id);
const COL_KEYS = {
  site: 'col.site', tower: 'col.tower', wind: 'col.wind', aep: 'col.aep',
  cf: 'col.cf', access: 'col.access', dist: 'col.dist', cost: 'col.cost',
};
const COL_FMT = { site: null, tower: [0], wind: [2], aep: [0], cf: [1], access: [2], dist: [1], cost: [2] };

let wind = null; // wind_meta (texts: disclaimer, cost note)
let turbinesReady = false;
let plotRange = null;

export function initPanels({ windMeta }) {
  wind = windMeta;
  if (state.get('solutionId') == null) state.set('solutionId', S.bestSolution().id);
  if (!state.get('tableSort')) state.set('tableSort', { key: 'site', dir: 1 });

  const picks = S.presetPicks();
  document.querySelectorAll('#presets button').forEach((b) => {
    b.addEventListener('click', () => state.set('solutionId', picks[b.dataset.preset]));
  });
  $('dl-csv').addEventListener('click', () => {
    const id = state.get('solutionId');
    S.downloadText(`solution_${id}.csv`, S.solutionCsv(id), 'text/csv;charset=utf-8');
  });
  $('dl-geojson').addEventListener('click', () => {
    const id = state.get('solutionId');
    const note = `${wind.disclaimer_en} ${wind.connection_note} ${wind.cost_note_en}`;
    S.downloadText(`solution_${id}.geojson`, JSON.stringify(S.solutionGeojson(id, note), null, 1), 'application/geo+json');
  });

  state.on('solutionId', () => {
    const key = state.get('turbineKey');
    if (key && turbinesReady) {
      const ids = new Set(S.solutionTurbines(state.get('solutionId')).map(S.turbineKey));
      if (!ids.has(key)) state.set('turbineKey', null); // selected turbine is not in the new solution
    }
    renderAll();
  });
  state.on('lang', renderAll);
  state.on('tableSort', renderTable);
  state.on('turbineKey', markRows);

  S.loadTurbines(DATA + 'turbines.json')
    .then(() => {
      turbinesReady = true;
      $('dl-csv').disabled = false;
      $('dl-geojson').disabled = false;
      renderTable();
    })
    .catch((e) => console.warn('turbines.json not loaded for the table:', e));
  renderAll();
}

function renderAll() {
  renderPlot();
  renderPresets();
  renderObjectives();
  renderTable();
}

// ---------- plot + presets + objectives ----------

function renderPlot() {
  const sols = S.allSolutions();
  const best = S.bestSolution();
  $('sol-title').textContent = t('solutions.title', { n: sols.length });
  plotRange = drawPlot($('sol-plot'), sols, {
    selectedId: state.get('solutionId'),
    bestId: best.id,
    onSelect: (id) => state.set('solutionId', id),
  });
  const lg = $('sol-plot-legend');
  lg.textContent = '';
  const lab = document.createElement('span');
  lab.textContent = t('plot.access');
  const bar = document.createElement('span');
  bar.className = 'cbar';
  bar.style.background = `linear-gradient(to right, ${accessColor(0)}, ${accessColor(1)})`;
  const lo = document.createElement('span');
  lo.textContent = fmt(plotRange.aMin, 2);
  const hi = document.createElement('span');
  hi.textContent = fmt(plotRange.aMax, 2);
  lg.append(lab, lo, bar, hi);
  const bm = document.createElement('span');
  bm.className = 'best-key';
  bm.textContent = '◇ ' + t('plot.best');
  lg.appendChild(bm);
}

function renderPresets() {
  const picks = S.presetPicks();
  const cur = state.get('solutionId');
  document.querySelectorAll('#presets button').forEach((b) => {
    b.setAttribute('aria-pressed', String(picks[b.dataset.preset] === cur));
  });
}

function renderObjectives() {
  const s = S.getSolution(state.get('solutionId'));
  const ob = s.objectives;
  const box = $('sol-objectives');
  box.textContent = '';
  const h = document.createElement('p');
  h.className = 'sol-current';
  h.textContent = t('solutions.current', { id: s.id }) + (s.is_best_svf ? ' ' + t('solutions.isBest') : '');
  box.appendChild(h);
  const dl = document.createElement('dl');
  dl.className = 'kv';
  const row = (k, v) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  };
  row(t('obj.aep'), `${fmt(ob.aep_gwh, 2)} GWh/${state.get('lang') === 'az' ? 'il' : 'yr'}`);
  row(t('obj.access'), fmt(ob.mean_access, 2));
  row(t('obj.cost'), fmt(ob.cost_units, 2));
  row(t('obj.svf'), `${fmt(s.svf, 3)} (#${s.svf_rank})`);
  box.appendChild(dl);
  const note = document.createElement('p');
  note.className = 'small';
  note.textContent = wind['cost_note_' + state.get('lang')] || wind.cost_note_en;
  box.appendChild(note);
}

// ---------- sortable table ----------

function renderTable() {
  const table = $('sol-table');
  table.textContent = '';
  const sort = state.get('tableSort');
  const head = document.createElement('tr');
  Object.keys(COL_KEYS).forEach((k) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.setAttribute('aria-sort', sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sortbtn';
    b.textContent = t(COL_KEYS[k]) + (sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    b.title = t('table.sort', { col: t(COL_KEYS[k]) });
    b.addEventListener('click', () => {
      const cur = state.get('tableSort');
      state.set('tableSort', { key: k, dir: cur.key === k ? -cur.dir : 1 });
    });
    th.appendChild(b);
    head.appendChild(th);
  });
  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  if (!turbinesReady) return;
  const rows = S.sortTurbines(S.solutionTurbines(state.get('solutionId')), sort.key, sort.dir);
  rows.forEach((tw) => {
    const tr = document.createElement('tr');
    tr.dataset.key = S.turbineKey(tw);
    S.COLUMNS.forEach((col) => {
      const td = document.createElement('td');
      const v = col.value(tw);
      if (col.key === 'site') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sortbtn';
        b.textContent = v;
        b.addEventListener('click', () => state.set('turbineKey', S.turbineKey(tw)));
        td.appendChild(b);
      } else {
        td.textContent = fmt(v, COL_FMT[col.key][0]);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  markRows();
}

function markRows() {
  const key = state.get('turbineKey');
  document.querySelectorAll('#sol-table tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.key === key));
}
