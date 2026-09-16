/* data.js: load shape, targeted writes, realtime slice reloads. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, sleep } from './setup.mjs';

let t;
before(async () => { t = await setup(); });

test('loadAll builds the legacy state shape from the tables', () => {
  const S = t.D.S;
  assert.deepEqual(S.owners.find(o => o.id === 'jal'), {id: 'jal', name: 'JAL', baseline: 16.67, last: false, isAdmin: true, authUid: 'u-jal'});
  assert.deepEqual(S.roles.map(r => r.id), ['ceo', 'coo', 'cso', 'civ', 'it']);
  assert.deepEqual(S.salaryTables, [{id: 1, from: '2025-12', fx: 400, huf: {ceo: 3000000, coo: 2500000, cso: 2500000, civ: 2000000, it: 2000000}}]);
  assert.equal(S.catalog.groups.length, 2); assert.equal(S.catalog.groups[0].categories.length, 7); assert.equal(S.catalog.groups[1].categories.length, 5);
  assert.equal(t.C.allTasks(S).length, 62); assert.equal(S.catalog.groups[0].categories[0].code, 'B1');
  const dec = t.C.rowById(S, 'm202512');
  assert.deepEqual(dec.cells.hb.entries.map(e => [e.taskId, e.hours, e.weight]), [['B5s1', 50, 6], ['B3s5', 30, 9]]);
  assert.equal(dec.cells.hb.role, 'ceo'); assert.equal(dec.cells.hb.salary, 2500); assert.equal(dec.cells.kd.salary, null);
  assert.equal(Object.keys(dec.approvals).length, 7); assert.equal(dec.audit.needsReapproval, false);
  assert.equal(Object.keys(t.C.rowById(S, 'm202609').approvals).length, 0);
  assert.deepEqual(S.audit, [], 'audit slice loaded (empty fixture)');
});

test('targeted writes: entries, salaries, approvals, periods', async () => {
  const rid = 'm202609';
  t.D.setHours(rid, 'jal', 0, '10'); t.D.setHours(rid, 'jal', 0, '11'); t.D.setHours(rid, 'jal', 0, '12');
  assert.ok(t.D.hasPendingWrites());
  await t.D.flushPending();
  const upd = t.sb.writes.filter(w => w.table === 'entries' && w.op === 'update');
  assert.equal(upd.length, 1, 'debounced to one update'); assert.deepEqual(upd[0].patch, {hours: 12});
  await t.D.setSalary(rid, 'jal', {role: 'cso'}); await t.D.setSalary(rid, 'jal', {salary: 1234.5});
  assert.deepEqual(t.sb.db.salaries.find(s => s.period_id === rid && s.owner_id === 'jal'), {period_id: rid, owner_id: 'jal', role_id: 'cso', gross_eur: 1234.5});
  await t.D.setApproval(rid, 'jal', true); assert.ok(t.sb.db.approvals.some(a => a.period_id === rid && a.owner_id === 'jal'));
  await t.D.setApproval(rid, 'jal', false); assert.ok(!t.sb.db.approvals.some(a => a.period_id === rid));
  const m = t.D.addMonth(); await m.done; assert.equal(m.ym, '2026-10'); assert.ok(t.sb.db.periods.some(p => p.id === 'm202610'));
  assert.equal(t.D.removeMonth('m202609'), undefined, 'default months stay');
  await t.D.removeMonth('m202610'); assert.ok(!t.sb.db.periods.some(p => p.id === 'm202610'));
  await t.D.addEntry(rid, 'jal', 'B2s2'); const e = t.C.rowById(t.D.S, rid).cells.jal.entries.at(-1); assert.equal(e.weight, 9); assert.equal(typeof e.id, 'number');
  t.D.setHours(rid, 'jal', 2, '3'); await t.D.flushPending(); assert.equal(t.sb.db.entries.find(x => x.id === e.id).hours, 3);
  await t.D.delEntry(rid, 'jal', 2); assert.ok(!t.sb.db.entries.some(x => x.id === e.id));
  /* reopen clears approvals and flags the period */
  await t.D.reopen('m202607'); assert.equal(t.sb.db.approvals.filter(a => a.period_id === 'm202607').length, 0); assert.equal(t.sb.db.periods.find(p => p.id === 'm202607').needs_reapproval, true);
});

