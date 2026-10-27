# Azerbaijan Wind Atlas - student project

A small web atlas for Azerbaijan in the style of the Global Wind Atlas, plus a planning study for one region near Baku, Sumgait and Gobustan (2,108 km2): an optimizer (NSGA-II) chooses **10 wind turbines** (site and tower height of 50, 100 or 150 m) and the website shows the result.

**Live site:** [https://slymnvbrahim.github.io/azerbaijan-wind-atlas/](https://slymnvbrahim.github.io/azerbaijan-wind-atlas/)

> Preliminary planning only, **not an investment basis**. Wind speeds come from the Global Wind Atlas and are not validated for Azerbaijan here. Capacity factors are gross (no wake, availability or electrical losses). Not affiliated with DTU, the World Bank, Esri or OpenStreetMap.

## What the website shows
- Mean wind speed for all Azerbaijan at 50, 100 and 150 m, with opacity slider, legend and click readout
- The study region, 10 turbines of the best compromise (ring colour = tower height) and a "why here" text for each (Azerbaijani / English)
- Access points (substations and road junctions) and indicative connection lines
- The 91 Pareto solutions: scatter plot, presets, sortable table, download as CSV or GeoJSON
- "Scenarios" section is visible but switched off (planned)

## Repository structure
| Folder | Content |
|---|---|
| `site/` | The website (HTML, CSS, JavaScript, data). Published with GitHub Pages. |
| `phase_1/` | Power curve model learned from real turbine data (Kelmarsh 2) |
| `phase_2/` | 251 candidate sites and 7 access points (Global Wind Atlas + OpenStreetMap) |
| `phase_3/` | Optimizer: NSGA-II and a genetic algorithm for comparison, results, explanation PDF |
| `phase_4/` | 4A data builder notebook (makes the website data), 4B screenshots |
| `reports/` | Work plan, progress report, software design notes |

Each phase folder has its own `README`. Each phase reads the files of the earlier phase:
`power_curve_table.csv` (phase 1) -> `candidate_sites.csv` and `accessibility_points.csv` (phase 2) -> Pareto files (phase 3) -> `site/data` (phase 4).

## Run the website on your computer
```
cd site
python -m http.server 8000
```
Open http://localhost:8000 (do not open index.html as a file; the browser blocks the data files).

## Main results
- 91 Pareto solutions. Best compromise: 104.5 GWh per year, mean access score 0.64, cost 11.48 model units (five 50 m and five 100 m towers).
- Hypervolume (10 runs, higher is better): genetic algorithm with one weight set 0.679; NSGA-II with 150 generations 0.950; genetic algorithm with 10 weight sets 0.973; NSGA-II with 10 times more generations 0.999.

## Known limits
- Cost model and access scale are assumptions, not market data.
- The turbines are chosen independently (no shared roads or cables in the cost), so the layout is scattered, not a compact wind farm.
- One turbine model (from a UK site); a 92 m rotor on a 50 m tower leaves about 4 m ground clearance.
- No exclusion zones (towns, protected areas, slopes). Rayleigh wind distribution instead of Weibull.
- Open check: the cut-out wind speed (25 m/s is assumed).

## Data and licences
See `DATA_LICENSES.md`. The wind data are from the Global Wind Atlas (DTU / World Bank ESMAP). Code is MIT licensed (`LICENSE`).

