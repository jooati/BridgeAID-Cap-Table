/* Owner vs admin rights in the UI, and the Owners ↔ users panel. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, sleep } from './setup.mjs';

let t;
before(async () => { t = await setup({user: 'kd@example.com'}); });
const card = (rid, oid) => t.$(`#trackerTable .ocard[data-card="${rid}:${oid}"]`);

test('non-admin: master data read-only, admin-only buttons hidden', () => {
  assert.equal(t.A.isAdmin, false);
  assert.ok(t.$$('.admin-only').every(el => el.hidden));
  assert.ok(t.$('#taskSection').classList.contains('ro-master'));
  assert.ok(t.$$('#taskSection input').every(i => i.disabled)); assert.ok(t.$$('#taskSection input').length > 60);
  assert.ok(t.$('#salaryTables').classList.contains('ro-master'));
  assert.ok(t.$$('#salaryTables input, #salaryTables select').every(i => i.disabled));
  assert.equal(t.$('#salaryTables [data-act="delRole"]'), null);
  assert.ok(t.$$('#ownerList input').every(i => i.disabled));
  assert.equal(t.$('#ownerList select[data-act="linkOwner"]'), null);
  assert.ok(t.text(t.$('#ownerList .own-row[data-oid="kd"] .linked')).includes('linked to a sign-in account'));
  assert.ok(t.text(t.$('#ownerList .own-row[data-oid="kb"] .linked')).includes('not linked'));
  assert.equal(t.$('#roleNote').hidden, false);
  assert.ok(t.text(t.$('#taskSection')).includes('read-only'));
});

test('non-admin: only the own card is editable, only the own approval tick is enabled', async () => {
  const rid = 'm202609';
  assert.equal(card(rid, 'kd').classList.contains('ro'), false); assert.equal(card(rid, 'kd').querySelector('table.mini input').disabled, false);
  assert.ok(card(rid, 'jal').classList.contains('ro')); assert.ok(card(rid, 'jal').querySelector('table.mini input').disabled);
  assert.ok(card(rid, 'jal').querySelector('.addent input').disabled); assert.ok(card(rid, 'jal').querySelector('.pay select').disabled);
  assert.equal(card(rid, 'kd').querySelector('.appr input').disabled, false); assert.equal(t.text(card(rid, 'kd').querySelector('.appr')), 'Approve this month');
  assert.ok(card(rid, 'jal').querySelector('.appr input').disabled); assert.equal(t.text(card(rid, 'jal').querySelector('.appr')), 'Not yet approved');
  assert.equal(t.$('#trackerTable [data-act="reopenRow"]'), null, 'no Reopen for owners');
  assert.equal(t.$('#trackerTable [data-act="removeRow"]'), null);
  /* editing the own card writes; trying another card is refused before any write */
  const before = t.sb.writes.length;
  t.setValue(card(rid, 'kd').querySelector('table.mini input'), '71'); await t.flush();
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'kd').hours, 71);
  t.tracker.setHours(rid, 'jal', 0, 5); await t.flush();
  assert.ok(t.text(t.$('#toast')).includes('only edit your own card'));
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 60 * (1 + 9 * 0.05));
  assert.equal(t.sb.writes.slice(before).filter(w => w.rows.some(r => r.owner_id === 'jal')).length, 0);
  /* approving as somebody else is refused */
  t.tracker.setApproval(rid, 'jal', true); assert.ok(t.text(t.$('#toast')).includes('only approve as yourself'));
  assert.equal(t.sb.db.approvals.some(a => a.period_id === rid), false);
  /* master-data writes are refused by RLS even if attempted directly, and the UI resyncs */
  t.D.updateTask('B1s1', {weight: 99}); await t.flush(); await sleep(200);
  assert.equal(t.sb.db.tasks.find(x => x.id === 'B1s1').weight, 10);
  assert.equal(t.C.taskById(t.D.S, 'B1s1').weight, 10, 'local state resynced after the refused write');
  assert.ok(t.text(t.$('#toast')).includes('nothing was saved'), t.text(t.$('#toast')));
});

