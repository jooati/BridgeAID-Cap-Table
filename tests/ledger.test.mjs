/* Ledger guard: the weight snapshot of an entry is set by the database, not by the client
   (guard_entry_snapshot() in supabase/schema.sql, emulated by the mock). */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, sleep } from './setup.mjs';

let t;
before(async () => { t = await setup({user: 'kd@example.com'}); });
const mine = () => t.sb.db.entries.filter(e => e.period_id === 'm202609' && e.owner_id === 'kd');

test('an owner cannot choose the weight of a new entry: the server copies it from the task catalog', async () => {
  assert.equal(t.A.isAdmin, false);
  const {data, error} = await t.sb.from('entries').insert({period_id: 'm202609', owner_id: 'kd', task_id: 'B6s4', task_name: 'Something else', hours: 5, weight_snapshot: 99}).select().single();
  assert.equal(error, null);
  assert.equal(data.weight_snapshot, 2, 'catalog weight of B6s4, not the 99 the client sent'); assert.equal(data.task_name, 'PR, press, social media, brand building');
  assert.equal(mine().at(-1).weight_snapshot, 2);
  const bad = await t.sb.from('entries').insert({period_id: 'm202609', owner_id: 'kd', task_id: 'no-such-task', hours: 1, weight_snapshot: 50});
  assert.equal(bad.error.code, '23514'); assert.equal(mine().length, 2);
});

test('an owner can change the hours of a logged entry, but not its weight snapshot or task', async () => {
  const e = mine()[0], w0 = e.weight_snapshot;
  const ok = await t.sb.from('entries').update({hours: 12}).eq('id', e.id).select(); assert.equal(ok.error, null); assert.equal(e.hours, 12);
  for (const patch of [{weight_snapshot: 50}, {task_id: 'B1s1'}, {task_name: 'x'}, {hours: 1, weight_snapshot: 50}]) {
    const r = await t.sb.from('entries').update(patch).eq('id', e.id).select();
    assert.equal(r.error.code, '42501', JSON.stringify(patch)); assert.match(r.error.message, /only an admin may change/);
  }
  assert.equal(e.weight_snapshot, w0); assert.equal(e.hours, 12); assert.equal(e.task_id, 'P3s2');
  /* sending the unchanged snapshot along with new hours is fine */
  const same = await t.sb.from('entries').update({hours: 13, weight_snapshot: w0}).eq('id', e.id).select(); assert.equal(same.error, null); assert.equal(e.hours, 13);
});

test('the app adopts the server-side snapshot when its own catalog is stale', async () => {
  t.sb.db.tasks.find(x => x.id === 'B2s2').weight = 11;                      // an admin changed the weight; this client has not reloaded yet
  assert.equal(t.C.taskById(t.D.S, 'B2s2').weight, 9);
  t.D.addEntry('m202609', 'kd', 'B2s2');
  const local = t.C.rowById(t.D.S, 'm202609').cells.kd.entries.at(-1); assert.equal(local.weight, 9, 'optimistic value');
  await t.D.flushPending();
  assert.equal(local.weight, 11, 'replaced by what the database stored'); assert.equal(typeof local.id, 'number');
  assert.equal(t.sb.db.entries.find(x => x.id === local.id).weight_snapshot, 11);
  await sleep(0); t.app.renderAll();
  const card = t.$('#trackerTable .ocard[data-card="m202609:kd"]'); assert.ok(t.text(card).includes('×11.0'));
});

test('an admin may correct a snapshot; the refusal reaches a Hungarian user in Hungarian', async () => {
  const e = mine()[0];
  t.I.setLang('hu');
  const evs = []; const off = t.D.onChange(ev => evs.push(ev));
  /* a tampered client: same call path as the app, but with a foreign weight */
  const r = await t.sb.from('entries').update({weight_snapshot: 77}).eq('id', e.id).select();
  assert.equal(t.I.tr(r.error.message), 'rögzített bejegyzés feladatát vagy eltárolt súlyát csak admin módosíthatja');
  off(); t.I.setLang('en');
  await t.A.signOut(); await t.A.signIn('jal@example.com', 'secret123'); await t.D.flushReload();
  assert.equal(t.A.isAdmin, true);
  const adm = await t.sb.from('entries').update({weight_snapshot: 7.5}).eq('id', e.id).select(); assert.equal(adm.error, null); assert.equal(e.weight_snapshot, 7.5);
  const ins = await t.sb.from('entries').insert({period_id: 'm202609', owner_id: 'kd', task_id: 'B6s4', task_name: 'PR', hours: 1, weight_snapshot: 3}).select().single();
  assert.equal(ins.data.weight_snapshot, 3, 'admins are not restricted');
  /* both changes are in the audit log with old and new values */
  const log = t.sb.db.audit_log.filter(a => a.table_name === 'entries' && a.row_key === String(e.id) && a.action === 'update');
  assert.ok(log.some(a => a.actor === 'jal' && a.new.weight_snapshot === 7.5 && a.old.weight_snapshot === 8));
});
