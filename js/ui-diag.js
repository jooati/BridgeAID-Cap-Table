/* ============================================================================
   ui-diag.js — "Connection diagnostics" panel, opened by clicking the header status pill.
   One probe per table plus the my_owner_id() / is_admin() RPCs; each row shows OK or the raw
   Supabase error (message · code · details · hint), next to the outcome of the last data load.
   ============================================================================ */
import * as D from './data.js';
import * as C from './calc.js';

export const PROBE_TABLES = ['owners', 'roles', 'salary_tables', 'salary_rates', 'task_groups', 'task_categories', 'tasks', 'periods', 'entries', 'salaries', 'approvals', 'audit_log'];
export const PROBE_RPCS = ['my_owner_id', 'is_admin'];
const $ = id => document.getElementById(id);
export let lastRun = null;   // promise of the run in progress / last run (tests await it)

export function errorText(e) {
  if (!e) return '';
  const parts = [e.message || String(e)];
  if (e.code) parts.push(`code ${e.code}`); if (e.status) parts.push(`HTTP ${e.status}`); if (e.details) parts.push(`details: ${e.details}`); if (e.hint) parts.push(`hint: ${e.hint}`);
  return parts.join(' · ');
}
async function probe(name, fn) {
  const t0 = Date.now();
  try { const res = await fn(); if (res && res.error) throw res.error; return {name, ok: true, ms: Date.now() - t0, value: res && res.data}; }
  catch (e) { return {name, ok: false, ms: Date.now() - t0, error: e, text: errorText(e)}; }
}
export async function runDiagnostics() {
  const sb = await D.getClient();
  const probes = [...PROBE_TABLES.map(t => probe(t, () => sb.from(t).select('*').limit(1))), ...PROBE_RPCS.map(f => probe(f + '()', () => sb.rpc(f)))];
  const results = await Promise.all(probes);
  results.forEach(r => { const st = D.loadStatus[r.name]; r.load = st === undefined ? null : (st ? errorText(st) : 'ok'); });
  return results;
}
function render(results, running) {
  const body = $('diagBody'); if (!body) return;
  if (running) { body.innerHTML = `<tr><td colspan="3" class="muted">Probing…</td></tr>`; return; }
  body.innerHTML = results.map(r => `<tr data-probe="${C.esc(r.name)}" class="${r.ok ? 'ok' : 'fail'}"><td><code>${C.esc(r.name)}</code></td><td class="${r.ok ? 'ok' : 'fail'}">${r.ok ? 'OK' : 'ERROR'} <span class="muted small">${r.ms} ms</span></td>
    <td>${r.ok ? (r.name.endsWith('()') ? `<span class="muted">→ ${C.esc(JSON.stringify(r.value))}</span>` : '') : `<pre>${C.esc(r.text)}</pre>`}${r.load && r.load !== 'ok' ? `<div class="small"><b>Last load:</b> <span class="fail">${C.esc(r.load)}</span></div>` : ''}</td></tr>`).join('');
  const failed = results.filter(r => !r.ok).length;
  const txt = $('diagText'); if (txt) txt.textContent = failed ? `${failed} of ${results.length} probes failed. A missing table means the MIGRATION block at the end of supabase/schema.sql has not been run; "permission denied" means a row-level-security policy.` : `All ${results.length} probes OK.`;
}
export function openDiagnostics() {
  const m = $('diagModal'); if (!m) return; m.hidden = false; render([], true);
  lastRun = runDiagnostics().then(res => { render(res, false); return res; }).catch(e => { render([{name: 'diagnostics', ok: false, ms: 0, text: errorText(e)}], false); return []; });
  return lastRun;
}
export function closeDiagnostics() { const m = $('diagModal'); if (m) m.hidden = true; }
export function initDiag() {
  const pill = $('syncPill'); if (!pill) return;
  pill.addEventListener('click', () => openDiagnostics());
  $('diagRun').addEventListener('click', () => openDiagnostics());
  $('diagClose').addEventListener('click', closeDiagnostics);
  $('diagModal').addEventListener('click', e => { if (e.target === $('diagModal')) closeDiagnostics(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('diagModal').hidden) closeDiagnostics(); });
}
