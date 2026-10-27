// Click-query grid: fetch, cache, decode. Pure functions, no DOM, no Leaflet.
// All parameters come from wind_meta.json ("grid" block). Nothing is hard-coded here.
//
//   value_ms = q / scale + offset ; q == nodata means no data
//   col = floor((lon - west) / dlon) ; row = floor((north - lat) / dlat)
//   byte index = row * ncols + col   (row-major, rows north to south)

const cache = new Map(); // url -> Promise<Uint8Array>

export function loadGrid(url) {
  if (!cache.has(url)) {
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.arrayBuffer();
      })
      .then((buf) => new Uint8Array(buf));
    p.catch(() => cache.delete(url)); // do not cache failures
    cache.set(url, p);
  }
  return cache.get(url);
}

/** Byte index of the cell containing (lon, lat), or -1 when outside the grid extent. */
export function cellIndex(g, lon, lat) {
  const col = Math.floor((lon - g.west) / g.dlon);
  const row = Math.floor((g.north - lat) / g.dlat);
  if (!(col >= 0 && col < g.ncols && row >= 0 && row < g.nrows)) return -1;
  return row * g.ncols + col;
}

/**
 * Decode the grid at a point.
 * @returns {{status:'ok', value:number} | {status:'nodata'} | {status:'out'}}
 *   'out'    = point is outside the grid extent
 *   'nodata' = cell exists but holds the nodata value
 */
export function decodeAt(bytes, g, lon, lat) {
  const idx = cellIndex(g, lon, lat);
  if (idx < 0 || idx >= bytes.length) return { status: 'out' };
  const q = bytes[idx];
  if (q === g.nodata) return { status: 'nodata' };
  return { status: 'ok', value: q / g.scale + g.offset };
}

// ---------- geometry helpers (even-odd rule) ----------

function polygonsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  throw new Error('Unsupported geometry type: ' + geom.type);
}

/** Point-in-polygon for Polygon / MultiPolygon (all rings, even-odd). */
export function pointInGeometry(geom, lon, lat) {
  let inside = false;
  for (const poly of polygonsOf(geom)) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
  }
  return inside;
}

/** Union geometry from a FeatureCollection (all features must be polygonal). */
export function geometryOf(featureCollection) {
  const coords = [];
  for (const f of featureCollection.features) coords.push(...polygonsOf(f.geometry));
  return { type: 'MultiPolygon', coordinates: coords };
}

/**
 * How much of the area inside `geom` has data in this grid?
 * Scanline fill over cell centres (same rule the grid was built with:
 * a cell belongs to the country if its centre is inside the outline).
 * @returns {{insideCells:number, validCells:number, share:number}}
 */
export function coverage(bytes, g, geom) {
  const rings = [];
  for (const poly of polygonsOf(geom)) for (const ring of poly) rings.push(ring);
  let insideCells = 0;
  let validCells = 0;
  for (let r = 0; r < g.nrows; r++) {
    const lat = g.north - (r + 0.5) * g.dlat;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.west) / g.dlon - 0.5));
      const c1 = Math.min(g.ncols - 1, Math.ceil((xs[k + 1] - g.west) / g.dlon - 0.5) - 1);
      for (let c = c0; c <= c1; c++) {
        insideCells++;
        if (bytes[r * g.ncols + c] !== g.nodata) validCells++;
      }
    }
  }
  return { insideCells, validCells, share: insideCells ? validCells / insideCells : 0 };
}
