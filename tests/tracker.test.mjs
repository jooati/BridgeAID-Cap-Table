/* Tracker tab in jsdom, signed in as JAL (admin). */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, sleep } from './setup.mjs';

let t;
before(async () => { t = await setup(); });
const card = (rid, oid) => t.$(`#trackerTable .ocard[data-card="${rid}:${oid}"]`);
const colHead = rid => t.$(`#trackerTable thead th[data-col="${rid}"]`);
const status = rid => t.text(colHead(rid).querySelector('.st'));

test('columns newest → oldest then Incubation, IP; the newest month is the current one', () => {
  const ids = t.$$('#trackerTable thead th[data-col]').map(th => th.dataset.col);
  assert.deepEqual(ids, t.C.displayRows(t.D.S).map(r => r.id));
  assert.equal(ids[0], 'm202609'); assert.equal(ids.at(-2), 'incub'); assert.equal(ids.at(-1), 'ip');
  assert.ok(colHead('m202609').querySelector('.colhead').classList.contains('cur'));
  assert.equal(t.text(colHead('m202609').querySelector('.kind')), 'Current month');
  assert.ok(colHead('ip').querySelector('.colhead').classList.contains('special'));
});

test('HB is the last row; the bars and legend list HB last too', () => {
  const owners = t.$$('#trackerTable tbody tr[data-owner]').map(tr => tr.dataset.owner);
  assert.deepEqual(owners, ['jal', 'ka', 'kb', 'kd', 'szb', 'vi', 'hb']);
  const legend = t.$$('#bars .bar-legend span:not(.bar-warn)').map(s => t.text(s));
  assert.equal(legend.at(-1), 'HB');
  assert.equal(t.$$('#bars .bar-row').length, 2);
  assert.ok(t.text(t.$('#bars')).includes('Baseline ownership') && t.text(t.$('#bars')).includes('Current cumulative equity share'));
  assert.equal(t.$('#bars .bar-warn'), null, 'baseline sums to 100 → no warning');
});

test('cards show the legacy arithmetic lines with the computed numbers', () => {
  const comp = t.C.computeAll(t.D.S), k = comp.m202512.cells.hb, c = card('m202512', 'hb');
  const f1 = t.C.fmt1;
  const sum = t.text(c.querySelector('.kv.sum')); assert.ok(sum.includes(`Σ hours ${f1(k.H)} × avg. weight ${f1(k.avgW)} =`) && sum.includes(`Σ weighted ${f1(k.W)}`), sum);
  const eq = t.text(c.querySelector('.kv.eq')); assert.ok(eq.includes(`${f1(k.W)} − ${f1(k.paidW)} =`) && eq.includes(`Equity hours ${f1(k.equity)}`), eq);
  assert.ok(t.text(c.querySelector('.kv.paid')).includes(`${f1(k.paidHours)} h × avg. weight ${f1(k.avgW)} = ${f1(k.paidW)}`));
  assert.ok(t.text(c.querySelector('.kv.rule:not(.sum)')).includes(`${t.C.fmt(k.monthly)}%`));
  assert.equal(c.querySelector('.pay input').value, '€2,500.00');
  assert.equal(c.querySelector('.pay select').value, 'ceo');
  assert.equal(c.querySelectorAll('table.mini tbody tr').length, 2);
  /* special periods: points, no salary block */
  const ip = card('ip', 'jal'); assert.equal(ip.querySelector('.payblk'), null); assert.ok(t.text(ip.querySelector('.kv.sum')).startsWith('Σ points'));
  /* cumulative share in the row head */
  const last = t.C.ownerCumulative(t.D.S);
  assert.equal(t.text(t.$('#trackerTable tr[data-owner="hb"] .cumv')), t.C.fmt(last.cumShare.hb) + '%');
  assert.equal(t.text(colHead('m202512').querySelector('.tot')), `Equity hours in period ${f1(comp.m202512.colTotal)}`);
});

