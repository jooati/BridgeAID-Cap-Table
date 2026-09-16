/* ============================================================================
   import-state.js — import a legacy Save-JSON file into Supabase.
   Shared by the admin "Load JSON" menu item (anon client + RLS: approvals are NOT restored,
   only your own tick could be) and scripts/import-state.mjs (service role: everything).
   ============================================================================ */
import { validateLegacy, chronoRows } from './calc.js';

const CHUNK = 400;
async function run(p) { const {error} = await p; if (error) throw new Error(error.message || String(error)); }
async function chunked(sb, table, rowsArr) { for (let i = 0; i < rowsArr.length; i += CHUNK) await run(sb.from(table).insert(rowsArr.slice(i, i + CHUNK))); }

/**
 * @param sb  supabase client
 * @param payload legacy Save-JSON object
 * @param {{restoreApprovals?:boolean, log?:(s:string)=>void}} opts
 */
export async function importState(sb, payload, opts = {}) {
  const S = validateLegacy(payload); if (!S) throw new Error('Not a BridgeAID tracker file.');
  const log = opts.log || (() => {});
  /* master data */
  await run(sb.from('owners').upsert(S.owners.map(o => ({id: o.id, name: o.name, baseline_pct: o.baseline, sort_last: !!o.last})), {onConflict: 'id'}));
  await run(sb.from('roles').upsert(S.roles.map(r => ({id: r.id, name: r.name})), {onConflict: 'id'}));
  log(`owners ${S.owners.length}, roles ${S.roles.length}`);
  await run(sb.from('salary_tables').upsert(S.salaryTables.map(t => ({effective_from: t.from + '-01', fx_huf_eur: t.fx})), {onConflict: 'effective_from'}));
  const {data: tables, error: te} = await sb.from('salary_tables').select('*'); if (te) throw new Error(te.message);
  const rates = [];
  S.salaryTables.forEach(t => { const db = tables.find(x => String(x.effective_from).slice(0, 7) === t.from); if (!db) return; S.roles.forEach(r => rates.push({table_id: db.id, role_id: r.id, gross_huf: +t.huf[r.id] || 0})); });
  if (rates.length) await run(sb.from('salary_rates').upsert(rates, {onConflict: 'table_id,role_id'}));
  log(`salary tables ${S.salaryTables.length}`);
  if (S.catalog.groups.length) {
    await run(sb.from('task_groups').upsert(S.catalog.groups.map(g => ({id: g.id, name: g.name})), {onConflict: 'id'}));
    const cats = [], tasks = [];
    S.catalog.groups.forEach(g => g.categories.forEach(c => { cats.push({id: c.id, group_id: g.id, code: c.code || c.id, name: c.name}); c.subs.forEach(s => tasks.push({id: s.id, category_id: c.id, name: s.name, weight: s.weight})); }));
    if (cats.length) await run(sb.from('task_categories').upsert(cats, {onConflict: 'id'}));
    if (tasks.length) await run(sb.from('tasks').upsert(tasks, {onConflict: 'id'}));
    log(`catalog: ${cats.length} categories, ${tasks.length} tasks`);
  }
  const {data: dbTasks, error: tke} = await sb.from('tasks').select('id'); if (tke) throw new Error(tke.message);
  const taskIds = new Set((dbTasks || []).map(t => t.id)), ownerIds = new Set(S.owners.map(o => o.id));
  const taskName = id => { for (const g of S.catalog.groups) for (const c of g.categories) { const s = c.subs.find(x => x.id === id); if (s) return s.name; } return null; };
  /* periods */
  const rows = chronoRows(S);
  await run(sb.from('periods').upsert(rows.map(r => ({id: r.id, kind: r.kind, ym: r.ym, label: r.label})), {onConflict: 'id'}));
  const pids = rows.map(r => r.id);
  /* wipe + insert logged work (approvals first, so RLS sees the periods as not final) */
  await run(sb.from('approvals').delete().in('period_id', pids));
  await run(sb.from('entries').delete().in('period_id', pids));
  await run(sb.from('salaries').delete().in('period_id', pids));
  const entries = [], salaries = [], approvals = [];
  rows.forEach(r => {
    Object.entries(r.cells).forEach(([oid, c]) => { if (!ownerIds.has(oid)) return;
      (c.entries || []).forEach(e => entries.push({period_id: r.id, owner_id: oid, task_id: taskIds.has(e.taskId) ? e.taskId : null, task_name: taskName(e.taskId), hours: e.hours, weight_snapshot: e.weight}));
      if (r.kind === 'month' && (c.role || c.salary != null)) salaries.push({period_id: r.id, owner_id: oid, role_id: c.role || null, gross_eur: c.salary}); });
    Object.keys(r.approvals || {}).forEach(oid => { const v = r.approvals[oid]; if (ownerIds.has(oid) && v) approvals.push({period_id: r.id, owner_id: oid, approved_by: (typeof v === 'string' && ownerIds.has(v)) ? v : oid}); });
  });
  await chunked(sb, 'entries', entries); await chunked(sb, 'salaries', salaries);
  log(`entries ${entries.length}, salaries ${salaries.length}`);
  let restored = 0;
  if (opts.restoreApprovals !== false && approvals.length) { await chunked(sb, 'approvals', approvals); restored = approvals.length; }
  for (const r of rows) await run(sb.from('periods').update({needs_reapproval: !!(r.audit && r.audit.needsReapproval)}).eq('id', r.id));
  log(`approvals ${restored} of ${approvals.length} restored`);
  return {owners: S.owners.length, periods: rows.length, entries: entries.length, salaries: salaries.length, approvals: approvals.length, approvalsRestored: restored};
}
