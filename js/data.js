/* ============================================================================
   data.js — Supabase persistence.
   • loadAll()  → builds the in-memory state `S` (same shape the legacy app used, see calc.js)
   • every edit = optimistic local mutation + one targeted upsert/delete
   • Realtime: any change on the published tables reloads just that slice and notifies the UI
   • `me` = id of the signed-in owner (set by auth.js); the DB trigger mirrors what `touch()` does locally
   ============================================================================ */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as C from './calc.js';

export const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export let S = null;         // live binding — importers see reloads
export let me = null;        // owner id of the signed-in user (null = not linked / signed out)
let sb = null;
let channel = null;
const listeners = new Set();

/* ---------- client ---------- */
export function setClient(client) { sb = client; }
export async function getClient() {
  if (!sb) { const m = await import(/* @vite-ignore */ SUPABASE_ESM); sb = m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
  return sb;
}
export function setMe(id) { me = id || null; }
export function clearState() { S = null; }
/* forget everything (used when the app is booted again against another client/document) */
export async function reset() { await unsubscribeRealtime(); S = null; me = null; loadStatus = {}; dirty.clear(); if (reloadTimer) clearTimeout(reloadTimer); reloadTimer = null; timers.forEach(r => clearTimeout(r.t)); timers.clear(); pending = 0; deferredReload = false; listeners.clear(); }

/* ---------- change notifications: {type:'data'|'status'|'error', ...} ---------- */
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify(ev) { listeners.forEach(cb => { try { cb(ev); } catch (e) { console.error(e); } }); }

/* ---------- reads ---------- */
/* one Error per failed query, carrying the raw Supabase fields; also logged in full to the console */
export function dbError(table, error, op = 'select') {
  const raw = error || {}; const e = new Error(`${table}: ${raw.message || String(error)}`);
  Object.assign(e, {table, op, code: raw.code, details: raw.details, hint: raw.hint, status: raw.status, raw});
  console.error(`[supabase] ${op} ${table} failed`, {message: raw.message, code: raw.code, details: raw.details, hint: raw.hint, status: raw.status, table, op});
  return e;
}
async function rows(table, order) {
  let q = sb.from(table).select('*'); if (order) q = q.order(order, {ascending: true});
  const {data, error} = await q; if (error) throw dbError(table, error); return data || [];
}
/* outcome of the last load per table: undefined = never tried, null = ok, Error = failed */
export let loadStatus = {};
export const CORE_TABLES = ['owners', 'periods', 'entries'];
export function coreFailed() { return CORE_TABLES.some(t => loadStatus[t]); }
/* run one table load; a failure degrades only that slice (returns null) and is reported, never thrown */
async function settled(table, fn) {
  try { const d = await fn(); loadStatus[table] = null; return d; }
  catch (e) { const err = e.table ? e : dbError(table, e); loadStatus[table] = err; notify({type: 'error', message: `Could not load ${table}: ${err.raw && err.raw.message || err.message}`, table, error: err}); return null; }
}
const genLast = (a, b) => ((a.includes('_x') ? 1 : 0) - (b.includes('_x') ? 1 : 0)) || a.localeCompare(b, 'en', {numeric: true});
const mapOwner = o => ({id: o.id, name: o.name, baseline: +o.baseline_pct || 0, last: !!o.sort_last, isAdmin: !!o.is_admin, authUid: o.auth_uid || null});
const mapRole = r => ({id: r.id, name: r.name});
const mapAudit = a => ({id: a.id, at: a.at, actor: a.actor || null, action: a.action, table: a.table_name, key: a.row_key, periodId: a.period_id || null, ownerId: a.owner_id || null, old: a.old || null, new: a.new || null});
const AUDIT_LIMIT = 2000;
async function auditRows() { const {data, error} = await sb.from('audit_log').select('*').order('id', {ascending: false}).limit(AUDIT_LIMIT); if (error) throw error; return (data || []).map(mapAudit).sort((a, b) => b.id - a.id); }
const ROLE_ORDER = ['ceo', 'coo', 'cso', 'civ', 'it'];   // default roles keep the legacy order; new roles follow A–Z
const rank = id => { const i = ROLE_ORDER.indexOf(id); return i < 0 ? ROLE_ORDER.length : i; };
const roleSort = (a, b) => (rank(a.id) - rank(b.id)) || a.name.localeCompare(b.name, 'en', {sensitivity: 'base'});
function mapTables(tables, rates) {
  return tables.map(t => ({id: t.id, from: String(t.effective_from).slice(0, 7), fx: +t.fx_huf_eur || C.DEFAULT_FX,
    huf: Object.fromEntries(rates.filter(r => r.table_id === t.id).map(r => [r.role_id, +r.gross_huf || 0]))}));
}
function mapCatalog(groups, cats, tasks) {
  return {groups: [...groups].sort((a, b) => genLast(a.id, b.id)).map(g => ({id: g.id, name: g.name,
    categories: cats.filter(c => c.group_id === g.id).sort((a, b) => genLast(a.id, b.id)).map(c => ({id: c.id, code: c.code || c.id, name: c.name,
      subs: tasks.filter(t => t.category_id === c.id).sort((a, b) => genLast(a.id, b.id)).map(t => ({id: t.id, name: t.name, weight: +t.weight || 0}))}))}))};
}
function mapPeriod(p, prev) {
  const r = prev || C.mkRow(p.id, p.kind, p.label, p.ym);
  r.kind = p.kind; r.label = p.label; r.ym = p.ym || null;
  r.audit = {editedBy: p.edited_by || null, editedAt: p.edited_at || null, needsReapproval: !!p.needs_reapproval};
  return r;
}
function ensureCell(row, oid) { if (!row.cells[oid]) row.cells[oid] = {entries: [], role: null, salary: null}; return row.cells[oid]; }
function applyEntries(entries) {
  S.rows.forEach(r => Object.values(r.cells).forEach(c => c.entries = []));
  [...entries].sort((a, b) => a.id - b.id).forEach(e => { const r = C.rowById(S, e.period_id); if (!r) return;
    ensureCell(r, e.owner_id).entries.push({id: e.id, taskId: e.task_id, taskName: e.task_name || null, hours: +e.hours || 0, weight: +e.weight_snapshot || 0}); });
}
function applySalaries(salaries) {
  S.rows.forEach(r => Object.values(r.cells).forEach(c => { c.role = null; c.salary = null; }));
  salaries.forEach(s => { const r = C.rowById(S, s.period_id); if (!r) return; const c = ensureCell(r, s.owner_id); c.role = s.role_id || null; c.salary = s.gross_eur == null ? null : +s.gross_eur; });
}
function applyApprovals(approvals) {
  S.rows.forEach(r => r.approvals = {});
  approvals.forEach(a => { const r = C.rowById(S, a.period_id); if (r) r.approvals[a.owner_id] = a.approved_by || a.owner_id; });   // value = who ticked
}

/* Every table is fetched independently: whatever fails leaves its slice empty and is recorded in loadStatus.
   The audit log is loaded separately afterwards — the tracker never depends on it. */
export async function loadAll() {
  const T = [['owners'], ['roles'], ['salary_tables', 'effective_from'], ['salary_rates'], ['task_groups'], ['task_categories'], ['tasks'], ['periods'], ['entries', 'id'], ['salaries'], ['approvals']];
  const got = await Promise.all(T.map(([t, o]) => settled(t, () => rows(t, o))));      // settled() never rejects
  const [owners, roles, tables, rates, groups, cats, tasks, periods, entries, salaries, approvals] = got.map(x => x || []);
  S = {schema: C.SCHEMA_NAME, version: C.SCHEMA_VERSION, owners: owners.map(mapOwner), roles: roles.map(mapRole).sort(roleSort),
    salaryTables: mapTables(tables, rates), catalog: mapCatalog(groups, cats, tasks), rows: periods.map(p => mapPeriod(p)), audit: [], auditError: null, meta: {updatedAt: null, updatedBy: null}};
  applyEntries(entries); applySalaries(salaries); applyApprovals(approvals);
  const audit = await settled('audit_log', auditRows);
  if (audit) S.audit = audit; else S.auditError = loadStatus.audit_log;
  return S;
}

/* slice reloads (Realtime) */
/* slice reloads (Realtime) — each one is settled(): a failure keeps the previous slice */
const reloaders = {
  owners: async () => { const d = await settled('owners', () => rows('owners')); if (d) S.owners = d.map(mapOwner); },
  roles: async () => { const d = await settled('roles', () => rows('roles')); if (d) S.roles = d.map(mapRole).sort(roleSort); },
  salary: async () => { const [t, r] = await Promise.all([settled('salary_tables', () => rows('salary_tables', 'effective_from')), settled('salary_rates', () => rows('salary_rates'))]); if (t && r) S.salaryTables = mapTables(t, r); },
  catalog: async () => { const [g, c, t] = await Promise.all([settled('task_groups', () => rows('task_groups')), settled('task_categories', () => rows('task_categories')), settled('tasks', () => rows('tasks'))]); if (g && c && t) S.catalog = mapCatalog(g, c, t); },
  periods: async () => { const ps = await settled('periods', () => rows('periods')); if (!ps) return; const keep = new Set(ps.map(p => p.id)); S.rows = ps.map(p => mapPeriod(p, C.rowById(S, p.id))); S.rows = S.rows.filter(r => keep.has(r.id)); },
  entries: async () => { const d = await settled('entries', () => rows('entries', 'id')); if (d) applyEntries(d); },
  salaries: async () => { const d = await settled('salaries', () => rows('salaries')); if (d) applySalaries(d); },
  approvals: async () => { const d = await settled('approvals', () => rows('approvals')); if (d) applyApprovals(d); },
  audit: async () => { const d = await settled('audit_log', auditRows); if (d) { S.audit = d; S.auditError = null; } else S.auditError = loadStatus.audit_log; },
};
const SLICE_OF = {owners: 'owners', roles: 'roles', salary_tables: 'salary', salary_rates: 'salary', tasks: 'catalog', task_categories: 'catalog', task_groups: 'catalog', periods: 'periods', entries: 'entries', salaries: 'salaries', approvals: 'approvals', audit_log: 'audit'};
export const REALTIME_TABLES = ['periods', 'entries', 'salaries', 'approvals', 'owners', 'salary_tables', 'salary_rates', 'tasks', 'audit_log'];

const dirty = new Set(); let reloadTimer = null, reloading = null;
function scheduleReload(slice) { if (slice) dirty.add(slice); if (reloadTimer) clearTimeout(reloadTimer); reloadTimer = setTimeout(runReload, 150); }
async function runReload() {
  reloadTimer = null; if (!S || !dirty.size) return;
  if (pending > 0) { deferredReload = true; return; }            // never clobber an edit that is still being written
  if (reloading) { await reloading; return scheduleReload(); }
  const slices = [...dirty]; dirty.clear();
  reloading = (async () => { try { if (slices.includes('all')) await loadAll(); else for (const s of slices) await reloaders[s](); notify({type: 'data', slices}); } catch (e) { console.warn('reload failed', e); notify({type: 'status', online: false, text: 'Reload failed'}); } })();
  await reloading; reloading = null;
}
export function onRealtime(table) { scheduleReload(SLICE_OF[table] || 'all'); }
export async function flushReload() { if (reloadTimer) clearTimeout(reloadTimer); reloadTimer = null; await flushPending(); await runReload(); if (reloading) await reloading; }
export async function reloadAll() { dirty.add('all'); await flushReload(); }

export function subscribeRealtime() {
  if (channel || !sb) return channel;
  channel = sb.channel('tracker-live');
  REALTIME_TABLES.forEach(t => channel.on('postgres_changes', {event: '*', schema: 'public', table: t}, () => onRealtime(t)));
  channel.subscribe(status => {
    const online = status === 'SUBSCRIBED';
    notify({type: 'status', online, text: online ? 'Live' : (status === 'CLOSED' ? 'Offline' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'Offline — reconnecting' : 'Connecting…')});
    if (online) scheduleReload('all');                                 // catch up on anything missed while disconnected
  });
  return channel;
}
export async function unsubscribeRealtime() { if (channel && sb) { try { await sb.removeChannel(channel); } catch (e) { /* ignore */ } } channel = null; }

/* ---------- writes ---------- */
let pending = 0, deferredReload = false; const timers = new Map(); const waiters = [];
function done() { pending--; if (pending <= 0) { pending = 0; waiters.splice(0).forEach(w => w()); if (deferredReload) { deferredReload = false; scheduleReload(); } } }
/* run one write; on failure resync the affected slice and tell the UI */
function write(label, fn, slice, mustChange = false) {
  pending++;
  return (async () => { try { const res = await fn(); if (res && res.error) throw res.error;
      if (mustChange && res && Array.isArray(res.data) && res.data.length === 0) throw new Error('nothing was saved (no permission, or the row no longer exists)');
      return res && res.data; }
    catch (e) { console.warn(label, e); notify({type: 'error', message: `${label}: ${e.message || e}`}); if (slice) { dirty.add(slice); deferredReload = true; } }
    finally { done(); } })();
}
/* debounced write per key (text inputs); the latest closure wins, callers awaiting earlier keystrokes resolve with it */
function debounced(key, ms, fn, slice, mustChange = true) {
  const prev = timers.get(key);
  if (prev) clearTimeout(prev.t); else pending++;
  const rec = {fn, slice, mustChange, t: null, promise: null, resolve: null};
  if (prev) { rec.promise = prev.promise; rec.resolve = prev.resolve; } else rec.promise = new Promise(r => rec.resolve = r);
  rec.t = setTimeout(() => fire(key), ms);
  timers.set(key, rec);
  return rec.promise;
}
function fire(key) { const rec = timers.get(key); if (!rec) return; timers.delete(key); pending--; write(key, rec.fn, rec.slice, rec.mustChange).then(rec.resolve); }
export function flushPending() {
  [...timers.keys()].forEach(fire);
  return new Promise(res => pending > 0 ? waiters.push(res) : res());
}
export function hasPendingWrites() { return pending > 0; }

/* local mirror of the DB trigger: an edit wipes every approval on the period and flags it */
function touch(row) {
  if (Object.keys(row.approvals).length) { row.approvals = {}; row.audit.needsReapproval = true; }
  row.audit.editedBy = me; row.audit.editedAt = C.nowIso();
}
const canWriteCard = (row) => row && !C.colFinal(S, row);

/* ----- cards: entries ----- */
export function addEntry(rowId, oid, taskId) {
  const row = C.rowById(S, rowId); const t = C.taskById(S, taskId); if (!canWriteCard(row) || !t) return;
  const e = {id: 'tmp' + Date.now() + Math.random().toString(36).slice(2), taskId, taskName: t.name, hours: 0, weight: t.weight};
  ensureCell(row, oid).entries.push(e); touch(row);
  e._ready = write('Add entry', async () => { const r = await sb.from('entries').insert({period_id: rowId, owner_id: oid, task_id: taskId, task_name: t.name, hours: 0, weight_snapshot: t.weight}).select().single(); if (r.data) e.id = r.data.id; return r; }, 'entries');
  return e._ready;
}
export function setHours(rowId, oid, idx, v) {
  const row = C.rowById(S, rowId); if (!canWriteCard(row)) return; const e = C.cellOf(row, oid).entries[idx]; if (!e) return;
  const h = Math.max(0, parseFloat(v) || 0); if (h === +e.hours) return; e.hours = h; touch(row);
  return debounced('hours:' + e.id, 500, async () => { await e._ready; return sb.from('entries').update({hours: h}).eq('id', e.id).select(); }, 'entries');
}
export function delEntry(rowId, oid, idx) {
  const row = C.rowById(S, rowId); if (!canWriteCard(row)) return; const c = C.cellOf(row, oid); const e = c.entries[idx]; if (!e) return;
  c.entries.splice(idx, 1); touch(row);
  return write('Remove entry', async () => { await e._ready; return sb.from('entries').delete().eq('id', e.id); }, 'entries');
}
/* ----- cards: salary ----- */
export function setSalary(rowId, oid, patch) {
  const row = C.rowById(S, rowId); if (!canWriteCard(row)) return; const c = ensureCell(row, oid);
  const role = 'role' in patch ? (patch.role || null) : c.role;
  const salary = 'salary' in patch ? (patch.salary == null || isNaN(patch.salary) ? null : Math.max(0, +patch.salary)) : c.salary;
  if (role === c.role && salary === c.salary) return;                      // nothing changed (e.g. Enter then blur)
  c.role = role; c.salary = salary;
  touch(row);
  return write('Save salary', () => sb.from('salaries').upsert({period_id: rowId, owner_id: oid, role_id: c.role, gross_eur: c.salary}, {onConflict: 'period_id,owner_id'}), 'salaries');
}
/* ----- approvals ----- */
export function setApproval(rowId, oid, checked) {
  const row = C.rowById(S, rowId); if (!row) return;
  if (checked) { row.approvals[oid] = me || oid; if (C.colFinal(S, row)) row.audit.needsReapproval = false; } else delete row.approvals[oid];
  return checked ? write('Approve', () => sb.from('approvals').upsert({period_id: rowId, owner_id: oid, approved_by: me || oid}, {onConflict: 'period_id,owner_id'}), 'approvals')
                 : write('Withdraw approval', () => sb.from('approvals').delete().match({period_id: rowId, owner_id: oid}), 'approvals');
}
export function reopen(rowId) {
  const row = C.rowById(S, rowId); if (!row) return; row.approvals = {}; row.audit.needsReapproval = true;
  return write('Reopen period', async () => { const r = await sb.from('approvals').delete().eq('period_id', rowId); if (r.error) return r; return sb.from('periods').update({needs_reapproval: true}).eq('id', rowId).select(); }, 'approvals', true);
}
/* ----- periods ----- */
export function addMonth() {
  const ym = C.nextYm(S), id = C.periodIdFor(ym), label = C.ymLabel(ym);
  S.rows.push(C.mkRow(id, 'month', label, ym));
  return {ym, label, done: write('Add month', () => sb.from('periods').insert({id, kind: 'month', ym, label}), 'periods')};
}
/* only months added after the default range (Dec 2025 → Sep 2026 always exist) and with no approval yet */
export function canRemoveMonth(row) { return !!row && row.kind === 'month' && row.ym > C.END_YM && C.colApproved(S, row) === 0; }
export function removeMonth(rowId) {
  const row = C.rowById(S, rowId); if (!canRemoveMonth(row)) return;
  S.rows = S.rows.filter(r => r.id !== rowId);
  return write('Remove month', () => sb.from('periods').delete().eq('id', rowId), 'periods');
}
/* ----- task catalog ----- */
export function updateGroup(gid, name) { const g = S.catalog.groups.find(x => x.id === gid); if (!g) return; g.name = name; return debounced('group:' + gid, 600, () => sb.from('task_groups').update({name}).eq('id', gid).select(), 'catalog'); }
export function updateCategory(cid, name) { for (const g of S.catalog.groups) { const c = g.categories.find(x => x.id === cid); if (c) { c.name = name; return debounced('cat:' + cid, 600, () => sb.from('task_categories').update({name}).eq('id', cid).select(), 'catalog'); } } }
export function addCategory(gid) {
  const g = S.catalog.groups.find(x => x.id === gid); if (!g) return; const id = (g.id === 'proj' ? 'P' : 'B') + '_x' + Date.now();
  g.categories.push({id, code: id, name: 'New category', subs: []});
  return write('Add category', () => sb.from('task_categories').insert({id, group_id: gid, code: id, name: 'New category'}), 'catalog');
}
export function addTask(cid) {
  for (const g of S.catalog.groups) { const c = g.categories.find(x => x.id === cid); if (!c) continue; const id = `${c.id}_x${Date.now()}`;
    c.subs.push({id, name: 'New task', weight: 1});
    return write('Add task', () => sb.from('tasks').insert({id, category_id: cid, name: 'New task', weight: 1}), 'catalog'); }
}
export function updateTask(tid, patch) {
  for (const g of S.catalog.groups) for (const c of g.categories) { const s = c.subs.find(x => x.id === tid); if (!s) continue;
    const upd = {}; if ('name' in patch) { s.name = patch.name; upd.name = patch.name; } if ('weight' in patch) { s.weight = Math.max(0, parseFloat(patch.weight) || 0); upd.weight = s.weight; }
    return debounced('task:' + tid + ':' + Object.keys(upd).join(), 600, () => sb.from('tasks').update(upd).eq('id', tid).select(), 'catalog'); }
}
export function taskInUse(tid) { return S.rows.some(r => Object.values(r.cells).some(c => (c.entries || []).some(e => e.taskId === tid))); }
export function delTask(tid) {
  for (const g of S.catalog.groups) for (const c of g.categories) { const i = c.subs.findIndex(x => x.id === tid); if (i < 0) continue; c.subs.splice(i, 1);
    return write('Delete task', () => sb.from('tasks').delete().eq('id', tid), 'catalog'); }
}
/* ----- owners ----- */
export function updateOwner(oid, patch) {
  const o = S.owners.find(x => x.id === oid); if (!o) return; const upd = {};
  if ('name' in patch) { o.name = patch.name; upd.name = patch.name; }
  if ('baseline' in patch) { const n = parseFloat(patch.baseline); o.baseline = isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); upd.baseline_pct = o.baseline; }
  if ('authUid' in patch) { o.authUid = patch.authUid || null; upd.auth_uid = o.authUid; }
  if ('isAdmin' in patch) { o.isAdmin = !!patch.isAdmin; upd.is_admin = o.isAdmin; }
  const key = 'owner:' + oid + ':' + Object.keys(upd).join();
  return 'name' in patch ? debounced(key, 600, () => sb.from('owners').update(upd).eq('id', oid).select(), 'owners') : write('Update owner', () => sb.from('owners').update(upd).eq('id', oid).select(), 'owners', true);
}
export function addOwner(name) {
  const id = 'o' + Date.now().toString(36); S.owners.push({id, name, baseline: 0, last: false, isAdmin: false, authUid: null});
  return write('Add owner', () => sb.from('owners').insert({id, name, baseline_pct: 0, sort_last: false, is_admin: false}), 'owners');
}
export function removeOwner(oid) {
  S.owners = S.owners.filter(o => o.id !== oid); S.rows.forEach(r => { delete r.cells[oid]; delete r.approvals[oid]; });
  return write('Remove owner', () => sb.from('owners').delete().eq('id', oid), 'owners');
}
export async function listAuthUsers() { const {data, error} = await sb.rpc('list_auth_users'); if (error) throw error; return data || []; }
/* ----- roles ----- */
export function updateRole(rid, name) { const r = S.roles.find(x => x.id === rid); if (!r) return; r.name = name; return debounced('role:' + rid, 600, () => sb.from('roles').update({name}).eq('id', rid).select(), 'roles'); }
export function addRole(name) {
  const id = 'r' + Date.now().toString(36); S.roles.push({id, name}); S.salaryTables.forEach(tb => tb.huf[id] = 2000000);
  return write('Add role', async () => { const r = await sb.from('roles').insert({id, name}); if (r.error) return r; return sb.from('salary_rates').insert(S.salaryTables.map(tb => ({table_id: tb.id, role_id: id, gross_huf: 2000000}))); }, 'salary');
}
export function roleInUse(rid) { return S.rows.some(row => Object.values(row.cells).some(c => c.role === rid)); }
export function delRole(rid) {
  S.roles = S.roles.filter(r => r.id !== rid); S.salaryTables.forEach(tb => delete tb.huf[rid]);
  return write('Delete role', () => sb.from('roles').delete().eq('id', rid), 'roles');
}
/* ----- salary tables (ids arrive as strings from data-attributes) ----- */
const tableById = tid => S.salaryTables.find(x => String(x.id) === String(tid));
export function addSalaryTable() {
  const ts = C.tablesSorted(S); const base = ts[ts.length - 1]; let from = C.incYm(base.from); while (S.salaryTables.some(x => x.from === from)) from = C.incYm(from);
  const tb = {id: 'tmp' + Date.now(), from, fx: base.fx, huf: {...base.huf}}; S.salaryTables.push(tb);
  const done = write('New salary table', async () => { const r = await sb.from('salary_tables').insert({effective_from: from + '-01', fx_huf_eur: tb.fx}).select().single(); if (r.error) return r; tb.id = r.data.id; notify({type: 'data', slices: ['salary']});
    return sb.from('salary_rates').insert(S.roles.map(x => ({table_id: tb.id, role_id: x.id, gross_huf: +tb.huf[x.id] || 0}))); }, 'salary');
  tb._ready = done; return {from, done};
}
export function delSalaryTable(tid) {
  if (S.salaryTables.length <= 1) return; const tb = tableById(tid); if (!tb) return; S.salaryTables = S.salaryTables.filter(x => x !== tb);
  return write('Remove salary table', async () => { await tb._ready; return sb.from('salary_tables').delete().eq('id', tb.id); }, 'salary');
}
export function updateSalaryTable(tid, patch) {
  const tb = tableById(tid); if (!tb) return; const upd = {};
  if ('from' in patch) { if (S.salaryTables.some(x => x !== tb && x.from === patch.from)) return {error: 'There is already a table starting that month.'}; tb.from = patch.from; upd.effective_from = patch.from + '-01'; }
  if ('fx' in patch) { const n = parseFloat(patch.fx); if (isNaN(n) || n <= 0 || n === tb.fx) return; tb.fx = n; upd.fx_huf_eur = n; }
  if (!Object.keys(upd).length) return;
  return write('Update salary table', async () => { await tb._ready; return sb.from('salary_tables').update(upd).eq('id', tb.id).select(); }, 'salary', true);
}
export function setRate(tid, rid, huf) {
  const tb = tableById(tid); if (!tb) return; const v = Math.max(0, parseFloat(huf) || 0); if (v === (+tb.huf[rid] || 0)) return; tb.huf[rid] = v;
  return write('Save rate', async () => { await tb._ready; return sb.from('salary_rates').upsert({table_id: tb.id, role_id: rid, gross_huf: v}, {onConflict: 'table_id,role_id'}); }, 'salary');
}