test('collapse / expand columns; the current month never collapses; state persists in localStorage', () => {
  const collapsedCols = () => t.$$('#trackerTable thead th.col-collapsed').map(th => th.dataset.col);
  assert.equal(collapsedCols().length, 10, 'first visit: current + previous month open');
  assert.ok(!collapsedCols().includes('m202609') && !collapsedCols().includes('m202608'));
  colHead('m202608').querySelector('[data-act="toggleCol"].arrowbtn').click();
  assert.ok(collapsedCols().includes('m202608'));
  assert.equal(t.$$('#trackerTable tbody td.col-collapsed[data-col="m202608"]').length, 7);
  colHead('m202608').querySelector('.vlbl').click();
  assert.ok(!collapsedCols().includes('m202608'));
  t.$('#trackerTools [data-act="expandAll"]').click(); assert.equal(collapsedCols().length, 0);
  t.$('#trackerTools [data-act="collapseOlder"]').click(); assert.equal(collapsedCols().length, 11);
  assert.equal(colHead('m202609').querySelector('.arrowbtn'), null, 'current month has no collapse button');
  t.tracker.toggleCol('m202609'); assert.ok(!collapsedCols().includes('m202609'));
  assert.equal(JSON.parse(t.window.localStorage.getItem('bridgeaid:tracker:collapsed')).length, 11);
  t.$('#trackerTools [data-act="expandAll"]').click();
});

test('approving, then editing hours clears every approval on the period and flags it (DB + UI)', async () => {
  const rid = 'm202608';
  assert.equal(status(rid), 'Pending');
  const chk = card(rid, 'jal').querySelector('.appr input');
  assert.equal(chk.disabled, false); assert.equal(card(rid, 'kd').querySelector('.appr input').disabled, true, 'only your own tick');
  chk.checked = true; t.fire(chk, 'change'); await t.flush();
  assert.equal(status(rid), 'Approved 1/7');
  assert.ok(t.sb.db.approvals.some(a => a.period_id === rid && a.owner_id === 'jal'));
  assert.ok(card(rid, 'jal').classList.contains('final') === false);
  const inp = card(rid, 'jal').querySelector('table.mini input');
  t.setValue(inp, '77'); await t.flush();
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 77);
  assert.equal(t.sb.db.approvals.filter(a => a.period_id === rid).length, 0, 'DB trigger wiped the approvals');
  assert.equal(t.sb.db.periods.find(p => p.id === rid).needs_reapproval, true);
  assert.equal(t.D.S.rows.find(r => r.id === rid).approvals.jal, undefined);
  t.app.renderAll();
  assert.equal(status(rid), 'Re-approval needed');
  assert.ok(t.text(colHead(rid).querySelector('.audit-line')).startsWith('edited by JAL'));
  assert.equal(card(rid, 'jal').querySelector('table.mini input').value, '77');
  /* approving again as the only owner keeps the flag until everybody approved */
  const chk2 = card(rid, 'jal').querySelector('.appr input'); chk2.checked = true; t.fire(chk2, 'change'); await t.flush();
  assert.equal(status(rid), 'Re-approval needed');
  chk2.checked = false; t.fire(card(rid, 'jal').querySelector('.appr input'), 'change'); await t.flush();
});

test('finalised periods are read-only; an admin can reopen them', async () => {
  const rid = 'm202607';
  assert.equal(status(rid), 'Finalised');
  const c = card(rid, 'jal'); assert.ok(c.classList.contains('final') && c.classList.contains('ro'));
  assert.equal(c.querySelector('table.mini input').disabled, true);
  assert.equal(t.D.setHours(rid, 'jal', 0, 5), undefined);
  assert.equal(t.D.S.rows.find(r => r.id === rid).cells.jal.entries[0].hours, 60 * (1 + 7 * 0.05));
  const btn = colHead(rid).querySelector('[data-act="reopenRow"]'); assert.ok(btn, 'admin sees Reopen');
  btn.click(); await t.flush();
  assert.equal(t.env.confirms.at(-1), 'Reopen this finalised period? All approvals will be cleared.');
  assert.equal(status(rid), 'Re-approval needed');
  assert.equal(t.sb.db.approvals.filter(a => a.period_id === rid).length, 0);
  assert.equal(card(rid, 'jal').querySelector('table.mini input').disabled, false);
});

