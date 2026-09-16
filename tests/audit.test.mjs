/* Audit log: trigger-fed table, human-readable lines, filters, CSV, realtime. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, sleep } from './setup.mjs';

let t;
before(async () => { t = await setup(); });
const rowsShown = () => t.$$('#auditBody tbody tr');
const what = i => t.text(rowsShown()[i].querySelector('td.what'));
const refresh = async () => { t.sb.realtime.emit('audit_log'); await t.flush(); };
const card = (rid, oid) => t.$(`#trackerTable .ocard[data-card="${rid}:${oid}"]`);

test('the audit section starts empty and every change lands as a newest-first line', async () => {
  assert.ok(t.text(t.$('#auditBody')).includes('No changes recorded'));
  assert.ok(t.D.REALTIME_TABLES.includes('audit_log'), 'subscribed to audit_log');
  /* hours edit (own card) */
  const rid = 'm202609'; const inp = card(rid, 'jal').querySelector('table.mini input');
  t.setValue(inp, '15'); await t.flush(); inp.blur(); await refresh();
  assert.equal(t.D.S.audit.length, 1);
  const a = t.D.S.audit[0]; assert.equal(a.table, 'entries'); assert.equal(a.action, 'update'); assert.equal(a.actor, 'jal'); assert.equal(a.ownerId, 'jal'); assert.equal(a.periodId, rid);
  assert.equal(a.old.hours, 60 * (1 + 9 * 0.05)); assert.equal(a.new.hours, 15);
  assert.equal(what(0), "JAL: hours 87.0 → 15.0 on 'New public-sector client acquisition (ro…' in September 2026");
  assert.equal(t.text(rowsShown()[0].querySelector('td.who')), 'JAL'); assert.ok(rowsShown()[0].querySelector('.act.update'));
  assert.ok(t.text(rowsShown()[0].querySelector('details pre')).includes('"hours": 15'));
  assert.equal(t.sb.db.audit_log.filter(x => x.table_name === 'periods').length, 0, 'flag-only period updates are not logged');
  /* approval on behalf */
  const chk = card(rid, 'kd').querySelector('.appr input'); chk.checked = true; t.fire(chk, 'change'); await t.flush(); await refresh();
  assert.equal(what(0), 'JAL approved on behalf of KD — September 2026');
  /* editing the card again wipes that approval: logged as a removal */
  t.setValue(card(rid, 'jal').querySelector('table.mini input'), '16'); await t.flush(); card(rid, 'jal').querySelector('table.mini input').blur(); await refresh();
  assert.equal(what(0), "KD's approval of September 2026 withdrawn", 'the reset trigger fires after the audit trigger'); assert.equal(what(1), "JAL: hours 15.0 → 16.0 on 'New public-sector client acquisition (ro…' in September 2026");
  /* salary rate */
  const huf = t.$('#salaryTables input[data-act="setTableHuf"][data-rid="ceo"]'); t.setValue(huf, '3300000', 'change'); await t.flush(); await refresh();
  assert.equal(what(0), 'JAL changed CEO base salary 3,000,000 → 3,300,000 HUF in the table from 2025-12');
  /* salary block */
  const sel = card(rid, 'jal').querySelector('.pay select'); sel.value = 'ceo'; t.fire(sel, 'change'); await t.flush(); await refresh();
  assert.equal(what(0), 'JAL: role COO → CEO in September 2026');
  assert.equal(t.text(t.$('#auCount')), `${t.D.S.audit.length} of ${t.D.S.audit.length} changes`);
  assert.deepEqual(t.D.S.audit.map(x => x.id), [...t.D.S.audit.map(x => x.id)].sort((a, b) => b - a), 'newest first');
});

test('filters by period, owner (as subject or actor) and table; audit CSV follows the filter', async () => {
  const pSel = t.$('#auPeriod'), oSel = t.$('#auOwner'), tSel = t.$('#auTable');
  assert.deepEqual([...tSel.options].map(o => o.value), ['all', 'entries', 'salaries', 'approvals', 'salary_rates']);
  tSel.value = 'salary_rates'; t.fire(tSel, 'change');
  assert.equal(rowsShown().length, 1); assert.ok(what(0).includes('CEO base salary'));
  tSel.value = 'all'; oSel.value = 'kd'; t.fire(oSel, 'change');
  assert.equal(rowsShown().length, 2); assert.ok(rowsShown().every(r => /KD/.test(t.text(r))));
  oSel.value = 'all'; pSel.value = 'm202512'; t.fire(pSel, 'change');
  assert.equal(rowsShown().length, 0); assert.ok(t.text(t.$('#auditBody')).includes('No changes recorded'));
  pSel.value = 'm202609'; t.fire(pSel, 'change');
  assert.equal(rowsShown().length, t.D.S.audit.length - 1, 'everything but the salary-rate change happened in September');
  const csv = t.report.auditCSV(t.D.S, t.report.filteredAudit(t.D.S, {period: 'm202609', owner: 'all', table: 'all'})).split('\r\n');
  assert.equal(csv[0], 'When,Who,Action,Table,Key,Period,Owner,What,Old,New'); assert.equal(csv.length, t.D.S.audit.length);
  assert.ok(csv[1].includes(',JAL,update,salaries,m202609:jal,September 2026,JAL,JAL: role COO → CEO in September 2026,"{'), csv[1]);
  pSel.value = 'all'; t.fire(pSel, 'change');
  assert.ok(t.$('#rpTools [data-act="exportAuditCsv"]'), 'export button next to the other exports');
});