test('realtime: a change on a table reloads only that slice, deferred while our own write is pending', async () => {
  const rid = 'm202608';
  t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'kd').hours = 555;
  t.sb.db.owners.find(o => o.id === 'kd').name = 'KD2';
  t.D.onRealtime('entries'); await sleep(200);
  assert.equal(t.C.rowById(t.D.S, rid).cells.kd.entries[0].hours, 555, 'entries reloaded');
  assert.equal(t.C.ownerName(t.D.S, 'kd'), 'KD', 'owners slice untouched');
  t.D.onRealtime('owners'); await t.D.flushReload();
  assert.equal(t.C.ownerName(t.D.S, 'kd'), 'KD2');
  t.sb.db.owners.find(o => o.id === 'kd').name = 'KD';
  /* pending write → reload waits */
  t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'kd').hours = 556;
  t.D.setHours(rid, 'jal', 0, '42'); t.D.onRealtime('entries'); await sleep(200);
  assert.notEqual(t.C.rowById(t.D.S, rid).cells.kd.entries[0].hours, 556, 'not reloaded yet');
  await t.flush();
  assert.equal(t.C.rowById(t.D.S, rid).cells.kd.entries[0].hours, 556);
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 42);
  await t.D.reloadAll();
  /* the subscription covers every published table, and the pill went online */
  const ch = t.sb.channels[0]; assert.ok(ch); assert.deepEqual(ch._handlers.map(h => h.table), t.D.REALTIME_TABLES);
  assert.equal(ch.status, 'SUBSCRIBED');
  await t.D.unsubscribeRealtime(); assert.equal(t.sb.channels.length, 0);
  t.D.subscribeRealtime(); assert.equal(t.sb.channels.length, 1);
});

test('a failed write reports an error and resyncs the slice', async () => {
  const rid = 'm202609', dbCount = () => t.sb.db.entries.filter(e => e.period_id === rid && e.owner_id === 'jal').length;
  t.sb.auth.setSession(null);                         // simulate a rejected insert (RLS)
  const evs = []; const off = t.D.onChange(e => evs.push(e));
  t.D.addEntry(rid, 'jal', 'B2s2');
  assert.equal(t.C.rowById(t.D.S, rid).cells.jal.entries.length, dbCount() + 1, 'optimistic');
  await t.flush(); await sleep(200); off();
  assert.ok(evs.some(e => e.type === 'error' && /not authenticated/.test(e.message)), JSON.stringify(evs));
  assert.equal(t.C.rowById(t.D.S, rid).cells.jal.entries.length, dbCount(), 'optimistic entry rolled back by the resync');
  /* an update that changes no row (RLS filters silently) is reported too */
  const evs2 = []; const off2 = t.D.onChange(e => evs2.push(e));
  t.D.updateTask('B1s1', {weight: 99}); await t.flush(); await sleep(200); off2();
  assert.ok(evs2.some(e => e.type === 'error' && /nothing was saved/.test(e.message)));
  assert.equal(t.C.taskById(t.D.S, 'B1s1').weight, 10);
  t.sb.auth.setSession(t.USERS[0]);
});

/* ---------- resilient loading: one missing / forbidden table never blanks the app ---------- */
const PGRST_404 = {message: "Could not find the table 'public.audit_log' in the schema cache", code: '42P01', details: null, hint: null, status: 404};
async function withConsoleErrors(fn) { const orig = console.error, calls = []; console.error = (...a) => calls.push(a); try { await fn(); } finally { console.error = orig; } return calls; }
const diagRow = (t, name) => t.$(`#diagBody tr[data-probe="${name}"]`);
async function openDiag(t) { t.$('#syncPill').click(); await t.diag.lastRun; }

