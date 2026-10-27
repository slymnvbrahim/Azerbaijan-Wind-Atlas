// Inline SVG icons (no image files): turbines, candidate-site markers, access points. Pure functions.

/** Ring colours by tower height rank (light -> dark), distinct from the wind colour ramp. */
export const TOWER_COLORS = ['#d9c8ff', '#8a5cf0', '#3a1a90'];

export function towerColor(heights, h) {
  const sorted = [...heights].sort((a, b) => a - b);
  const i = Math.max(0, sorted.indexOf(h));
  return TOWER_COLORS[Math.min(i, TOWER_COLORS.length - 1)];
}

function bladePath(cx, cy, len) {
  return [0, 120, 240]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      return `M${cx} ${cy}L${(cx + len * Math.sin(a)).toFixed(2)} ${(cy - len * Math.cos(a)).toFixed(2)}`;
    })
    .join('');
}

/** Wind turbine in a coloured ring, white halo for contrast on satellite imagery. */
export function turbineSvg({ size = 32, ring = '#8a5cf0' }) {
  const b = bladePath(16, 14, 9);
  return (
    `<svg class="tb" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    `<circle cx="16" cy="16" r="14" fill="rgba(255,255,255,.72)" stroke="#fff" stroke-width="6"/>` +
    `<circle cx="16" cy="16" r="14" fill="none" stroke="#1b1f27" stroke-width="4.4"/>` +
    `<circle cx="16" cy="16" r="14" fill="none" stroke="${ring}" stroke-width="3"/>` +
    `<path d="M16 14V26" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>` +
    `<path d="M16 14V26" stroke="#1b1f27" stroke-width="1.8" stroke-linecap="round"/>` +
    `<g class="rotor"><path d="${b}" stroke="#fff" stroke-width="4.6" stroke-linecap="round" fill="none"/>` +
    `<path d="${b}" stroke="#1b1f27" stroke-width="2" stroke-linecap="round" fill="none"/>` +
    `<circle cx="16" cy="14" r="2" fill="#1b1f27" stroke="#fff" stroke-width="1"/></g></svg>`
  );
}

/** Small grey turbine on a disc coloured by wind speed (candidate sites), not animated. */
export function siteIconHtml(size, fill) {
  const b = bladePath(8, 6.5, 4.6);
  return (
    `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    `<circle cx="8" cy="8" r="7.3" fill="${fill}" stroke="#fff" stroke-width="1.2"/>` +
    `<path d="M8 6.5V13" stroke="#4a4f57" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="${b}" stroke="#4a4f57" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>`
  );
}

/** Substation = dark blue square with a bolt, road junction = brown disc with a cross. */
export function accessIconHtml(type) {
  const body =
    type === 'substation'
      ? `<rect x="2" y="2" width="20" height="20" rx="3" fill="#1d4ed8" stroke="#fff" stroke-width="2"/>` +
        `<path d="M13 4.5L7.5 13h4l-1 6.5L16.5 11h-4z" fill="#fff"/>`
      : `<circle cx="12" cy="12" r="10" fill="#8a5a2b" stroke="#fff" stroke-width="2"/>` +
        `<path d="M12 6v12M6 12h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${body}</svg>`;
}
