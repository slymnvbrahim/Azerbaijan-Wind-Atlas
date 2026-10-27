# Data sources, licences and attribution

This is a student project. The table says where each data source comes from and what we know about its licence.
**Check the current terms yourself before you reuse or publish anything.**

| Data | Where it is used | Licence / terms (as far as we know) | Notes |
|---|---|---|---|
| Global Wind Atlas wind speed maps and GWC file (DTU / World Bank ESMAP) | `phase_2/data_inputs`, `site/data` (images and grids made from the maps) | Creative Commons Attribution 4.0 (CC BY 4.0) according to the World Bank Data Catalog pages for the Global Wind Atlas (GWA 3.0). Our downloaded files are labelled GWA 4 in the file header, so please check the terms for that version on globalwindatlas.info. | Attribution is required. Use the exact attribution text given by the Global Wind Atlas. The site footer shows "Wind data: Global Wind Atlas (DTU / World Bank ESMAP)". |
| Kelmarsh wind farm SCADA data (Cubico), Zenodo v4 | Phase 1 (the raw file is NOT in this repository) | CC BY 4.0 (stated on the Zenodo record https://zenodo.org/records/16807551) | Only the derived power curve table is included. Cite the dataset as the Zenodo page asks. |
| OpenStreetMap (substations and road junctions, through the Overpass API) | `phase_2/outputs/accessibility_points.csv`, `site/data/access_points.geojson` | Open Database Licence (ODbL), (c) OpenStreetMap contributors | Only 7 points are used. They are not checked on the ground. |
| Natural Earth admin-0 country borders | `site/data/azerbaijan_outline.geojson` (simplified) | Public domain (naturalearthdata.com) | Shows Azerbaijan within its internationally recognised borders. |
| Esri World Imagery and OpenStreetMap map tiles | Loaded live by the website; NOT stored here | Terms of the tile providers apply | Attribution is shown in the footer of the site. The site also has a plain light background without tiles. |
| Leaflet 1.9.4 | Loaded from a CDN (unpkg) with an integrity hash | BSD-2-Clause | |
| Our own code (notebooks, scripts, website) | whole repository | MIT, see `LICENSE` | |

The site and this repository are not connected to DTU, the World Bank, Esri or OpenStreetMap.
