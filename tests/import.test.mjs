/* Legacy Save-JSON import (shared by the admin menu item and scripts/import-state.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './mock-supabase.mjs';
import { makeDb, USERS } from './fixture.mjs';
import * as C from '../js/calc.js';
import * as D from '../js/data.js';
import { importState } from '../js/import-state.js';

async function legacyFile() {
  D.setClient(createMockSupabase({tables: makeDb({example: true}), users: USERS, session: USERS[0]}));
  const S = await D.loadAll(); const json = C.toLegacyJson(S);
  json.rows.find(r => r.id === 'm202609').cells.jal.entries[0].hours = 123;          // a tweak we can look for
  json.rows.find(r => r.id === 'm202609').audit.needsReapproval = true;
  json.catalog.groups[0].categories[0].subs.push({id: 'B1_x1', name: 'Imported task', weight: 3});
  return json;
}

test('service-role import (script): master data merged, periods overwritten, approvals restored', async () => {
  const json = await legacyFile();
  const sb = createMockSupabase({tables: makeDb({example: false}), service: true});
  const log = [];
  const res = await importState(sb, json, {log: s => log.push(s)});
  assert.equal(res.entries, 98); assert.equal(res.approvals, 7 * 10); assert.equal(res.approvalsRestored, 70);
  assert.equal(sb.db.entries.length, 98); assert.equal(sb.db.entries.find(e => e.period_id === 'm202609' && e.owner_id === 'jal').hours, 123);
  assert.equal(sb.db.entries.find(e => e.period_id === 'm202609' && e.owner_id === 'jal').weight_snapshot, 10);
  assert.equal(sb.db.salaries.length, 70); assert.equal(sb.db.approvals.length, 70);
  assert.equal(sb.db.periods.find(p => p.id === 'm202609').needs_reapproval, true);
  assert.equal(sb.db.periods.find(p => p.id === 'm202512').needs_reapproval, false);
  assert.equal(sb.db.owners.find(o => o.id === 'jal').is_admin, true, 'admin flag and auth link untouched by the merge');
  assert.equal(sb.db.owners.find(o => o.id === 'jal').auth_uid, 'u-jal');
  assert.ok(sb.db.tasks.some(x => x.id === 'B1_x1' && x.weight === 3));
  assert.equal(sb.db.salary_tables.length, 1); assert.equal(sb.db.salary_rates.length, 5);
  assert.ok(log.some(l => /entries 98/.test(l)));
  /* re-import is idempotent */
  await importState(sb, json); assert.equal(sb.db.entries.length, 98); assert.equal(sb.db.approvals.length, 70);
  /* the imported DB computes the same shares as the source */
  D.setClient(sb); const S2 = await D.loadAll();
  const src = C.validateLegacy(json);
  assert.equal(C.fmt(C.ownerCumulative(S2).cumShare.jal), C.fmt(C.ownerCumulative(src).cumShare.jal));
});

test('admin import from the UI (anon key + RLS): approvals are cleared, everything else lands', async () => {
  const json = await legacyFile();
  const sb = createMockSupabase({tables: makeDb({example: true}), users: USERS, session: USERS[0]});
  const res = await importState(sb, json, {restoreApprovals: false});
  assert.equal(res.approvalsRestored, 0); assert.equal(sb.db.approvals.length, 0);
  assert.equal(sb.db.entries.length, 98); assert.equal(sb.db.entries.find(e => e.period_id === 'm202609' && e.owner_id === 'jal').hours, 123);
  assert.equal(sb.db.periods.find(p => p.id === 'm202607').needs_reapproval, false);
  /* a non-admin cannot import */
  const sb2 = createMockSupabase({tables: makeDb({example: true}), users: USERS, session: USERS[2]});
  await assert.rejects(() => importState(sb2, json, {restoreApprovals: false}), /row-level security/);
  await assert.rejects(() => importState(sb, {schema: 'x'}), /Not a BridgeAID tracker file/);
});
