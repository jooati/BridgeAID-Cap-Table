/* ============================================================================
   calc.js — PURE calculation & state helpers. No DOM, no I/O.
   Every function takes the state `S` explicitly (see data.js for its shape):
     S.owners        [{id,name,baseline,last,isAdmin,authUid}]
     S.roles         [{id,name}]
     S.salaryTables  [{id,from:'YYYY-MM',fx,huf:{roleId:huf}}]
     S.catalog       {groups:[{id,name,categories:[{id,code,name,subs:[{id,name,weight}]}]}]}
     S.rows          [{id,kind,label,ym,cells:{oid:{entries:[{id,taskId,taskName,hours,weight}],role,salary}},
                       approvals:{oid:true},audit:{editedBy,editedAt,needsReapproval}}]
   ---------------------------------------------------------------------------
   CALCULATION (per owner, per period) — do not change without updating tests:
     H  = Σ hours                 W = Σ hours × weight_snapshot      avgW = W / H
     market = gross_huf(role, table in force for period.ym) / fx
     paid_h = gross_eur / market × 160        (months only; 0 for ip / incubation)
     paid_w = min(paid_h, H) × avgW
     equity = W − paid_w   (= W × (1 − paid_h/H))
     share_this_period = equity / Σ_owners equity
     cumulative = running Σ equity in chronological order (ip → incub → months)
   ============================================================================ */

export const HOURS_PER_MONTH = 160;
export const DEFAULT_FX = 400;
export const START_YM = '2025-12';
export const END_YM = '2026-09';
export const SCHEMA_NAME = 'bridgeaid-monthly-tracker';
export const SCHEMA_VERSION = 2;
export const PALETTE = ['#2F5C9E', '#FFC000', '#2E7D5B', '#8C2F39', '#5B6878', '#C79400', '#46586B', '#A9B2BD', '#3B4A5C', '#E0A800'];
export const DEFAULT_OWNERS = [
  {id: 'hb', name: 'HB', baseline: 0, last: true}, {id: 'jal', name: 'JAL', baseline: 16.67}, {id: 'ka', name: 'KÁ', baseline: 16.67},
  {id: 'kd', name: 'KD', baseline: 16.67}, {id: 'kb', name: 'KB', baseline: 16.66}, {id: 'szb', name: 'SZB', baseline: 16.67}, {id: 'vi', name: 'VI', baseline: 16.66}];