test('admin: Owners ↔ users panel links owners to auth accounts, toggles admin, refuses double links', async () => {
  await t.A.signOut(); await t.A.signIn('jal@example.com', 'secret123'); await sleep(20);
  assert.equal(t.A.isAdmin, true); assert.equal(t.$('#adminBadge').hidden, false);
  assert.ok(t.$$('.admin-only').every(el => !el.hidden));
  assert.equal(t.$('#taskSection').classList.contains('ro-master'), false);
  await sleep(20); t.owners.renderOwners(); await sleep(20);
  const sel = t.$('#ownerList .own-row[data-oid="kb"] select[data-act="linkOwner"]'); assert.ok(sel, 'admin sees the account dropdown');
  const emails = [...sel.options].map(o => o.textContent);
  assert.deepEqual(emails, ['— not linked —', 'jal@example.com', 'ka@example.com', 'kd@example.com', 'new@example.com']);
  assert.equal(t.$('#ownerList .own-row[data-oid="kd"] select').value, 'u-kd');
  sel.value = 'u-new'; t.fire(sel, 'change'); await t.flush();
  assert.equal(t.sb.db.owners.find(o => o.id === 'kb').auth_uid, 'u-new');
  assert.equal(t.$('#ownerList .own-row[data-oid="kb"] select').value, 'u-new');
  /* the same account cannot be linked twice */
  const sel2 = t.$('#ownerList .own-row[data-oid="vi"] select'); sel2.value = 'u-new'; t.fire(sel2, 'change'); await t.flush();
  assert.ok(t.text(t.$('#toast')).includes('already linked to KB'));
  assert.equal(t.sb.db.owners.find(o => o.id === 'vi').auth_uid, null);
  /* admin flag */
  const adm = t.$('#ownerList .own-row[data-oid="kd"] input[data-act="setAdmin"]'); adm.checked = true; t.fire(adm, 'change'); await t.flush();
  assert.equal(t.sb.db.owners.find(o => o.id === 'kd').is_admin, true);
  /* HB is last in the owner list */
  assert.equal(t.$$('#ownerList .own-row').at(-1).dataset.oid, 'hb');
  /* unlink */
  const sel3 = t.$('#ownerList .own-row[data-oid="kb"] select'); sel3.value = ''; t.fire(sel3, 'change'); await t.flush();
  assert.equal(t.sb.db.owners.find(o => o.id === 'kb').auth_uid, null);
});

