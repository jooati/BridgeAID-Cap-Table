/* jsdom harness: loads index.html, installs browser globals, boots the app against the mock Supabase. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createMockSupabase } from './mock-supabase.mjs';
import { makeDb, USERS } from './fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://jooati.github.io/BridgeAID-Cap-Table/';

function def(name, value) { try { Object.defineProperty(globalThis, name, {value, configurable: true, writable: true}); } catch (e) { /* ignore */ } }

/**
 * @param {{user?:string|null, example?:boolean, tables?:object, url?:string, boot?:boolean}} o
 *   user: email of the signed-in user (null = signed out); example: seed the demo entries
 */
export async function setup(o = {}) {
  const {user = 'jal@example.com', example = true, tables, url = SITE, boot = true, fail = {}} = o;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script type="module">[\s\S]*?<\/script>/, '').replace(/<script src="https:[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, {url, pretendToBeVisual: true});
  const w = dom.window;
  def('window', w); def('document', w.document);
  ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'FileReader', 'File', 'getComputedStyle'].forEach(k => def(k, w[k]));
  const env = {confirm: true, promptValue: 'New name', confirms: [], prompts: []};
  w.confirm = msg => { env.confirms.push(msg); return env.confirm; };
  w.prompt = msg => { env.prompts.push(msg); return env.promptValue; };
  w.alert = () => {};
  w.localStorage.clear();
  const sb = createMockSupabase({tables: tables || makeDb({example}), users: USERS.map(u => ({...u})), session: user ? USERS.find(u => u.email === user) : null, fail});
  const [app, D, A, C, tracker, report, owners, tasks, diag] = await Promise.all([
    import('../js/app.js'), import('../js/data.js'), import('../js/auth.js'), import('../js/calc.js'), import('../js/ui-tracker.js'), import('../js/ui-report.js'), import('../js/ui-owners.js'), import('../js/ui-tasks.js'), import('../js/ui-diag.js')]);
  if (boot) { await app.boot({client: sb}); await D.flushReload(); }   // drain the catch-up reload scheduled on SUBSCRIBED
  const $ = sel => w.document.querySelector(sel), $$ = sel => [...w.document.querySelectorAll(sel)];
  const fire = (el, type, init = {}) => { const Ev = type.startsWith('key') ? w.KeyboardEvent : (type.startsWith('mouse') || type === 'click') ? w.MouseEvent : w.Event; el.dispatchEvent(new Ev(type, {bubbles: true, cancelable: true, ...init})); };
  const setValue = (el, v, ev = 'input') => { el.value = v; fire(el, ev); };
  const flush = async () => { await D.flushPending(); await D.flushReload(); };
  const text = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  return {dom, window: w, document: w.document, sb, app, D, A, C, tracker, report, owners, tasks, diag, env, $, $$, fire, setValue, flush, text, USERS};
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