/* ---------- formatting ---------- */
export const r2 = v => Math.round(v * 100) / 100;
export const fmt = v => r2(v).toFixed(2);
export const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
export const money = v => '€' + r2(v || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export function parseMoney(s) { const c = String(s ?? '').replace(/[€\s,]/g, ''); return c === '' ? NaN : parseFloat(c); }
export function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function ymLabel(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', {month: 'long', year: 'numeric'}); }
export function incYm(ym) { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
export function decYm(ym) { let [y, m] = ym.split('-').map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; }
export function nowIso() { return new Date().toISOString(); }
export function fmtWhen(iso) { if (!iso) return ''; return new Date(iso).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}); }
export function ink(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150 ? '#222A35' : '#fff'; }
export function periodIdFor(ym) { return 'm' + ym.replace('-', ''); }

/* ---------- owners ---------- */
/* A–Z (hu collation), except owners flagged `last` (HB) which are pinned to the end of every list */
export function sortedOwners(S) {
  return [...S.owners].sort((a, b) => ((a.last ? 1 : 0) - (b.last ? 1 : 0)) || a.name.localeCompare(b.name, 'hu', {sensitivity: 'base'}));
}
export function ownerName(S, id) { const o = S.owners.find(x => x.id === id); return o ? o.name : id; }
export function ownerColor(S, id) { const i = sortedOwners(S).findIndex(o => o.id === id); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; }

/* ---------- task catalog ---------- */
export function allTasks(S) {
  const out = [];
  S.catalog.groups.forEach(g => g.categories.forEach(c => c.subs.forEach(s =>
    out.push({id: s.id, name: s.name, weight: +s.weight || 0, cat: c.name, catId: c.id, group: g.name}))));
  return out;
}
export function taskById(S, id) { return allTasks(S).find(t => t.id === id); }

/* ---------- salary tables ---------- */
export function tablesSorted(S) { return [...(S.salaryTables || [])].sort((a, b) => a.from.localeCompare(b.from)); }
/* the salary table in force for a given month: latest table whose `from` ≤ ym (fallback: earliest) */
export function tableFor(S, ym) { const ts = tablesSorted(S); if (!ts.length) return null; let cur = ts[0]; ts.forEach(x => { if (!ym || x.from <= ym) cur = x; }); return cur; }
export function roleEur(S, rid, ym) { const tb = tableFor(S, ym); if (!tb) return 0; return (+tb.huf[rid] || 0) / (+tb.fx || DEFAULT_FX); }
export function roleName(S, rid) { return rid ? ((S.roles.find(x => x.id === rid) || {}).name || '') : ''; }

/* ---------- periods ---------- */
export function mkRow(id, kind, label, ym) { return {id, kind, label, ym: ym || null, cells: {}, approvals: {}, audit: {editedBy: null, editedAt: null, needsReapproval: false}}; }
/* display order: newest month first … oldest month, then incubation, then IP */
export function displayRows(S) {
  const months = S.rows.filter(r => r.kind === 'month').sort((a, b) => (b.ym || '').localeCompare(a.ym || ''));
  const inc = S.rows.find(r => r.kind === 'incubation'), ip = S.rows.find(r => r.kind === 'ip');
  return [...months, ...(inc ? [inc] : []), ...(ip ? [ip] : [])];
}
export function chronoRows(S) { return displayRows(S).slice().reverse(); }
/* 'current' column = the newest month present */
export function currentYm(S) { const ms = S ? S.rows.filter(r => r.kind === 'month' && r.ym).map(r => r.ym).sort() : []; return ms.length ? ms[ms.length - 1] : END_YM; }
export function nextYm(S) { const ms = S.rows.filter(r => r.kind === 'month' && r.ym).map(r => r.ym).sort(); return ms.length ? incYm(ms[ms.length - 1]) : START_YM; }
export function rowById(S, id) { return S.rows.find(r => r.id === id); }
/* read-only view of a card (never creates it) */
export function cellOf(row, oid) { return (row && row.cells[oid]) || {entries: [], role: null, salary: null}; }

/* ---------- approvals ---------- */
export function colApproved(S, row) { return S.owners.filter(o => row.approvals[o.id]).length; }
export function colFinal(S, row) { return S.owners.length > 0 && S.owners.every(o => row.approvals[o.id]); }
export function colStatus(S, row) {
  const n = colApproved(S, row), N = S.owners.length, fin = colFinal(S, row), needs = row.audit.needsReapproval;
  return {n, N, fin, needs, cls: fin ? 'final' : (needs ? 'needs' : ''), txt: fin ? 'Finalised' : (needs ? 'Re-approval needed' : (n ? `Approved ${n}/${N}` : 'Pending'))};
}

/* ---------- CALCULATION ---------- */
export function calcCell(S, row, oid) {
  const c = row.cells[oid] || {entries: []};
  const H = (c.entries || []).reduce((a, e) => a + (+e.hours || 0), 0), W = (c.entries || []).reduce((a, e) => a + (+e.hours || 0) * (+e.weight || 0), 0);
  let paidHours = 0, market = 0;
  if (row.kind === 'month' && c.role) { market = roleEur(S, c.role, row.ym); paidHours = market > 0 ? (+c.salary || 0) / market * HOURS_PER_MONTH : 0; }
  const unpaid = Math.max(0, H - paidHours), f = H > 0 ? unpaid / H : 0;
  const avgW = H > 0 ? W / H : 0, paidW = Math.min(paidHours, H) * avgW;   // paid hours removed at the owner's average weight
  return {H, W, paidHours, market, unpaidHours: unpaid, avgW, paidW, equity: W * f, over: paidHours > H && H > 0};
}
/* returns map rowId -> {cells:{oid:calc+monthlyShare}, colTotal, cum:{oid}, cumTot, cumShare:{oid}} */
export function computeAll(S) {
  const owners = sortedOwners(S), out = {}, cum = {}; let cumTot = 0; owners.forEach(o => cum[o.id] = 0);
  chronoRows(S).forEach(row => {
    const cells = {}; let tot = 0;
    owners.forEach(o => { cells[o.id] = calcCell(S, row, o.id); tot += cells[o.id].equity; });
    owners.forEach(o => { cum[o.id] += cells[o.id].equity; cells[o.id].monthly = tot > 0 ? cells[o.id].equity / tot * 100 : 0; });
    cumTot += tot;
    const cumShare = {}; owners.forEach(o => cumShare[o.id] = cumTot > 0 ? cum[o.id] / cumTot * 100 : 0);
    out[row.id] = {cells, colTotal: tot, cum: {...cum}, cumTot, cumShare};
  });
  return out;
}
export function ownerCumulative(S) { const rows = chronoRows(S); if (!rows.length) return {}; const comp = computeAll(S); return comp[rows[rows.length - 1].id]; }

/* ---------- work log (flattened entries) ---------- */
export function worklogRows(S) {
  const rows = [];
  chronoRows(S).forEach(r => sortedOwners(S).forEach(o => {
    const c = r.cells[o.id]; if (!c) return;
    (c.entries || []).forEach(e => { const t = taskById(S, e.taskId); rows.push({period: r, owner: o, task: t || {id: e.taskId, name: e.taskName || '(removed task)', cat: '', group: ''}, hours: +e.hours || 0, weight: +e.weight || 0}); });
  }));
  return rows;
}

/* ---------- default / empty state (used by tests, the seed script and the JSON importer) ---------- */
export function emptyState(catalog) {
  const rows = [mkRow('ip', 'ip', 'Intellectual property'), mkRow('incub', 'incubation', 'Incubation programs')];
  let ym = START_YM; while (ym <= END_YM) { rows.push(mkRow(periodIdFor(ym), 'month', ymLabel(ym), ym)); ym = incYm(ym); }
  return {
    schema: SCHEMA_NAME, version: SCHEMA_VERSION,
    owners: DEFAULT_OWNERS.map(o => ({...o, last: !!o.last, isAdmin: false, authUid: null})),
    roles: [{id: 'ceo', name: 'CEO'}, {id: 'coo', name: 'COO'}, {id: 'cso', name: 'CSO'}, {id: 'civ', name: 'Civil engineer'}, {id: 'it', name: 'IT engineer'}],
    salaryTables: [{id: 1, from: START_YM, fx: DEFAULT_FX, huf: {ceo: 3000000, coo: 2500000, cso: 2500000, civ: 2000000, it: 2000000}}],
    catalog: catalog || {groups: []}, rows, meta: {updatedAt: null, updatedBy: null},
  };
}

/* ---------- legacy Save-JSON ⇄ state ---------- */
/* Serialise the state in the legacy file format (Save JSON). */
export function toLegacyJson(S) {
  return {
    schema: SCHEMA_NAME, version: SCHEMA_VERSION,
    owners: sortedOwners(S).map(o => ({id: o.id, name: o.name, baseline: +o.baseline || 0, last: !!o.last})),
    roles: S.roles.map(r => ({id: r.id, name: r.name})),
    salaryTables: tablesSorted(S).map(t => ({from: t.from, fx: t.fx, huf: {...t.huf}})),
    catalog: {groups: S.catalog.groups.map(g => ({id: g.id, name: g.name, categories: g.categories.map(c => ({id: c.id, code: c.code || c.id, name: c.name, subs: c.subs.map(s => ({id: s.id, name: s.name, weight: +s.weight || 0}))}))}))},
    rows: chronoRows(S).map(r => ({id: r.id, kind: r.kind, label: r.label, ym: r.ym, cells: Object.fromEntries(Object.entries(r.cells).map(([oid, c]) => [oid, {entries: (c.entries || []).map(e => ({taskId: e.taskId, hours: +e.hours || 0, weight: +e.weight || 0})), role: c.role || null, salary: c.salary ?? null}])), approvals: {...r.approvals}, audit: {...r.audit}})),
    meta: {updatedAt: nowIso(), updatedBy: (S.meta && S.meta.updatedBy) || null},
  };
}
/* Validate a legacy Save-JSON payload (v1/v2/v3 shapes) into the canonical state shape; null if not a tracker file. */
export function validateLegacy(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.schema && payload.schema !== SCHEMA_NAME) return null;
  if (!Array.isArray(payload.rows) && !Array.isArray(payload.owners)) return null;
  const out = emptyState();
  if (Array.isArray(payload.owners)) out.owners = payload.owners.filter(o => o && o.id && o.name != null).map(o => { const d = DEFAULT_OWNERS.find(x => x.id === o.id); return {id: String(o.id), name: String(o.name), baseline: (o.baseline == null || isNaN(+o.baseline)) ? (d ? d.baseline : 0) : +o.baseline, last: !!(o.last ?? (d && d.last)), isAdmin: false, authUid: null}; });
  if (Array.isArray(payload.roles) && payload.roles.length) out.roles = payload.roles.filter(r => r && r.id).map(r => ({id: String(r.id), name: String(r.name || r.id)}));
  if (Array.isArray(payload.salaryTables) && payload.salaryTables.length) out.salaryTables = payload.salaryTables.filter(x => x && /^\d{4}-\d{2}$/.test(x.from || '')).map((x, i) => ({id: i + 1, from: x.from, fx: +x.fx > 0 ? +x.fx : DEFAULT_FX, huf: Object.fromEntries(out.roles.map(r => [r.id, +(x.huf && x.huf[r.id]) || 0]))}));
  else if (Array.isArray(payload.roles) && payload.roles.some(r => r && r.huf != null)) out.salaryTables = [{id: 1, from: START_YM, fx: +payload.fx > 0 ? +payload.fx : DEFAULT_FX, huf: Object.fromEntries(payload.roles.filter(r => r && r.id).map(r => [String(r.id), +r.huf || 0]))}];
  if (!out.salaryTables.length) out.salaryTables = emptyState().salaryTables;
  if (payload.catalog && Array.isArray(payload.catalog.groups) && payload.catalog.groups.length) out.catalog = {groups: payload.catalog.groups.map(g => ({id: String(g.id), name: String(g.name || g.id), categories: (g.categories || []).map(c => ({id: String(c.id), code: String(c.code || c.id), name: String(c.name || c.id), subs: (c.subs || []).map(s => ({id: String(s.id), name: String(s.name || s.id), weight: +s.weight || 0}))}))}))};
  if (Array.isArray(payload.rows) && payload.rows.length) out.rows = payload.rows.filter(r => r && r.id).map(r => {
    const cells = {};
    Object.entries(r.cells || {}).forEach(([oid, c]) => { if (!c || typeof c !== 'object') return; cells[oid] = {entries: Array.isArray(c.entries) ? c.entries.filter(e => e && e.taskId).map(e => ({taskId: String(e.taskId), hours: +e.hours || 0, weight: +e.weight || 0})) : [], role: c.role || null, salary: (c.salary == null || isNaN(+c.salary)) ? null : +c.salary}; });
    return {id: String(r.id), kind: ['ip', 'incubation', 'month'].includes(r.kind) ? r.kind : 'month', label: String(r.label || r.id), ym: r.ym || null, cells, approvals: (r.approvals && typeof r.approvals === 'object') ? r.approvals : {}, audit: Object.assign({editedBy: null, editedAt: null, needsReapproval: false}, r.audit || {})};
  });
  /* invariants: the 7 default owners are always present; months Dec 2025 → Sep 2026 always exist */
  out.owners.forEach(o => { if (o.id === 'hb' && /^herczeg bal/i.test(o.name)) o.name = 'HB'; });
  DEFAULT_OWNERS.forEach(d => { if (!out.owners.some(o => o.id === d.id || o.name.localeCompare(d.name, 'hu', {sensitivity: 'base'}) === 0)) out.owners.push({...d, last: !!d.last, isAdmin: false, authUid: null}); });
  if (!out.rows.some(r => r.kind === 'ip')) out.rows.unshift(mkRow('ip', 'ip', 'Intellectual property'));
  if (!out.rows.some(r => r.kind === 'incubation')) out.rows.splice(1, 0, mkRow('incub', 'incubation', 'Incubation programs'));
  { let ym = START_YM; while (ym <= END_YM) { if (!out.rows.some(r => r.kind === 'month' && r.ym === ym)) out.rows.push(mkRow(periodIdFor(ym), 'month', ymLabel(ym), ym)); ym = incYm(ym); } }
  out.meta = Object.assign({updatedAt: null, updatedBy: null}, payload.meta || {});
  return out;
}