test('resilience (i): with every table OK the app renders and every probe passes', async () => {
  const t = await setup();
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 7);
  assert.ok(Object.values(t.D.loadStatus).every(v => v === null)); assert.equal(t.D.coreFailed(), false);
  assert.equal(t.$('#notice').hidden, true); assert.equal(t.text(t.$('#syncPill')), 'Live');
  await openDiag(t);
  assert.equal(t.$('#diagModal').hidden, false);
  assert.equal(t.$$('#diagBody tr').length, 12 + 2); assert.ok(t.$$('#diagBody tr').every(r => r.classList.contains('ok')));
  assert.ok(t.text(diagRow(t, 'my_owner_id()')).includes('"jal"')); assert.ok(t.text(diagRow(t, 'is_admin()')).includes('true'));
  assert.ok(t.text(t.$('#diagText')).startsWith('All 14 probes OK'));
  t.$('#diagClose').click(); assert.equal(t.$('#diagModal').hidden, true);
});

test('resilience (ii): audit_log missing (404 / 42P01) → tracker renders, report shows the notice, panel marks audit_log', async () => {
  let t; const errs = await withConsoleErrors(async () => { t = await setup({fail: {audit_log: PGRST_404}}); });
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 7, 'tracker rendered');
  assert.equal(t.$$('#trackerTable thead th[data-col]').length, 12);
  assert.deepEqual(t.D.S.audit, []); assert.equal(t.D.S.auditError.code, '42P01'); assert.equal(t.D.loadStatus.audit_log.status, 404);
  assert.ok(t.$('#auditBody [data-audit-unavailable]')); assert.ok(t.text(t.$('#auditBody')).startsWith('Audit log unavailable — run the MIGRATION block'));
  assert.equal(t.text(t.$('#syncPill')), 'Live', 'an optional table does not mean "Load failed"'); assert.equal(t.D.coreFailed(), false);
  assert.equal(t.$('#notice').hidden, true);
  assert.ok(t.text(t.$('#toast')).includes('Could not load audit_log'), 'toast');
  const logged = errs.find(a => /audit_log/.test(String(a[0]))); assert.ok(logged, 'full error logged'); assert.equal(logged[1].code, '42P01'); assert.equal(logged[1].status, 404); assert.equal(logged[1].table, 'audit_log');
  await openDiag(t);
  const row = diagRow(t, 'audit_log'); assert.ok(row.classList.contains('fail')); assert.ok(t.text(row).includes('ERROR')); assert.ok(t.text(row).includes('code 42P01')); assert.ok(t.text(row).includes('HTTP 404'));
  assert.ok(t.text(row).includes("Could not find the table 'public.audit_log'"));
  assert.ok(diagRow(t, 'owners').classList.contains('ok')); assert.ok(t.text(t.$('#diagText')).startsWith('1 of 14 probes failed'));
  /* once the table appears (migration run), a realtime/reload catch-up clears the notice */
  delete t.sb.fail.audit_log; t.D.onRealtime('audit_log'); await t.D.flushReload();
  assert.equal(t.D.S.auditError, null); assert.equal(t.$('#auditBody [data-audit-unavailable]'), null);
});

test('resilience (iii): an RLS error (42501) on one table degrades only that feature', async () => {
  const t = await setup({fail: {tasks: {message: 'permission denied for table tasks', code: '42501', details: null, hint: null, status: 403}}});
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 7); assert.equal(t.$$('#trackerTable .ocard').length, 84);
  assert.equal(t.C.allTasks(t.D.S).length, 0); assert.equal(t.$$('#taskSection .td-sub').length, 0, 'catalog empty, section still renders');
  assert.equal(t.$$('#taskSection .td-cat').length, 12, 'categories loaded independently');
  assert.ok(t.text(t.$('#trackerTable')).includes('Finance / controlling'), 'entries keep their task_name snapshot');
  assert.equal(t.D.loadStatus.tasks.code, '42501'); assert.equal(t.D.loadStatus.entries, null);
  assert.equal(t.text(t.$('#syncPill')), 'Live'); assert.equal(t.D.coreFailed(), false);
  await openDiag(t);
  assert.ok(diagRow(t, 'tasks').classList.contains('fail')); assert.ok(t.text(diagRow(t, 'tasks')).includes('permission denied for table tasks · code 42501'));
  assert.ok(t.text(diagRow(t, 'tasks')).includes('Last load:'));
  assert.ok(diagRow(t, 'entries').classList.contains('ok'));
});

