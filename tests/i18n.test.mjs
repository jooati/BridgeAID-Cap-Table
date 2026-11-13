/* Language switcher (EN / HU) and the Hungarian translation. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { setup, sleep } from './setup.mjs';
import * as I from '../js/i18n.js';
import { CATALOG } from './fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const lit = (q, body) => new Function(`return ${q}${body}${q};`)();   // evaluate a JS string literal

test('every string used in the code has a Hungarian entry with the same placeholders', () => {
  const keys = new Map();   // key → file
  for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
    const src = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    for (const m of src.matchAll(/\b(?:tr|N_)\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) keys.set(lit(m[1], m[2]), f);
    for (const m of src.matchAll(/\btrs\(\[([\s\S]*?)\]\)/g)) for (const k of m[1].matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) keys.set(lit(k[1], k[2]), f);
  }
  assert.ok(keys.size > 300, `scanner found ${keys.size} strings`);
  const missing = [...keys].filter(([k]) => I.HU[k] == null).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, [], 'strings without a Hungarian translation');
  const badVars = Object.entries(I.HU).filter(([k, v]) => vars(k) !== vars(v)).map(([k]) => k);
  assert.deepEqual(badVars, [], 'placeholders differ between English and Hungarian');
  assert.ok(Object.values(I.HU).every(v => typeof v === 'string' && v.length > 0));
});

test('every translatable piece of index.html has a Hungarian entry', () => {
  const doc = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).window.document;
  const els = [...doc.querySelectorAll('[data-i18n]')]; assert.ok(els.length > 50, `${els.length} marked elements`);
  const missing = [];
  els.forEach(el => { const key = el.getAttribute('data-i18n'); if (key) { if (I.HU_HTML[key] == null) missing.push('html:' + key); } else if (I.HU[el.textContent] == null) missing.push('text:' + el.textContent); });
  doc.querySelectorAll('[data-i18n-title]').forEach(el => { if (I.HU[el.getAttribute('title')] == null) missing.push('title:' + el.getAttribute('title')); });
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(I.HU_HTML).filter(k => !doc.querySelector(`[data-i18n="${k}"]`)), [], 'unused HU_HTML keys');
  /* inline tags survive the translation */
  for (const [k, v] of Object.entries(I.HU_HTML)) { const en = doc.querySelector(`[data-i18n="${k}"]`).innerHTML; assert.equal((v.match(/<b>/g) || []).length, (en.match(/<b>/g) || []).length, k); }
  assert.equal(doc.querySelectorAll('.lang-sw').length, 2, 'switcher in the header and in the sign-in modal');
});

test('the seed catalog, roles and special periods have Hungarian names', () => {
  const names = ['Intellectual property', 'Incubation programs', 'Civil engineer', 'IT engineer', 'New task', 'New category'];
  CATALOG.groups.forEach(g => { names.push(g.name); g.categories.forEach(c => { names.push(c.name); c.subs.forEach(s => names.push(s.name)); }); });
  assert.equal(names.length, 6 + 2 + 12 + 62);
  assert.deepEqual(names.filter(n => I.NAMES[n] == null), []);
  assert.deepEqual(names.filter(n => I.NAMES[n] === n), [], 'actually translated');
});

test('language detection: saved choice wins, then the browser language, else English', () => {
  assert.equal(I.detectLang('hu', 'en-US'), 'hu'); assert.equal(I.detectLang('en', 'hu-HU'), 'en');
  assert.equal(I.detectLang(null, 'hu-HU'), 'hu'); assert.equal(I.detectLang(null, 'hu'), 'hu');
  assert.equal(I.detectLang(null, 'en-GB'), 'en'); assert.equal(I.detectLang('xx', 'de-DE'), 'en'); assert.equal(I.detectLang(null, undefined), 'en');
});

