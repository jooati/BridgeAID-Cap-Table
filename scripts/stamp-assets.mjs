#!/usr/bin/env node
/* ============================================================================
   stamp-assets.mjs — writes a content hash behind every local asset URL in index.html:
     • css/app.css?v=<hash>
     • an import map that sends every js/*.js module (also the nested imports) to js/x.js?v=<hash>
   GitHub Pages caches files for 10 minutes, so without this a freshly loaded index.html can run
   with a stale stylesheet or stale modules right after a deploy. A changed file gets a new URL,
   an unchanged one keeps its URL (and its cache).
   Runs automatically before `npm test` (pretest); tests/assets.test.mjs fails if the stamps are stale.
   Still no build step: the deployed files are the files in the repository.
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* line endings are normalised so the stamp is the same on Windows (CRLF checkout) and elsewhere */
export function hashOf(file) { return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 10); }
export function computeStamps(root = ROOT) {
  const js = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).sort();
  return {css: hashOf(path.join(root, 'css', 'app.css')), js: Object.fromEntries(js.map(f => [f, hashOf(path.join(root, 'js', f))]))};
}
export function importMap(stamps) {
  const lines = Object.entries(stamps.js).map(([f, h]) => `    "./js/${f}": "./js/${f}?v=${h}"`);
  return `<script type="importmap">\n{\n  "imports": {\n${lines.join(',\n')}\n  }\n}\n</script>`;
}
export function stampHtml(html, stamps) {
  const css = /<link rel="stylesheet" href="css\/app\.css(?:\?v=[0-9a-f]*)?">/, map = /<script type="importmap">[\s\S]*?<\/script>/;
  if (!css.test(html) || !map.test(html)) throw new Error('index.html: the stylesheet link or the import map block is missing');
  return html.replace(css, `<link rel="stylesheet" href="css/app.css?v=${stamps.css}">`).replace(map, importMap(stamps));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = path.join(ROOT, 'index.html'); const raw = fs.readFileSync(file, 'utf8'); const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const html = raw.replace(/\r\n/g, '\n'), out = stampHtml(html, computeStamps());
  if (out !== html) { fs.writeFileSync(file, out.replace(/\n/g, eol)); console.log('index.html: asset versions updated'); }
}
