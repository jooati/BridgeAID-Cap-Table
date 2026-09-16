/* Pure calculation checks ported from the legacy app's behaviour. No DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';
import * as D from '../js/data.js';
import { createMockSupabase } from './mock-supabase.mjs';
import { makeDb, USERS } from './fixture.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} ≈ ${b}`);
async function load(example = true) { D.setClient(createMockSupabase({tables: makeDb({example}), users: USERS, session: USERS[0]})); return D.loadAll(); }

test('columns are newest month → oldest, then Incubation, then IP; chronological is the reverse', async () => {
  const S = await load();
  const ids = C.displayRows(S).map(r => r.id);
  assert.deepEqual(ids, ['m202609', 'm202608', 'm202607', 'm202606', 'm202605', 'm202604', 'm202603', 'm202602', 'm202601', 'm202512', 'incub', 'ip']);
  assert.deepEqual(C.chronoRows(S).map(r => r.id), ids.slice().reverse());
  assert.equal(C.currentYm(S), '2026-09');
  assert.equal(C.nextYm(S), '2026-10');
});

test('HB is last in every owner list; others A–Z with Hungarian collation', async () => {
  const S = await load();
  assert.deepEqual(C.sortedOwners(S).map(o => o.name), ['JAL', 'KÁ', 'KB', 'KD', 'SZB', 'VI', 'HB']);
  S.owners.push({id: 'aaa', name: 'AAA', baseline: 0, last: false}); S.owners.push({id: 'zzz', name: 'ZZZ', baseline: 0, last: false});
  const names = C.sortedOwners(S).map(o => o.name);
  assert.equal(names[0], 'AAA'); assert.equal(names[names.length - 1], 'HB'); assert.equal(names[names.length - 2], 'ZZZ');
});

test('card arithmetic: Σ hours × avgW = Σ weighted and W − paid_w = equity', async () => {
  const S = await load(); const comp = C.computeAll(S);
  let checked = 0;
  S.rows.forEach(r => C.sortedOwners(S).forEach(o => { const k = comp[r.id].cells[o.id];
    near(k.H * k.avgW, k.W, `${r.id}/${o.id} H×avgW`);
    near(k.W - k.paidW, k.equity, `${r.id}/${o.id} W−paidW`);
    if (k.H > 0) near(k.equity, k.W * (1 - Math.min(k.paidHours, k.H) / k.H), 'equity = W×(1−paid/H)');
    if (r.kind !== 'month') { assert.equal(k.paidHours, 0); assert.equal(k.market, 0); }
    checked++; }));
  assert.equal(checked, 12 * 7);
  /* a concrete card: HB in Dec 2025 — CEO €2,500 against a €7,500 market → 53.33 paid hours */
  const hb = comp.m202512.cells.hb;
  near(hb.market, 3000000 / 400); near(hb.paidHours, 2500 / 7500 * 160);
  near(hb.H, 80); near(hb.W, 50 * 6 + 30 * 9);
  near(hb.equity, hb.W * (1 - hb.paidHours / 80));
  /* KÁ in Dec: IT role with €0 salary → nothing deducted */
  near(comp.m202512.cells.ka.paidHours, 0); near(comp.m202512.cells.ka.equity, 90 * 9);
  /* paid hours above logged hours are capped and flagged */
  const r = C.rowById(S, 'm202609'); r.cells.vi.salary = 100000; const k = C.calcCell(S, r, 'vi');
  assert.equal(k.over, true); near(k.equity, 0); near(k.paidW, k.H * k.avgW);
});

test('shares sum to 100.00 in every period and cumulatively', async () => {
  const S = await load(); const comp = C.computeAll(S);
  S.rows.forEach(r => { const c = comp[r.id]; if (c.colTotal > 0) near(Object.values(c.cells).reduce((a, k) => a + k.monthly, 0), 100, r.id);
    if (c.cumTot > 0) near(Object.values(c.cumShare).reduce((a, v) => a + v, 0), 100, r.id + ' cum'); });
  const last = C.ownerCumulative(S);
  assert.equal(C.fmt(Object.values(last.cumShare).reduce((a, v) => a + v, 0)), '100.00');
});

test('cumulative totals run chronologically (IP → Incubation → months)', async () => {
  const S = await load(); const comp = C.computeAll(S); const rows = C.chronoRows(S);
  const run = {}; C.sortedOwners(S).forEach(o => run[o.id] = 0); let tot = 0;
  rows.forEach(r => { C.sortedOwners(S).forEach(o => { run[o.id] += comp[r.id].cells[o.id].equity; near(comp[r.id].cum[o.id], run[o.id], `${r.id}/${o.id}`); }); tot += comp[r.id].colTotal; near(comp[r.id].cumTot, tot); });
  near(comp.ip.cum.jal, comp.ip.cells.jal.equity);
  assert.ok(comp.m202609.cum.jal > comp.m202512.cum.jal);
  assert.deepEqual(C.ownerCumulative(S).cum, comp.m202609.cum);
});