test('resilience (iv): a missing-column error (42703) on one table degrades only that feature', async () => {
  const t = await setup({fail: {salaries: {message: 'column salaries.gross_eur does not exist', code: '42703', details: null, hint: 'Perhaps you meant to reference the column "salaries.gross".', status: 400}}});
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 7);
  const c = t.$('#trackerTable .ocard[data-card="m202512:hb"]'); assert.equal(c.querySelector('.pay select').value, '', 'no salary data');
  assert.ok(t.text(c.querySelector('.kv.sum')).includes('Σ hours 80.0'), 'entries still there');
  assert.equal(t.D.loadStatus.salaries.code, '42703'); assert.equal(t.text(t.$('#syncPill')), 'Live');
  await openDiag(t);
  const row = diagRow(t, 'salaries'); assert.ok(row.classList.contains('fail')); assert.ok(t.text(row).includes('code 42703')); assert.ok(t.text(row).includes('hint: Perhaps you meant'));
  assert.ok(diagRow(t, 'salary_rates').classList.contains('ok'));
});

test('resilience (v): an account not linked to any owner gets a read-only app with a notice, not a failure', async () => {
  const t = await setup({user: 'new@example.com'});
  assert.equal(t.document.body.classList.contains('locked'), false); assert.ok(t.D.S);
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 7);
  assert.equal(t.A.owner, null); assert.equal(t.D.me, null);
  assert.equal(t.$('#notice').hidden, false); assert.ok(t.text(t.$('#notice')).includes('not linked to an owner')); assert.ok(t.text(t.$('#notice')).includes('new@example.com'));
  assert.ok(t.$$('#trackerTable .ocard').every(c => c.classList.contains('ro'))); assert.ok(t.$$('#trackerTable .appr input').every(i => i.disabled));
  assert.equal(t.text(t.$('#syncPill')), 'Live');
  await openDiag(t);
  assert.ok(t.text(diagRow(t, 'my_owner_id()')).includes('null')); assert.ok(t.text(diagRow(t, 'is_admin()')).includes('false'));
});

test('resilience (vi): a failed core table (owners) shows "Load failed" and a notice, and still renders what loaded', async () => {
  const t = await setup({fail: {owners: {message: 'permission denied for table owners', code: '42501', status: 403}}});
  assert.equal(t.document.body.classList.contains('locked'), false); assert.ok(t.D.S);
  assert.equal(t.D.coreFailed(), true); assert.equal(t.text(t.$('#syncPill')), 'Load failed'); assert.equal(t.$('#syncPill').className, 'pill offline');
  assert.equal(t.$$('#trackerTable thead th[data-col]').length, 12, 'periods still rendered');
  assert.ok(t.text(t.$('#notice')).includes('Some data could not be loaded (owners)'));
});

test('status pill wording: Live / Offline / Load failed only', async () => {
  const t = await setup();
  const pill = () => ({text: t.text(t.$('#syncPill')), cls: t.$('#syncPill').className});
  assert.deepEqual(pill(), {text: 'Live', cls: 'pill online'});
  const ch = t.sb.channels[0];
  ch.setStatus('CHANNEL_ERROR'); assert.deepEqual(pill(), {text: 'Offline', cls: 'pill offline'});
  ch.setStatus('TIMED_OUT'); assert.equal(pill().text, 'Offline');
  ch.setStatus('SUBSCRIBED'); assert.deepEqual(pill(), {text: 'Live', cls: 'pill online'});
  /* an optional table failing on a reload does not change the wording */
  t.sb.fail.audit_log = {message: 'gone', code: '42P01'}; t.D.onRealtime('audit_log'); await t.D.flushReload();
  assert.equal(pill().text, 'Live'); delete t.sb.fail.audit_log;
  /* a core table failing on a reload does */
  t.sb.fail.entries = {message: 'permission denied for table entries', code: '42501'}; t.D.onRealtime('entries'); await t.D.flushReload();
  assert.deepEqual(pill(), {text: 'Load failed', cls: 'pill offline'});
  delete t.sb.fail.entries; t.D.onRealtime('entries'); await t.D.flushReload();
  assert.equal(pill().text, 'Live', 'recovers once the core table loads again');
  /* signed out */
  await t.A.signOut(); assert.deepEqual(pill(), {text: 'Offline', cls: 'pill local'});
  await t.A.signIn('jal@example.com', 'secret123'); await t.D.flushReload();
  assert.equal(pill().text, 'Live');
});
