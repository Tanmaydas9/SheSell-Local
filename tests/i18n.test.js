/* Every English string has a Marathi twin with the same {placeholders}, every key the pages use
   exists, and every error the server can send to a person has a translation. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const load = (file, name) => new Function(read(file) + `\nreturn ${name};`)();
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const dir = (d) => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.js')).map(f => read(d, f)).join('\n');
const keysIn = (js) => [...js.matchAll(/\bt\('([a-zA-Z0-9_]+)'/g)].map(m => m[1]).filter(k => !/_$/.test(k) && k !== 'pkg');
const htmlKeys = (html) => [...html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)].map(m => m[1]);

function parity(dict) {
  const en = Object.keys(dict.en), mr = Object.keys(dict.mr);
  assert.deepEqual(en.filter(k => !(k in dict.mr)), [], 'missing in Marathi');
  assert.deepEqual(mr.filter(k => !(k in dict.en)), [], 'missing in English');
  assert.deepEqual(en.filter(k => ph(dict.en[k]) !== ph(dict.mr[k])), [], 'placeholder mismatch');
  assert.deepEqual(en.filter(k => !String(dict.mr[k]).trim()), [], 'empty Marathi string');
}
const LEADS = ['fresh_today', 'small_batch', 'harvest_same_day', 'made_to_order', 'custom_fit', 'ready_stock', 'preorder'];

test('storefront and seller-workspace strings (one shared dictionary)', () => {
  const I18N = load('src/app/js/00-i18n.js', 'I18N');
  parity(I18N);
  const html = ['src/app/body.html', 'src/app/ml-how.html', 'src/workspace/ws.html'].map(f => read(f)).join('\n');
  const used = new Set([...htmlKeys(html), ...keysIn(dir('src/app/js')), ...keysIn(dir('src/workspace/js'))]);
  assert.deepEqual([...used].filter(k => !(k in I18N.en)), [], 'keys used but not defined');
  assert.deepEqual(LEADS.filter(k => !I18N.en['lead_' + k]), [], 'availability presets');
});

test('console strings', () => {
  const CI18N = load('src/console/c00-i18n.js', 'CI18N');
  parity(CI18N);
  const used = new Set(keysIn(['c01-core.js', 'c02-views.js', 'c99-init.js'].map(f => read('src/console', f)).join('\n')));
  assert.deepEqual([...used].filter(k => !(k in CI18N.en)), [], 'keys used but not defined');
  assert.deepEqual(LEADS.filter(k => !CI18N.en['lead_' + k]), [], 'availability presets');
});

test('every error the server can show a person is translated in the console', () => {
  const CI18N = load('src/console/c00-i18n.js', 'CI18N');
  const server = ['services.js', 'api.js', 'auth.js'].map(f => read('server', f)).join('\n');
  const codes = new Set([...server.matchAll(/fail\(\d+, '([a-z_]+)'/g)].map(m => m[1]));
  // validators build invalid_<field> codes from these field names
  [...server.matchAll(/field: '([a-z ]+)'/g), ...server.matchAll(/int\([^;]*?, '([a-z ]+)'\)/g)].forEach(m => codes.add('invalid_' + m[1].replace(/\s+/g, '_')));
  codes.add('rate_limited');
  const internal = new Set(['invalid_', 'invalid_event', 'method_not_allowed', 'invalid_quantity', 'unavailable', 'out_of_stock', 'empty_order', 'too_many_items', 'place_required', 'cancelled']); // programming errors, and shop-only codes translated in the storefront
  const missing = [...codes].filter(c => !internal.has(c) && !(('err_' + c) in CI18N.en));
  assert.deepEqual(missing, [], 'add err_<code> to src/console/c00-i18n.js');
  const I18N = load('src/app/js/00-i18n.js', 'I18N');
  assert.deepEqual(['bad_phone', 'invalid_name', 'place_required', 'empty_order', 'unavailable', 'out_of_stock', 'store_closed', 'rate_limited'].filter(c => !I18N.en['err_' + c]), [], 'checkout errors in the shop');
});