test('autocomplete adds an entry with the current weight snapshot; a later weight change affects new entries only', async () => {
  const rid = 'm202609', c = card(rid, 'jal'), inp = c.querySelector('.addent input');
  t.setValue(inp, 'public-sector');
  const items = c.querySelectorAll('.ac .ac-item'); assert.ok(items.length >= 1); assert.equal(c.querySelector('.ac').hidden, false);
  assert.equal(items[0].dataset.tid, 'B1s1');
  t.fire(items[0], 'mousedown'); await t.flush();
  const entries = t.D.S.rows.find(r => r.id === rid).cells.jal.entries;
  assert.equal(entries.length, 3); assert.equal(entries[2].taskId, 'B1s1'); assert.equal(entries[2].weight, 10); assert.equal(entries[2].hours, 0);
  const dbE = t.sb.db.entries.filter(e => e.period_id === rid && e.owner_id === 'jal'); assert.equal(dbE.length, 3); assert.equal(dbE[2].weight_snapshot, 10); assert.equal(typeof entries[2].id, 'number');
  /* weight change on the Tasks tab → existing snapshot unchanged, new entry gets the new weight */
  const w = t.$('#taskSection input[data-act="taskWeight"][data-tid="B1s1"]'); t.setValue(w, '12'); await t.flush();
  assert.equal(t.sb.db.tasks.find(x => x.id === 'B1s1').weight, 12);
  assert.equal(t.sb.db.entries.find(e => e.id === dbE[2].id).weight_snapshot, 10);
  t.app.renderAll();
  assert.equal(t.D.S.rows.find(r => r.id === rid).cells.jal.entries[2].weight, 10);
  const inp2 = card(rid, 'jal').querySelector('.addent input'); t.setValue(inp2, 'public-sector');
  t.fire(inp2, 'keydown', {key: 'Enter'}); await t.flush();
  const e4 = t.D.S.rows.find(r => r.id === rid).cells.jal.entries[3]; assert.equal(e4.weight, 12);
  /* remove it again */
  card(rid, 'jal').querySelectorAll('[data-act="delEntry"]')[3].click(); await t.flush();
  assert.equal(t.D.S.rows.find(r => r.id === rid).cells.jal.entries.length, 3);
  assert.equal(t.sb.db.entries.filter(e => e.period_id === rid && e.owner_id === 'jal').length, 3);
});

test('role and salary edits are upserted; the paid-hours line follows the table in force', async () => {
  const rid = 'm202609', c = card(rid, 'jal');
  const sel = c.querySelector('.pay select'); sel.value = 'ceo'; t.fire(sel, 'change'); await t.flush();
  const sal = card(rid, 'jal').querySelector('.pay input'); t.setValue(sal, '3,750', 'change'); await t.flush();
  const row = t.sb.db.salaries.find(s => s.period_id === rid && s.owner_id === 'jal');
  assert.equal(row.role_id, 'ceo'); assert.equal(row.gross_eur, 3750);
  const k = t.C.calcCell(t.D.S, t.C.rowById(t.D.S, rid), 'jal');
  assert.ok(Math.abs(k.paidHours - 3750 / 7500 * 160) < 1e-9);
  assert.ok(t.text(card(rid, 'jal').querySelector('.kv.paid')).includes(t.C.fmt1(k.paidHours) + ' h'));
  assert.equal(card(rid, 'jal').querySelector('.pay input').value, '€3,750.00');
});