test('describeAudit covers master data, periods, owners and deletions', () => {
  const S = t.D.S, d = (table, action, old, nw, actor = 'ka') => t.report.describeAudit(S, {table, action, old, new: nw, actor});
  assert.equal(d('owners', 'update', {id: 'kb', name: 'KB', baseline_pct: 16.66, is_admin: false, auth_uid: null}, {id: 'kb', name: 'KB', baseline_pct: 16.67, is_admin: true, auth_uid: 'u-new'}), 'KÁ: KB baseline 16.66 → 16.67%, linked to a sign-in account, made admin');
  assert.equal(d('tasks', 'update', {id: 'B1s1', name: 'Site survey, bridge condition assessment, measurement plan', weight: 6}, {id: 'B1s1', name: 'Site survey, bridge condition assessment, measurement plan', weight: 7}), "KÁ: 'Site survey, bridge condition assessment…' weight 6.0 → 7.0");
  assert.equal(d('tasks', 'insert', null, {id: 'x', name: 'New task', weight: 1}), "KÁ added task 'New task' (weight 1.0)");
  assert.equal(d('periods', 'insert', null, {id: 'm202610', label: 'October 2026'}), 'KÁ added October 2026');
  assert.equal(d('periods', 'delete', {id: 'm202610', label: 'October 2026'}, null), 'KÁ removed October 2026');
  assert.equal(d('entries', 'delete', {period_id: 'm202609', owner_id: 'vi', task_name: 'Finance / controlling / cash-flow management', hours: 45}, null), "VI: removed 'Finance / controlling / cash-flow manage…' (45.0 h) from September 2026");
  assert.equal(d('entries', 'insert', null, {period_id: 'ip', owner_id: 'hb', task_id: 'B7s1', task_name: null}), "HB: logged 'Settling the BME-IP chain (assignment / …' in Intellectual property");
  assert.equal(d('salaries', 'update', {period_id: 'm202601', owner_id: 'vi', role_id: 'it', gross_eur: 1000}, {period_id: 'm202601', owner_id: 'vi', role_id: 'it', gross_eur: 1250}), 'VI: salary €1,000.00 → €1,250.00 in January 2026');
  assert.equal(d('approvals', 'insert', null, {period_id: 'm202601', owner_id: 'vi', approved_by: 'vi'}), 'VI approved January 2026');
  assert.equal(d('salary_tables', 'update', {id: 1, effective_from: '2025-12-01', fx_huf_eur: 400}, {id: 1, effective_from: '2025-12-01', fx_huf_eur: 410}), 'KÁ changed HUF→EUR 400.00 → 410.00 in the table from 2025-12');
  assert.equal(d('roles', 'update', {id: 'it', name: 'IT engineer'}, {id: 'it', name: 'Software engineer'}), 'KÁ renamed role IT engineer → Software engineer');
  assert.equal(d('task_categories', 'delete', {id: 'P5', name: 'Operations (recurring)'}, null), "KÁ removed category 'Operations (recurring)'");
  assert.equal(d('owners', 'delete', {id: 'x', name: 'Temp'}, null, null), 'system removed owner Temp');
});

test('clients cannot write the audit log; a realtime event reloads it live', async () => {
  const {error} = await t.sb.from('audit_log').insert({action: 'insert', table_name: 'entries'});
  assert.ok(error && /permission denied/.test(error.message));
  const n = t.D.S.audit.length;
  t.sb.db.audit_log.push({id: 999, at: new Date().toISOString(), actor: 'kd', action: 'insert', table_name: 'entries', row_key: '999', period_id: 'm202609', owner_id: 'kd', old: null, new: {period_id: 'm202609', owner_id: 'kd', task_name: 'Site survey', hours: 0}});
  t.sb.realtime.emit('audit_log'); await sleep(250);
  assert.equal(t.D.S.audit.length, n + 1); assert.equal(t.D.S.audit[0].id, 999);
  assert.equal(what(0), "KD: logged 'Site survey' in September 2026");
});
