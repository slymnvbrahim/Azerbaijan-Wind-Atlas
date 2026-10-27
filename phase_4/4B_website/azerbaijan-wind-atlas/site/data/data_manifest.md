# site/data manifest

- `access_points.geojson` (2.5 KB): Grid / road access points (id, type, name, voltage where known)
- `azerbaijan_outline.geojson` (8.7 KB): Azerbaijan outline (Natural Earth admin-0, simplified)
- `candidate_sites.geojson` (54.4 KB): 251 candidate sites with ws50/ws100/ws150, dist_km, nearest_access_id, access_score
- `data_manifest.md` (1.7 KB): This list
- `region_polygon.geojson` (0.3 KB): Study region polygon (about 2108 km2)
- `solutions.json` (53.1 KB): 91 Pareto solutions (objectives, SVF, best-SVF flag, 10 turbines each) + site_id -> lon/lat lookup
- `turbines.json` (118.6 KB): Every (site, tower) pair used in any solution: numbers, comparisons, connection line, why_az / why_en
- `wind_100m.png` (739.9 KB): Mean wind speed at 100 m, EPSG:3857 indexed PNG overlay (transparent outside Azerbaijan)
- `wind_150m.png` (703.1 KB): Mean wind speed at 150 m, EPSG:3857 indexed PNG overlay (transparent outside Azerbaijan)
- `wind_50m.png` (804.0 KB): Mean wind speed at 50 m, EPSG:3857 indexed PNG overlay (transparent outside Azerbaijan)
- `wind_grid_100m.bin` (200.9 KB): Click-query grid at 100 m: raw uint8, ~1 km, decode with wind_meta.json (q/scale, 255 = no data)
- `wind_grid_150m.bin` (200.9 KB): Click-query grid at 150 m: raw uint8, ~1 km, decode with wind_meta.json (q/scale, 255 = no data)
- `wind_grid_50m.bin` (200.9 KB): Click-query grid at 50 m: raw uint8, ~1 km, decode with wind_meta.json (q/scale, 255 = no data)
- `wind_meta.json` (5.2 KB): Metadata: bounds (lon/lat and EPSG:3857), image/grid layout, colour ramp, attribution, disclaimer, notes

Total: 3.17 MB

Attribution: Global Wind Atlas (DTU / World Bank ESMAP); Natural Earth; Esri and OpenStreetMap map tiles.
