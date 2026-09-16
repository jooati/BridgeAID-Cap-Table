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