test('salary table in force by month: Feb uses the Dec table, Mar uses a March table', async () => {
  const S = await load();
  S.salaryTables.push({id: 2, from: '2026-03', fx: 410, huf: {ceo: 3300000, coo: 2750000, cso: 2750000, civ: 2200000, it: 2200000}});
  assert.equal(C.tableFor(S, '2026-02').from, '2025-12');
  assert.equal(C.tableFor(S, '2026-03').from, '2026-03');
  assert.equal(C.tableFor(S, '2026-09').from, '2026-03');
  assert.equal(C.tableFor(S, '2025-11').from, '2025-12', 'before the first table → earliest');
  assert.equal(C.tableFor(S, null).from, '2026-03', 'no month → latest');
  near(C.roleEur(S, 'ceo', '2026-02'), 3000000 / 400); near(C.roleEur(S, 'ceo', '2026-03'), 3300000 / 410);
  const feb = C.calcCell(S, C.rowById(S, 'm202602'), 'hb'), mar = C.calcCell(S, C.rowById(S, 'm202603'), 'hb');
  near(feb.paidHours, 2500 / (3000000 / 400) * 160); near(mar.paidHours, 2500 / (3300000 / 410) * 160);
  assert.equal(C.roleEur(S, 'nope', '2026-03'), 0);
});

test('formatting: money €1,234,567.89, percentages 2 decimals, hours 1 decimal', () => {
  assert.equal(C.money(1234567.891), '€1,234,567.89'); assert.equal(C.money(0), '€0.00'); assert.equal(C.money(null), '€0.00');
  assert.equal(C.fmt(16.666), '16.67'); assert.equal(C.fmt1(2.25), '2.3'); assert.equal(C.fmt1(53.333), '53.3');
  assert.equal(C.parseMoney('€1,234.50'), 1234.5); assert.ok(isNaN(C.parseMoney('')));
  assert.equal(C.ymLabel('2026-03'), 'March 2026'); assert.equal(C.incYm('2025-12'), '2026-01'); assert.equal(C.decYm('2026-01'), '2025-12');
  assert.equal(C.esc('<b>&"'), '&lt;b&gt;&amp;&quot;');
});

test('invariants: 7 default owners, HB sort_last, baseline sums to 100, months Dec 2025 → Sep 2026', async () => {
  const S = await load(false);
  assert.equal(S.owners.length, 7); assert.equal(S.owners.find(o => o.id === 'hb').last, true);
  assert.equal(C.fmt(S.owners.reduce((a, o) => a + o.baseline, 0)), '100.00');
  const months = S.rows.filter(r => r.kind === 'month').map(r => r.ym).sort();
  assert.equal(months[0], '2025-12'); assert.equal(months[months.length - 1], '2026-09'); assert.equal(months.length, 10);
  const E = C.emptyState(); assert.equal(E.owners.length, 7); assert.equal(E.rows.length, 12);
});

test('legacy JSON: validate restores missing defaults, rejects foreign files, round-trips Save JSON', async () => {
  const S = await load(); const json = C.toLegacyJson(S);
  assert.equal(json.schema, 'bridgeaid-monthly-tracker'); assert.equal(json.rows[0].id, 'ip'); assert.equal(json.owners[json.owners.length - 1].id, 'hb');
  const back = C.validateLegacy(JSON.parse(JSON.stringify(json)));
  assert.equal(back.rows.length, 12); assert.equal(back.rows.find(r => r.id === 'm202512').cells.hb.entries[0].hours, 50);
  assert.equal(C.computeAll(back).m202609.cumShare.jal, C.computeAll(S).m202609.cumShare.jal);
  const stripped = JSON.parse(JSON.stringify(json)); stripped.owners = stripped.owners.filter(o => o.id !== 'hb'); stripped.rows = stripped.rows.filter(r => r.id !== 'm202605');
  const v = C.validateLegacy(stripped);
  assert.ok(v.owners.some(o => o.id === 'hb' && o.last)); assert.ok(v.rows.some(r => r.id === 'm202605'));
  assert.equal(C.validateLegacy({schema: 'something-else', rows: []}), null); assert.equal(C.validateLegacy('nope'), null); assert.equal(C.validateLegacy({}), null);
  /* v2 file shape: roles with huf + fx → one salary table from Dec 2025 */
  const v2 = C.validateLegacy({schema: 'bridgeaid-monthly-tracker', owners: json.owners, roles: [{id: 'ceo', name: 'CEO', huf: 3000000}], fx: 400, rows: json.rows});
  assert.equal(v2.salaryTables.length, 1); assert.equal(v2.salaryTables[0].from, '2025-12'); assert.equal(v2.salaryTables[0].huf.ceo, 3000000);
});

test('work log flattens every entry (chronological, HB last within a period)', async () => {
  const S = await load(); const rows = C.worklogRows(S);
  assert.equal(rows.length, 8 + 10 * 9);
  assert.equal(rows[0].period.id, 'ip'); assert.equal(rows[3].owner.id, 'hb');
  assert.equal(rows[rows.length - 1].period.id, 'm202609');
});