test('switching EN → HU translates the whole app; HU → EN restores it exactly', async () => {
  const t = await setup();
  const card = (rid, oid) => t.$(`#trackerTable .ocard[data-card="${rid}:${oid}"]`);
  const colHead = rid => t.$(`#trackerTable thead th[data-col="${rid}"]`);
  assert.equal(t.I.lang, 'en'); assert.equal(t.document.documentElement.lang, 'en');
  assert.deepEqual(t.$$('header .lang-sw button').map(b => [b.dataset.lang, b.classList.contains('active')]), [['en', true], ['hu', false]]);
  const before = t.$('main').innerHTML, navBefore = t.$('#topNav').innerHTML, k = t.C.computeAll(t.D.S).m202512.cells.hb, f1 = t.C.fmt1;

  t.$('header .lang-sw button[data-lang="hu"]').click();
  assert.equal(t.I.lang, 'hu'); assert.equal(t.document.documentElement.lang, 'hu'); assert.equal(t.window.localStorage.getItem('bridgeaid:lang'), 'hu');
  assert.ok(t.$$('.lang-sw button[data-lang="hu"]').every(b => b.classList.contains('active')));
  assert.equal(t.document.title, 'BridgeAID — Havi tulajdonrész-követő');
  /* header */
  assert.deepEqual(t.$$('#topNav .tab-link').map(a => t.text(a)), ['1Tulajdonosok, szerepkörök', '2Feladatok — súlyok', '3Havi tulajdonrész-követő', '4Munkanapló, jelentés']);
  assert.equal(t.text(t.$('#syncPill')), 'Élő'); assert.equal(t.text(t.$('#loginLbl')), 'JAL');
  assert.deepEqual(t.$$('#navMenu .nav-item').map(b => t.text(b)), ['CSV-export (minden adat)', 'PDF-export (havi oldalak)']);
  assert.equal(t.text(t.$('#accountMenu [data-act="signOut"]')), 'Kijelentkezés');
  /* static markup */
  assert.equal(t.text(t.$('#tab-tracker h2')), 'Havi tulajdonrész-követő');
  assert.ok(t.$('#tab-tracker .intro p').innerHTML.startsWith('<b>Cél.</b> Ez a táblázat'));
  assert.equal(t.text(t.$('#trackerTools [data-act="expandAll"]')), 'Mind kinyitása');
  assert.equal(t.text(t.$('#tab-owners h2')), 'Tulajdonosok, szerepkörök');
  /* tracker: labels, period names, statuses, seed names — numbers untouched */
  assert.equal(t.text(colHead('m202609').querySelector('.lbl')), '2026. szeptember'); assert.equal(t.text(colHead('m202609').querySelector('.kind')), 'Aktuális hónap');
  assert.equal(t.text(colHead('m202609').querySelector('.st')), 'Függőben'); assert.equal(t.text(colHead('m202512').querySelector('.st')), 'Lezárva');
  assert.equal(t.text(colHead('ip').querySelector('.lbl')), 'Szellemi tulajdon ✓'); assert.equal(t.text(colHead('incub').querySelector('.kind')), 'Különleges időszak');
  const c = card('m202512', 'hb');
  assert.ok(t.text(c).includes('Cégvezetés, ügyvezetői feladatok, csapatkoordináció'));
  assert.equal(t.text(c.querySelector('.kv.sum')), `Σ óra ${f1(k.H)} × átl. súly ${f1(k.avgW)} =Σ súlyozott ${f1(k.W)}`);
  assert.ok(t.text(c.querySelector('.kv.paid')).includes(`${f1(k.paidHours)} ó × átl. súly ${f1(k.avgW)} = ${f1(k.paidW)}`));
  assert.ok(t.text(c.querySelector('.kv.eq')).includes(`Tulajdonrész-órák ${f1(k.equity)}`));
  assert.equal(c.querySelector('.pay input').value, '€2,500.00', 'money format is the same in both languages');
  assert.equal(c.querySelector('.pay select').selectedOptions[0].textContent, 'CEO');
  assert.equal(t.text(c.querySelector('.appr')), 'Jóváhagyva');
  assert.equal(t.text(card('m202609', 'kd').querySelector('.appr')), 'Hónap jóváhagyása');
  assert.equal(t.text(card('ip', 'jal').querySelector('.sec')), 'Feladatok és pontok');
  assert.ok(t.text(t.$('#bars')).includes('Kiinduló tulajdoni arány') && t.text(t.$('#bars')).includes('Jelenlegi halmozott tulajdonrész'));
  assert.equal(t.text(t.$('#trackerTable thead .corner .nm')), 'Tulajdonos');
  /* tasks, owners, report */
  assert.equal(t.$('#taskSection input[data-act="taskName"][data-tid="B1s1"]').value, t.I.NAMES[t.C.taskById(t.D.S, 'B1s1').name]);
  assert.equal(t.$('#taskSection input[data-act="groupName"][data-gid="proj"]').value, 'Projektek');
  assert.equal(t.text(t.$('#taskSection [data-act="addTask"]')), '+ Feladat hozzáadása');
  assert.equal(t.$('#salaryTables input[data-act="roleName"][data-rid="civ"]').value, 'Építőmérnök');
  assert.equal(t.text(t.$('#salaryTables thead .st')), 'jelenleg érvényes'); assert.ok(t.text(t.$('#salaryTables thead .lbl')).startsWith('ettől:'));
  assert.equal(t.$('#salaryTables thead select option[selected]').textContent, '2025. december');
  assert.deepEqual(t.$$('#ownerList .own-head span').map(s => t.text(s)), ['Név', 'Kiinduló %', 'azonosító', 'Bejelentkezési fiók', '']);
  assert.ok(t.text(t.$('#reportBody .rp-sum')).startsWith('Összes rögzített'));
  assert.equal(t.$('#rpPeriod').options[0].textContent, 'Minden időszak'); assert.equal(t.$('#rpPeriod').options[1].textContent, '2026. szeptember');
  assert.equal(t.$('#rpPeriod').options[t.$('#rpPeriod').options.length - 1].textContent, 'Szellemi tulajdon');
  assert.deepEqual(t.$$('#reportBody thead th').slice(0, 3).map(x => t.text(x)), ['Feladat', 'Kategória', 'Órák']);
  assert.ok(t.text(t.$('#auditBody')).includes('nincs rögzített változás'));

  /* back to English: byte-for-byte the same markup as before */
  t.$('header .lang-sw button[data-lang="en"]').click();
  assert.equal(t.I.lang, 'en'); assert.equal(t.window.localStorage.getItem('bridgeaid:lang'), 'en'); assert.equal(t.document.documentElement.lang, 'en');
  assert.equal(t.$('main').innerHTML, before); assert.equal(t.$('#topNav').innerHTML, navBefore);
  assert.equal(t.document.title, 'BridgeAID — Monthly Ownership Tracker'); assert.equal(t.text(t.$('#syncPill')), 'Live');
});

