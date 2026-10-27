# Azerbaijan Wind Atlas (student project)

A small web atlas for Azerbaijan: mean wind speed (50 / 100 / 150 m) and, for the study region, turbines chosen by an NSGA-II optimiser.
Static files only (plain HTML / CSS / JavaScript ES modules + Leaflet), no build step, no backend.

> Student project. **Not affiliated with the Global Wind Atlas, DTU or the World Bank.** The look is only inspired by the GWA; code and design are original.
> Preliminary planning only, not an investment basis.

## Status

**Part 1 (this version):** layout, basemaps, wind layers + opacity + height selector, legend, scale bar, lat:lon readout, click readout, study region with zoom behaviour, candidate-site toggle, AZ/EN i18n.
**Part 2 (next):** turbines, access points, connection lines, solutions panel with plot / presets / table, details panel, CSV / GeoJSON downloads, disabled scenario section, full About / Methods text.

## Data caveat (read this)

The wind layer in `site/data` is currently a **test layer**: the source rasters (`wind_meta.json` -> `source_rasters`) cover only the study region
(about 49.02-49.79 E, 40.17-40.77 N), not all of Azerbaijan. Only ~4.4 % of the 1 km cells inside the country outline have a value; the map is empty elsewhere.
The site computes this at load time from the grid and shows a warning banner automatically. When you replace the data with full-country rasters, the warning disappears by itself.

All bounds, sizes, ramp and grid parameters are read from `site/data/wind_meta.json`; nothing about them is hard-coded, so you can replace the `site/data` folder without changing code.

## Folder layout

```
site/index.html          page
site/css/style.css       styles
site/js/app.js           bootstrap, click readout
site/js/state.js         tiny state + event bus (later phases add events here)
site/js/i18n.js          AZ / EN strings, number formatting
site/js/grid.js          grid fetch / cache / decode, point-in-polygon, coverage (pure functions)
site/js/layers.js        Leaflet map, basemaps, wind overlay, region, candidate sites
site/js/solutions.js     solutions data access (extended in Part 2)
site/js/ui.js            panels, controls, legend, banner, footer, cards, modal
site/data/               files from phase 4A (unchanged)
tests/                   Node tests + headless-browser smoke test
.github/workflows/pages.yml   optional GitHub Pages deployment
```

Leaflet is loaded from a CDN and **pinned to the exact version 1.9.4** (unpkg, with SRI hashes in `index.html`).

## Test locally

```bash
cd site
python -m http.server 8000
# open http://localhost:8000
```

Do not open `index.html` as a file (`file://`): the browser blocks `fetch` for the data files.

Tests (optional):

```bash
node --no-warnings tests/test_grid.mjs     # grid decode vs candidate_sites, data consistency
node --no-warnings tests/test_i18n.mjs     # AZ/EN key completeness, number format
# browser smoke test: pip install playwright; needs a Chromium and a local copy of leaflet@1.9.4
python3 tests/smoke.py <path-to-leaflet-package> <screenshot-dir>
```

## Publish on GitHub Pages

1. Create a **public** repository on github.com (e.g. `azerbaijan-wind-atlas`), without README.
2. In this folder:
   ```bash
   git init
   git add .
   git commit -m "Azerbaijan Wind Atlas, part 1"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. Repository **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**. The included workflow publishes the `site/` folder; the URL appears in the Actions run (`https://<user>.github.io/<repo>/`).
   *Alternative without Actions:* rename `site/` to `docs/` and choose "Deploy from a branch -> main -> /docs" (Pages only offers `/` or `/docs`, not `/site`).
4. Replace the placeholder GitHub link in `site/index.html` (`YOUR-USER/YOUR-REPO`).

## Check before publishing

- **Global Wind Atlas data terms and attribution:** the licence of the GWA data is not asserted in this project. Read the GWA terms of use and keep the attribution (shown in the footer and in Data and methods).
- **Map tile terms:** Esri World Imagery and OpenStreetMap standard tiles have their own usage terms (OSM's tile usage policy does not allow heavy use; Esri imagery has attribution and usage conditions). Check both before making the site public. The "plain light" basemap uses no tiles.
- **Country outline:** `azerbaijan_outline.geojson` is a simplified Natural Earth outline. Check that it shows the borders you want to show (including the Nakhchivan exclave and the disputed areas) before publishing.
- **Data validity:** wind speeds are not validated for Azerbaijan here; capacity factors are gross. Keep the banner.
