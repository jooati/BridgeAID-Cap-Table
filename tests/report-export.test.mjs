/* Work log & task report, CSV sections, PDF print document. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './setup.mjs';

let t;
before(async () => { t = await setup(); });

test('full CSV has every section in order, owners HB last, one summary row per period × owner', () => {
  const csv = t.report.buildFullCSV(t.D.S), lines = csv.split('\r\n');
  const sections = ['# BRIDGEAID MONTHLY OWNERSHIP TRACKER — FULL EXPORT', '# OWNERS', '# SALARY TABLES (monthly gross, 160 h) — versioned', '# TASK CATALOG', '# PERIOD SUMMARY (per owner)', '# WORK LOG (every entry)', '# PAYMENTS'];
  const idx = sections.map(s => lines.findIndex(l => l.replace(/^"/, '').startsWith(s)));
  assert.ok(idx.every((i, n) => i >= 0 && (n === 0 || i > idx[n - 1])), 'sections present and ordered ' + idx);
  const ownersBlock = lines.slice(idx[1] + 2, idx[1] + 9).map(l => l.split(',')[0]);
  assert.deepEqual(ownersBlock, ['JAL', 'KÁ', 'KB', 'KD', 'SZB', 'VI', 'HB']);
  const summary = lines.slice(idx[4] + 2, idx[5]).filter(l => l.trim()); assert.equal(summary.length, 12 * 7);
  assert.ok(summary[0].startsWith('September 2026,month,JAL,'));
  const worklog = lines.slice(idx[5] + 2, idx[6]).filter(l => l.trim()); assert.equal(worklog.length, 98);
  assert.ok(lines[idx[2] + 1].startsWith('Effective from,HUF→EUR,Role'));
  assert.ok(lines.some(l => l.startsWith('December 2025,400.00,CEO,ceo,3000000.00,7500.00,46.88')));
  const tasks = lines.slice(idx[3] + 2, idx[4]).filter(l => l.trim()); assert.equal(tasks.length, 62);
  assert.ok(csv.includes('"New public-sector client acquisition (road/bridge authority, e.g. Magyar Közút, MÁV) — signed framework/contract"'), 'commas are quoted');
});

test('work-log CSV has the header and one row per entry', () => {
  const lines = t.report.worklogCSV(t.D.S).split('\r\n');
  assert.equal(lines[0], 'Period,Owner,Group,Category,Task,Hours,Weight,Weighted'); assert.equal(lines.length, 99);
  assert.equal(t.report.csvOf([['a,b', 'c"d', 'e']]), '"a,b","c""d",e');
});

test('PDF document: cover with the graphs, one section per period, then master data', () => {
  const wrap = t.report.buildPrintDoc(t.D.S, t.$('#bars').innerHTML);
  const pages = [...wrap.querySelectorAll('.pdf-page')];
  assert.equal(pages.length, 1 + 12 + 1);
  assert.equal(pages[0].dataset.page, 'cover'); assert.ok(pages[0].querySelector('.sharebars .bar')); assert.equal(pages[0].querySelectorAll('.sharebars .bar-row').length, 2);
  assert.deepEqual(pages.slice(1, 13).map(p => p.dataset.page), t.C.displayRows(t.D.S).map(r => r.id));
  pages.slice(1, 13).forEach(p => assert.equal(p.querySelectorAll('.pcard').length, 7));
  assert.ok(t.text(pages[1].querySelector('h1')).startsWith('September 2026')); assert.ok(t.text(pages[1].querySelector('h1')).includes('Pending'));
  assert.ok(t.text(pages[3].querySelector('h1')).includes('Finalised'));
  assert.equal(pages[13].dataset.page, 'master'); assert.ok(t.text(pages[13]).includes('Role market salaries — effective from December 2025 · HUF→EUR 400.00'));
  assert.ok(t.text(pages[13]).includes('Task catalog & weights'));
  assert.equal(pages[13].querySelectorAll('table.pt').length, 1 + 12);
  const comp = t.C.computeAll(t.D.S);
  assert.ok(t.text(pages[1]).includes(`Equity hours in period: ${t.C.fmt1(comp.m202609.colTotal)}`));
  assert.equal(t.document.getElementById('printDoc'), null, 'not attached to the page');
});

test('report views: by task, by person (HB last), payments; period and owner filters', () => {
  assert.equal(t.report.getReportView(), 'task');
  const rows = t.$$('#reportBody table.rp tbody tr'); assert.ok(rows.length > 5);
  assert.ok(t.text(t.$('#reportBody .rp-sum')).startsWith('Total logged'));
  t.$('#rpTools [data-view="person"]').click();
  const persons = t.$$('#reportBody .rp-person').map(p => p.dataset.owner); assert.equal(persons.length, 7); assert.equal(persons.at(-1), 'hb');
  t.$('#rpTools [data-view="pay"]').click();
  assert.equal(t.$$('#reportBody table.rp tbody tr').length, 10, 'one row per month');
  assert.ok(t.text(t.$('#reportBody tfoot')).includes('€'));
  assert.deepEqual(t.$$('#reportBody thead th').slice(1, 8).map(th => t.text(th)), ['JAL', 'KÁ', 'KB', 'KD', 'SZB', 'VI', 'HB']);
  const own = t.$('#rpOwner'); assert.equal(own.options[own.options.length - 1].value, 'hb');
  own.value = 'kd'; t.fire(own, 'change');
  assert.deepEqual(t.$$('#reportBody thead th').slice(1, -1).map(th => t.text(th)), ['KD']);
  const per = t.$('#rpPeriod'); assert.equal(per.options[1].value, 'm202609'); assert.equal(per.options[per.options.length - 1].value, 'ip');
  per.value = 'm202601'; t.fire(per, 'change'); assert.equal(t.$$('#reportBody table.rp tbody tr').length, 1);
  t.$('#rpTools [data-view="task"]').click();
  assert.equal(t.$$('#reportBody table.rp tbody tr').length, 1); assert.ok(t.text(t.$('#reportBody')).includes('Building the bridge-specific FEM'));
  own.value = 'all'; per.value = 'all'; t.fire(per, 'change');
});

test('the header menu offers only the CSV and PDF exports; Save/Load JSON are gone', () => {
  assert.deepEqual(t.$$('#navMenu .nav-item').map(b => t.text(b)), ['Export CSV (all data)', 'Export PDF (monthly pages)']);
  assert.equal(t.$('#navMenu [data-act="saveJson"]'), null); assert.equal(t.$('#navMenu [data-act="loadJson"]'), null); assert.equal(t.$('#loadFile'), null);
  assert.equal(t.app.saveStateFile, undefined); assert.equal(t.app.loadStateFile, undefined);
  /* the legacy Save-JSON shape is still produced for the import script's tests */
  const json = t.C.toLegacyJson(t.D.S);
  assert.ok(t.C.validateLegacy(JSON.parse(JSON.stringify(json)))); assert.equal(json.rows.length, 12);
});

test('CSV and PDF say who approved: "Approved" for self, "Approved by <admin>" on behalf', () => {
  const row = t.C.rowById(t.D.S, 'm202609'); row.approvals.kd = 'jal'; row.approvals.jal = 'jal';
  const lines = t.report.buildFullCSV(t.D.S).split('\r\n');
  assert.ok(lines.some(l => l.startsWith('September 2026,month,KD,') && l.endsWith(',Approved by JAL')));
  assert.ok(lines.some(l => l.startsWith('September 2026,month,JAL,') && l.endsWith(',Approved')));
  assert.ok(lines.some(l => l.startsWith('September 2026,month,HB,') && l.endsWith(',not approved')));
  assert.ok(lines.some(l => l.endsWith(',Column status,Approval')));
  const page = t.report.buildPrintDoc(t.D.S, '').querySelector('.pdf-page[data-page="m202609"]');
  const st = [...page.querySelectorAll('.pcard .st')].map(x => t.text(x));
  assert.deepEqual(st, ['✓ Approved', 'not approved', 'not approved', '✓ Approved by JAL', 'not approved', 'not approved', 'not approved']);
  delete row.approvals.kd; delete row.approvals.jal;
});