test('a saved Hungarian choice is applied at boot, including the sign-in screen', async () => {
  const t = await setup({user: null, lang: 'hu'});
  assert.equal(t.I.lang, 'hu');
  assert.equal(t.text(t.$('#authTitle')), 'Bejelentkezés'); assert.equal(t.text(t.$('#authSubmit')), 'Bejelentkezés'); assert.equal(t.text(t.$('#authForgot')), 'Elfelejtett jelszó?');
  assert.equal(t.text(t.$('#authText')), 'BridgeAID havi tulajdonrész-követő — csak tulajdonosoknak.');
  assert.equal(t.text(t.$('label[for="authPw"]')), 'Jelszó'); assert.equal(t.text(t.$('#loginLbl')), 'Bejelentkezés'); assert.equal(t.text(t.$('#syncPill')), 'Offline');
  /* a known Supabase message is translated, the switcher inside the modal works */
  t.$('#authEmail').value = 'kd@example.com'; t.$('#authPw').value = 'wrong'; t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.equal(t.text(t.$('#authErr')), 'Hibás e-mail-cím vagy jelszó.');
  t.$('#authForgot').click(); assert.equal(t.text(t.$('#authTitle')), 'Jelszó visszaállítása'); assert.equal(t.text(t.$('#authSubmit')), 'Visszaállító link küldése');
  t.$('#authModal .lang-sw button[data-lang="en"]').click();
  assert.equal(t.text(t.$('#authTitle')), 'Reset password'); assert.equal(t.A.currentMode(), 'forgot'); assert.equal(t.$('#authEmail').value, 'kd@example.com', 'typed values survive the switch');
  t.$('#authModal .lang-sw button[data-lang="hu"]').click(); t.$('#authForgot').click();
  /* sign in: the app comes up in Hungarian */
  t.$('#authPw').value = 'secret123'; t.fire(t.$('#authForm'), 'submit'); await sleep(50); while (!t.D.S) await sleep(10); await t.D.flushReload();
  assert.equal(t.text(t.$('#loginLbl')), 'KD'); assert.equal(t.text(t.$('#syncPill')), 'Élő');
  assert.equal(t.text(t.$('#trackerTable thead .corner .cumtot')), 'Halmozott részesedés');
  assert.ok(t.text(t.$('#taskSection')).includes('A feladatsúlyokat az adminok kezelik — csak olvasható.'));
  assert.equal(t.text(t.$('#roleNote')), 'A törzsadatokat az adminok kezelik — csak olvasható.');
  t.tracker.setHours('m202609', 'jal', 0, 5); assert.equal(t.text(t.$('#toast')), 'Csak a saját kártyáját szerkesztheti.');
});