test('admin: master data edits go to the database (tasks, roles, salary tables, owners)', async () => {
  t.setValue(t.$('#taskSection input[data-act="taskName"][data-tid="B6s4"]'), 'PR & press'); await t.flush();
  assert.equal(t.sb.db.tasks.find(x => x.id === 'B6s4').name, 'PR & press');
  t.$('#taskSection [data-act="addTask"][data-cid="P5"]').click(); await t.flush();
  assert.equal(t.sb.db.tasks.filter(x => x.category_id === 'P5').length, 4);
  const newTask = t.sb.db.tasks.find(x => x.category_id === 'P5' && x.name === 'New task'); assert.ok(newTask.id.startsWith('P5_x'));
  t.$(`#taskSection [data-act="delTask"][data-tid="${newTask.id}"]`).click(); await t.flush();
  assert.equal(t.sb.db.tasks.filter(x => x.category_id === 'P5').length, 3);
  t.$('#taskSection [data-act="addCat"][data-gid="proj"]').click(); await t.flush();
  assert.equal(t.sb.db.task_categories.filter(c => c.group_id === 'proj').length, 6);
  /* salary tables */
  t.$('#ownersBody [data-act="addSalaryTable"]').click(); await t.flush();
  assert.equal(t.sb.db.salary_tables.length, 2); assert.equal(t.sb.db.salary_tables[1].effective_from, '2026-01-01');
  assert.equal(t.sb.db.salary_rates.filter(r => r.table_id === t.sb.db.salary_tables[1].id).length, 5);
  const tid = t.D.S.salaryTables.find(x => x.from === '2026-01').id;
  const from = t.$(`#salaryTables select[data-act="setTableFrom"][data-tid="${tid}"]`); from.value = '2026-03'; t.fire(from, 'change'); await t.flush();
  assert.equal(t.sb.db.salary_tables.find(x => x.id === tid).effective_from, '2026-03-01');
  const fx = t.$(`#salaryTables input[data-act="setTableFx"][data-tid="${tid}"]`); t.setValue(fx, '410', 'change'); await t.flush();
  assert.equal(t.sb.db.salary_tables.find(x => x.id === tid).fx_huf_eur, 410);
  const huf = t.$(`#salaryTables input[data-act="setTableHuf"][data-tid="${tid}"][data-rid="ceo"]`); t.setValue(huf, '3300000', 'change'); await t.flush();
  assert.equal(t.sb.db.salary_rates.find(r => r.table_id === tid && r.role_id === 'ceo').gross_huf, 3300000);
  /* Enter commits a HUF field, Escape restores it */
  const huf2 = t.$(`#salaryTables input[data-act="setTableHuf"][data-tid="${tid}"][data-rid="coo"]`); huf2.focus(); huf2.value = '2900000'; t.fire(huf2, 'keydown', {key: 'Enter'}); await t.flush();
  assert.equal(t.sb.db.salary_rates.find(r => r.table_id === tid && r.role_id === 'coo').gross_huf, 2900000);
  const huf3 = t.$(`#salaryTables input[data-act="setTableHuf"][data-tid="${tid}"][data-rid="coo"]`); huf3.focus(); huf3.value = '1'; t.fire(huf3, 'keydown', {key: 'Escape'});
  assert.equal(huf3.value, '2900000'); const w0 = t.sb.writes.length; t.fire(huf3, 'change'); await t.flush(); assert.equal(t.sb.writes.length, w0, 'no write for an unchanged rate');
  const fx2 = t.$(`#salaryTables input[data-act="setTableFx"][data-tid="${tid}"]`); fx2.focus(); fx2.value = '405'; t.fire(fx2, 'keydown', {key: 'Enter'}); await t.flush();
  assert.equal(t.sb.db.salary_tables.find(x => x.id === tid).fx_huf_eur, 405);
  t.setValue(t.$(`#salaryTables input[data-act="setTableFx"][data-tid="${tid}"]`), '410', 'change'); await t.flush();
  assert.equal(t.C.tableFor(t.D.S, '2026-02').from, '2025-12'); assert.equal(t.C.tableFor(t.D.S, '2026-03').fx, 410);
  assert.equal(t.$$('#salaryTables thead th[data-col]')[0].dataset.col, '2026-03', 'newest table first');
  /* roles */
  t.env.promptValue = 'Data scientist'; t.$('#ownersBody [data-act="addRole"]').click(); await t.flush();
  const role = t.sb.db.roles.find(r => r.name === 'Data scientist'); assert.ok(role); assert.equal(t.sb.db.salary_rates.filter(r => r.role_id === role.id).length, 2);
  t.$(`#salaryTables [data-act="delRole"][data-rid="${role.id}"]`).click(); await t.flush();
  assert.equal(t.sb.db.roles.some(r => r.id === role.id), false); assert.equal(t.sb.db.salary_rates.some(r => r.role_id === role.id), false);
  /* owners */
  const bl = t.$('#ownerList .own-row[data-oid="hb"] input[data-act="setBaseline"]'); t.setValue(bl, '5', 'change'); await t.flush();
  assert.equal(t.sb.db.owners.find(o => o.id === 'hb').baseline_pct, 5);
  assert.ok(t.text(t.$('#bars .bar-warn')).includes('Baseline sums to 105.00%'));
  t.setValue(t.$('#ownerList .own-row[data-oid="hb"] input[data-act="setBaseline"]'), '0', 'change'); await t.flush();
  assert.equal(t.$('#bars .bar-warn'), null);
  t.env.promptValue = 'New Owner'; t.$('#ownersBody [data-act="addOwner"]').click(); await t.flush();
  const no = t.sb.db.owners.find(o => o.name === 'New Owner'); assert.ok(no);
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').at(-1).dataset.owner, 'hb', 'HB still last');
  assert.equal(t.$$('#trackerTable tbody tr[data-owner]').length, 8);
  t.$(`#ownerList [data-act="removeOwner"][data-oid="${no.id}"]`).click(); await t.flush();
  assert.equal(t.sb.db.owners.length, 7);
  await t.flush();
  t.$('#ownersBody [data-act="delSalaryTable"]') && t.$('#ownersBody [data-act="delSalaryTable"]').click(); await t.flush();
  assert.equal(t.sb.db.salary_tables.length, 1);
});