test('Enter saves the hours and moves to the next hours field (blur after the last); Escape restores the previous value', async () => {
  const rid = 'm202608', inputs = () => [...card(rid, 'jal').querySelectorAll('input[data-act="setHours"]')];
  assert.equal(inputs().length, 2);
  const first = inputs()[0], second = inputs()[1];
  first.focus(); t.setValue(first, '33'); t.fire(first, 'keydown', {key: 'Enter'}); await sleep(20);
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 33, 'saved on Enter without waiting for the debounce');
  assert.equal(t.document.activeElement, second, 'focus moved to the next hours field of the card');
  assert.ok(second.isConnected, 'the card was not re-rendered under the moving focus');
  t.setValue(second, '44'); t.fire(second, 'keydown', {key: 'Enter'}); await sleep(20);
  assert.notEqual(t.document.activeElement, second, 'last field → blurred');
  assert.equal(t.sb.db.entries.filter(e => e.period_id === rid && e.owner_id === 'jal')[1].hours, 44);
  assert.equal(inputs()[1].value, '44'); assert.equal(inputs()[0].value, '33', 're-rendered after the blur');
  /* Escape */
  const inp = inputs()[0]; inp.focus(); t.setValue(inp, '99');
  assert.equal(t.C.rowById(t.D.S, rid).cells.jal.entries[0].hours, 99);
  t.fire(inp, 'keydown', {key: 'Escape'}); await t.flush();
  assert.equal(inp.value, '33'); assert.equal(t.C.rowById(t.D.S, rid).cells.jal.entries[0].hours, 33);
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 33);
  inp.blur();
  /* salary EUR field: Enter commits, Escape restores */
  const sal = card(rid, 'jal').querySelector('.pay input'); sal.focus(); t.setValue(sal, '2,000'); t.fire(sal, 'keydown', {key: 'Enter'}); await t.flush();
  assert.equal(t.sb.db.salaries.find(s => s.period_id === rid && s.owner_id === 'jal').gross_eur, 2000);
  const sal2 = card(rid, 'jal').querySelector('.pay input'); assert.equal(sal2.value, '€2,000.00');
  sal2.focus(); sal2.value = '5'; t.fire(sal2, 'keydown', {key: 'Escape'}); assert.equal(sal2.value, '€2,000.00');
  const writes = t.sb.writes.length; t.fire(sal2, 'change'); await t.flush();
  assert.equal(t.sb.writes.length, writes, 'an unchanged salary is not written again');
  sal2.blur();
});

test('a Realtime reload never overwrites the input being typed in; it renders after blur', async () => {
  const rid = 'm202609'; const inp = card(rid, 'jal').querySelector('table.mini input');
  inp.focus(); assert.equal(t.document.activeElement, inp);
  t.setValue(inp, '12.5');                                     // debounced write pending
  t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'kd').hours = 999;   // someone else changed their card
  t.sb.realtime.emit('entries'); await sleep(250);
  assert.equal(t.document.activeElement, inp, 'not re-rendered while typing');
  assert.equal(inp.value, '12.5');
  assert.notEqual(t.D.S.rows.find(r => r.id === rid).cells.kd.entries[0].hours, 999, 'reload deferred while a write is pending');
  await t.flush();
  assert.equal(t.sb.db.entries.find(e => e.period_id === rid && e.owner_id === 'jal').hours, 12.5);
  assert.equal(t.D.S.rows.find(r => r.id === rid).cells.kd.entries[0].hours, 999, 'reloaded after the write');
  assert.equal(t.document.activeElement, inp, 'still not re-rendered');
  inp.blur(); await sleep(0);
  assert.notEqual(t.document.activeElement, inp);
  assert.equal(card(rid, 'kd').querySelector('table.mini input').value, '999');
  assert.equal(card(rid, 'jal').querySelector('table.mini input').value, '12.5');
});

test('admin adds months one at a time; only months after Sep 2026 without approvals can be removed', async () => {
  t.$('#trackerTools [data-act="addMonth"]').click(); await t.flush();
  assert.equal(t.$$('#trackerTable thead th[data-col]')[0].dataset.col, 'm202610');
  assert.ok(t.sb.db.periods.some(p => p.id === 'm202610' && p.ym === '2026-10' && p.label === 'October 2026'));
  assert.equal(t.text(colHead('m202610').querySelector('.kind')), 'Current month');
  assert.equal(colHead('m202609').querySelector('[data-act="removeRow"]'), null, 'default months cannot be removed');
  t.$('#trackerTools [data-act="addMonth"]').click(); await t.flush();
  assert.equal(t.C.currentYm(t.D.S), '2026-11');
  const rm = colHead('m202610').querySelector('[data-act="removeRow"]'); assert.ok(rm, 'an added, unapproved, non-current month is removable');
  rm.click(); await t.flush();
  assert.equal(t.env.confirms.at(-1), 'Remove October 2026? Its entries will be deleted.');
  assert.equal(t.sb.db.periods.some(p => p.id === 'm202610'), false);
  assert.deepEqual(t.$$('#trackerTable thead th[data-col]').slice(0, 2).map(x => x.dataset.col), ['m202611', 'm202609']);
  assert.equal(t.$('#trackerTable thead th[data-col="m202611"] .colhead').classList.contains('cur'), true);
  assert.equal(t.$('#tab-tracker').hidden, false);
});