test('in Hungarian the database still gets canonical data; exports and the audit log read Hungarian', async () => {
  const t = await setup({lang: 'hu'});
  const card = (rid, oid) => t.$(`#trackerTable .ocard[data-card="${rid}:${oid}"]`);
  const rid = 'm202609';
  /* autocomplete finds a task by its Hungarian name and stores the English one */
  const inp = card(rid, 'jal').querySelector('.addent input'); t.setValue(inp, 'közszférabeli');
  const items = card(rid, 'jal').querySelectorAll('.ac .ac-item'); assert.equal(items.length, 1); assert.equal(items[0].dataset.tid, 'B1s1');
  assert.ok(t.text(items[0]).includes('Új közszférabeli ügyfél megszerzése')); assert.ok(t.text(items[0]).includes('Folyamatos működés (üzletmenet) › Értékesítés'));
  t.fire(items[0], 'mousedown'); await t.flush();
  const dbE = t.sb.db.entries.filter(e => e.period_id === rid && e.owner_id === 'jal'); assert.equal(dbE.length, 3);
  assert.ok(dbE[2].task_name.startsWith('New public-sector client acquisition'), 'task_name snapshot stays English');
  /* the English name still matches too */
  t.setValue(card(rid, 'jal').querySelector('.addent input'), 'key-account'); assert.equal(card(rid, 'jal').querySelectorAll('.ac .ac-item').length, 1);
  /* add month: the stored label is the canonical English one, the UI shows the Hungarian one */
  t.$('#trackerTools [data-act="addMonth"]').click(); await t.flush();
  assert.equal(t.sb.db.periods.find(p => p.id === 'm202610').label, 'October 2026');
  assert.equal(t.text(t.$('#trackerTable thead th[data-col="m202610"] .lbl')), '2026. október'); assert.equal(t.text(t.$('#toast')), 'Hozzáadva: 2026. október.');
  /* a renamed task (no longer the seed text) is shown as stored, in both languages */
  t.setValue(t.$('#taskSection input[data-act="taskName"][data-tid="B6s4"]'), 'PR és sajtó'); await t.flush();
  assert.equal(t.sb.db.tasks.find(x => x.id === 'B6s4').name, 'PR és sajtó'); assert.equal(t.I.tn('PR és sajtó'), 'PR és sajtó');
  /* audit log */
  t.sb.realtime.emit('audit_log'); await t.flush();
  const lines = t.D.S.audit.map(a => t.report.describeAudit(t.D.S, a));
  assert.ok(lines.includes("JAL: rögzítette: 'Új közszférabeli ügyfél megszerzése (út-…' — 2026. szeptember"), lines.join(' | '));
  assert.ok(lines.includes('JAL hozzáadta: 2026. október'));
  assert.ok(lines.some(l => l.startsWith("JAL: átnevezte: 'PR, sajtó, közösségi média, márkaépítés' → 'PR és sajtó'")));
  assert.deepEqual(t.$$('#auditBody thead th').slice(0, 4).map(x => t.text(x)), ['Mikor', 'Ki', 'Művelet', 'Mi']);
  assert.deepEqual([...t.$('#auTable').options].map(o => o.textContent), ['Minden tábla', 'Bejegyzések', 'Időszakok', 'Feladatok']);
  assert.equal(t.report.describeAudit(t.D.S, {table: 'salary_rates', action: 'update', actor: 'ka', old: {table_id: 1, role_id: 'civ', gross_huf: 2000000}, new: {table_id: 1, role_id: 'civ', gross_huf: 2200000}}),
    'KÁ módosította a(z) Építőmérnök alapbérét: 2,000,000 → 2,200,000 HUF (2025-12 kezdetű tábla)');
  assert.equal(t.report.describeAudit(t.D.S, {table: 'approvals', action: 'insert', actor: 'jal', new: {period_id: 'ip', owner_id: 'kd', approved_by: 'jal'}}), 'JAL jóváhagyta KD nevében — Szellemi tulajdon');
  /* CSV and PDF */
  const csv = t.report.buildFullCSV(t.D.S).split('\r\n');
  ['# TULAJDONOSOK', '# FELADATKATALÓGUS', '# IDŐSZAKI ÖSSZESÍTŐ (tulajdonosonként)', '# MUNKANAPLÓ (minden bejegyzés)', '# KIFIZETÉSEK'].forEach(h => assert.ok(csv.includes(h), h));
  assert.ok(csv.some(l => l.startsWith('2025. december,400.00,Építőmérnök,civ,2000000.00,5000.00,31.25')), 'salary table row');
  assert.ok(csv.some(l => l.startsWith('2026. szeptember,hónap,KD,') && l.endsWith(',jóváhagyva 0/7,nincs jóváhagyva')));
  assert.ok(csv.some(l => l.startsWith('Szellemi tulajdon,IP,JAL,') && l.endsWith(',lezárva,Jóváhagyva')));
  assert.equal(t.report.worklogCSV(t.D.S).split('\r\n')[0], 'Időszak,Tulajdonos,Csoport,Kategória,Feladat,Órák,Súly,Súlyozott');
  const pages = [...t.report.buildPrintDoc(t.D.S, '').querySelectorAll('.pdf-page')];
  assert.ok(t.text(pages[0].querySelector('h1')) === 'BridgeAID — Havi tulajdonrész-követő');
  assert.ok(t.text(pages.find(p => p.dataset.page === 'm202512').querySelector('h1')).startsWith('2025. december') && t.text(pages.find(p => p.dataset.page === 'm202512').querySelector('h1')).includes('Lezárva'));
  assert.ok(t.text(pages.at(-1)).includes('Szerepkörök piaci bére — érvényes ettől: 2025. december · HUF→EUR 400.00')); assert.ok(t.text(pages.at(-1)).includes('Feladatkatalógus és súlyok'));
  /* diagnostics and notices */
  t.$('#syncPill').click(); await t.diag.lastRun;
  assert.equal(t.text(t.$('#diagTitle')), 'Kapcsolatdiagnosztika'); assert.equal(t.text(t.$('#diagText')), 'Mind a(z) 14 próba rendben.');
  t.$('#diagClose').click();
  t.I.setLang('en');
});
