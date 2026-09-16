import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './setup.mjs';

test('app boots against the mock and renders all four tabs', async () => {
  const t = await setup();
  assert.equal(t.document.body.classList.contains('locked'), false);
  assert.ok(t.D.S, 'state loaded');
  assert.equal(t.D.S.owners.length, 7);
  assert.equal(t.D.S.rows.length, 12);
  assert.ok(t.$('#trackerTable tbody tr'), 'tracker rendered');
  assert.ok(t.$('#taskSection .td-group'), 'tasks rendered');
  assert.ok(t.$('#salaryTables tbody tr'), 'salary matrix rendered');
  assert.ok(t.$('#ownerList .own-row'), 'owners rendered');
  assert.ok(t.$('#reportBody table'), 'report rendered');
  assert.equal(t.text(t.$('#loginLbl')), 'JAL');
  assert.equal(t.$('#adminBadge').hidden, false);
  assert.equal(t.$('#syncPill').className, 'pill online');
  assert.equal(t.$('#tab-tracker').hidden, false);
  assert.equal(t.$('#tab-owners').hidden, true);
});
