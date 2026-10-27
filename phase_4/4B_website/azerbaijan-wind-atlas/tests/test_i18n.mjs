// i18n completeness: AZ and EN have the same keys, and every key used in HTML/JS exists.
// Run: node --no-warnings tests/test_i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DICT } from '../site/js/i18n.js';

const root = new URL('../site/', import.meta.url);
const az = Object.keys(DICT.az), en = Object.keys(DICT.en);
const onlyAz = az.filter((k) => !(k in DICT.en));
const onlyEn = en.filter((k) => !(k in DICT.az));
assert.deepEqual(onlyAz, [], 'keys only in AZ: ' + onlyAz);
assert.deepEqual(onlyEn, [], 'keys only in EN: ' + onlyEn);
assert.ok(az.every((k) => DICT.az[k].trim() && DICT.en[k].trim()), 'empty text');

// placeholders must match between languages
for (const k of az) {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  assert.equal(ph(DICT.az[k]), ph(DICT.en[k]), 'placeholder mismatch: ' + k);
}

const used = new Set();
const html = readFileSync(new URL('index.html', root), 'utf8');
for (const m of html.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)) used.add(m[1]);
for (const f of readdirSync(new URL('js/', root))) {
  const src = readFileSync(new URL('js/' + f, root), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) used.add(m[1]);
  for (const m of src.matchAll(/dataset\.i18n(?:Aria|Title)?\s*=\s*['"]([\w.]+)['"]/g)) used.add(m[1]);
}
const missing = [...used].filter((k) => !(k in DICT.az));
assert.deepEqual(missing, [], 'used but undefined: ' + missing);
const unused = az.filter((k) => !used.has(k));
console.log(`keys: ${az.length} per language, used in code/HTML: ${used.size}, unused: ${unused.length ? unused.join(', ') : 'none'}`);
console.log('OK: i18n complete');

// number formatting
import * as state from '../site/js/state.js';
import { fmt, t } from '../site/js/i18n.js';
state.set('lang', 'az');
assert.equal(fmt(9.05, 2), '9,05');
assert.equal(fmt(1234.5, 1), '1.234,5');
assert.equal(fmt(10, 0), '10');
assert.equal(t('banner.coverage', { share: '4,4', w: '1', e: '2', s: '3', north: '4' }).includes('{'), false, 'all placeholders filled');
state.set('lang', 'en');
assert.equal(fmt(9.05, 2), '9.05');
assert.equal(fmt(1234.5, 1), '1,234.5');
console.log('OK: number formatting (AZ comma decimal, EN point)');
