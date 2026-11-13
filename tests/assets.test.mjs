/* Cache busting: index.html must reference every local asset with its current content hash. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, computeStamps, stampHtml, importMap } from '../scripts/stamp-assets.mjs';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

test('index.html carries the current content hash of the stylesheet and of every module', () => {
  const stamps = computeStamps();
  assert.equal(stampHtml(html, stamps), html, 'asset versions in index.html are stale — run `npm run stamp` (npm test does it automatically)');
  assert.ok(html.includes(`href="css/app.css?v=${stamps.css}"`));
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort();
  assert.deepEqual(Object.keys(map), files.map(f => `./js/${f}`), 'every module is in the import map');
  files.forEach(f => assert.equal(map[`./js/${f}`], `./js/${f}?v=${stamps.js[f]}`));
  assert.ok(files.includes('app.js') && files.includes('i18n.js') && files.length >= 11);
});

test('the import map comes before the module script, and a changed file changes only its own URL', () => {
  assert.ok(html.indexOf('<script type="importmap">') > 0 && html.indexOf('<script type="importmap">') < html.indexOf('<script type="module">'));
  assert.ok(/import \{ boot \} from '\.\/js\/app\.js';/.test(html), 'the entry import uses the mapped specifier');
  const a = computeStamps(), b = {css: a.css, js: {...a.js, 'calc.js': '0000000000'}};
  const ma = importMap(a).split('\n'), mb = importMap(b).split('\n');
  assert.equal(ma.filter((l, i) => l !== mb[i]).length, 1);
  assert.match(a.css, /^[0-9a-f]{10}$/);
});
