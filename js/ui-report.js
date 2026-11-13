/* ============================================================================
   ui-report.js — work log & task report (by task / by person / payments) and the exports:
   work-log CSV, full CSV (sectioned), PDF (one page per period + graphs + master data).
   The builders (worklogCSV, buildFullCSV, buildPrintDoc) are testable without a browser download.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import { toast } from './app.js';
import { tr, trs, N_, tn, pl, ymL, whenL, locale } from './i18n.js';

const {esc, fmt, fmt1, money} = C;
let reportView = 'task';

export function setReportView(v) { reportView = v; document.querySelectorAll('#rpTools .segb').forEach(b => b.classList.toggle('active', b.dataset.view === v)); renderReport(); }
export function getReportView() { return reportView; }
function reportFilters() { const p = document.getElementById('rpPeriod'), o = document.getElementById('rpOwner'); return {period: p ? p.value : 'all', owner: o ? o.value : 'all'}; }
function hbar(v, max, color) { const w = max > 0 ? Math.max(2, v / max * 100) : 0; return `<div class="hb"><span style="width:${w}%;background:${color || 'var(--navy)'}"></span></div>`; }

const th = (label, cls) => `<th${cls ? ` class="${cls}"` : ''}>${esc(label)}</th>`;
export function renderReport() {
  const S = D.S, host = document.getElementById('reportBody'); if (!S || !host) return;
  const pSel = document.getElementById('rpPeriod'), oSel = document.getElementById('rpOwner'); const pv = pSel.value || 'all', ov = oSel.value || 'all';
  pSel.innerHTML = `<option value="all">${esc(tr('All periods'))}</option>` + C.displayRows(S).map(r => `<option value="${esc(r.id)}">${esc(pl(r))}</option>`).join(''); pSel.value = [...pSel.options].some(x => x.value === pv) ? pv : 'all';
  oSel.innerHTML = `<option value="all">${esc(tr('All owners'))}</option>` + C.sortedOwners(S).map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(''); oSel.value = [...oSel.options].some(x => x.value === ov) ? ov : 'all';
  const f = reportFilters(); const rows = C.worklogRows(S).filter(x => (f.period === 'all' || x.period.id === f.period) && (f.owner === 'all' || x.owner.id === f.owner));
  const totalH = rows.reduce((a, x) => a + x.hours, 0), totalW = rows.reduce((a, x) => a + x.hours * x.weight, 0);
  const oc = id => C.ownerColor(S, id), H = esc(tr('h'));
  const sum = `${esc(tr('Total logged'))} <b>${fmt1(totalH)} ${H}</b> · ${esc(tr('weighted'))} <b>${fmt1(totalW)}</b>`;
  if (reportView === 'task') {
    const by = {}; rows.forEach(x => { const k = x.task.id; by[k] = by[k] || {task: x.task, hours: 0, weighted: 0, owners: {}, periods: new Set()}; by[k].hours += x.hours; by[k].weighted += x.hours * x.weight; by[k].owners[x.owner.id] = (by[k].owners[x.owner.id] || 0) + x.hours; by[k].periods.add(x.period.id); });
    const list = Object.values(by).sort((a, b) => b.hours - a.hours); const max = list.length ? list[0].hours : 0;
    host.innerHTML = `<div class="rp-sum">${sum} · ${esc(tr('{n} tasks', {n: list.length}))}</div>
      ${list.length ? `<table class="rp"><thead><tr>${th(tr('Task'))}${th(tr('Category'))}${th(tr('Hours'), 'r')}${th(tr('% of total'), 'r')}${th(tr('Weighted'), 'r')}${th(tr('Periods'), 'r')}${th(tr('Who worked on it'))}${th(tr('Time share'), 'bar-col')}</tr></thead><tbody>` +
      list.map(x => `<tr><td><b>${esc(tn(x.task.name))}</b></td><td class="muted">${esc(tn(x.task.group))}${x.task.group ? ' › ' : ''}${esc(tn(x.task.cat))}</td><td class="r">${fmt1(x.hours)}</td><td class="r">${fmt(totalH ? x.hours / totalH * 100 : 0)}%</td><td class="r muted">${fmt1(x.weighted)}</td><td class="r muted">${x.periods.size}</td>
        <td>${Object.entries(x.owners).sort((a, b) => b[1] - a[1]).map(([id, h]) => `<span class="chip" style="border-color:${oc(id)}"><i style="background:${oc(id)}"></i>${esc(C.ownerName(S, id))} ${fmt1(h)} ${H}</span>`).join(' ')}</td><td class="bar-col">${hbar(x.hours, max)}</td></tr>`).join('') + `</tbody></table>` : `<div class="muted">${esc(tr('No logged work for this selection.'))}</div>`}`;
  } else if (reportView === 'person') {
    const owners = C.sortedOwners(S).filter(o => f.owner === 'all' || o.id === f.owner); let html = `<div class="rp-sum">${sum}</div>`;
    owners.forEach(o => { const mine = rows.filter(x => x.owner.id === o.id); const by = {}; mine.forEach(x => { by[x.task.id] = by[x.task.id] || {task: x.task, hours: 0, weighted: 0, periods: new Set()}; by[x.task.id].hours += x.hours; by[x.task.id].weighted += x.hours * x.weight; by[x.task.id].periods.add(x.period.id); });
      const list = Object.values(by).sort((a, b) => b.hours - a.hours); const oh = mine.reduce((a, x) => a + x.hours, 0), ow = mine.reduce((a, x) => a + x.hours * x.weight, 0); const max = list.length ? list[0].hours : 0;
      html += `<div class="rp-person" data-owner="${esc(o.id)}"><div class="rp-ph"><span class="sw" style="background:${oc(o.id)}"></span><b>${esc(o.name)}</b><span class="muted">${esc(tr('{h} h logged · weighted {w} · avg. weight {a}', {h: fmt1(oh), w: fmt1(ow), a: fmt1(oh ? ow / oh : 0)}))}</span></div>
        ${list.length ? `<table class="rp"><thead><tr>${th(tr('Task'))}${th(tr('Category'))}${th(tr('Hours'), 'r')}${th(tr('% of own'), 'r')}${th(tr('Weighted'), 'r')}${th(tr('Periods'), 'r')}<th class="bar-col"></th></tr></thead><tbody>` + list.map(x => `<tr><td>${esc(tn(x.task.name))}</td><td class="muted">${esc(tn(x.task.cat))}</td><td class="r">${fmt1(x.hours)}</td><td class="r">${fmt(oh ? x.hours / oh * 100 : 0)}%</td><td class="r muted">${fmt1(x.weighted)}</td><td class="r muted">${x.periods.size}</td><td class="bar-col">${hbar(x.hours, max, oc(o.id))}</td></tr>`).join('') + `</tbody></table>` : `<div class="muted">${esc(tr('No logged work.'))}</div>`}</div>`; });
    host.innerHTML = html;
  } else {
    const periods = C.chronoRows(S).filter(r => r.kind === 'month' && (f.period === 'all' || r.id === f.period)).slice().reverse(); const owners = C.sortedOwners(S).filter(o => f.owner === 'all' || o.id === f.owner); const comp = C.computeAll(S);
    const tot = {}; owners.forEach(o => tot[o.id] = {sal: 0, paidH: 0, H: 0}); let grand = 0;
    let html = `<table class="rp"><thead><tr>${th(tr('Month'))}${owners.map(o => `<th class="r">${esc(o.name)}</th>`).join('')}${th(tr('Month total'), 'r')}</tr></thead><tbody>`;
    periods.forEach(r => { let mt = 0; html += `<tr><td><b>${esc(pl(r))}</b></td>` + owners.map(o => { const c = r.cells[o.id] || {}; const k = comp[r.id].cells[o.id]; const sal = +c.salary || 0; mt += sal; tot[o.id].sal += sal; tot[o.id].paidH += Math.min(k.paidHours, k.H); tot[o.id].H += k.H; const role = tn(C.roleName(S, c.role));
      return `<td class="r">${sal ? `<b>${money(sal)}</b><div class="muted small">${esc(tr('{role} · {h} h paid', {role, h: fmt1(k.paidHours)}))}${k.over ? ' ⚠' : ''}</div>` : '<span class="muted">—</span>'}</td>`; }).join('') + `<td class="r"><b>${money(mt)}</b></td></tr>`; grand += mt; });
    html += `</tbody><tfoot><tr><td>${esc(tr('Total'))}</td>${owners.map(o => `<td class="r"><b>${money(tot[o.id].sal)}</b><div class="muted small">${esc(tr('{a} of {b} h paid', {a: fmt1(tot[o.id].paidH), b: fmt1(tot[o.id].H)}))}</div></td>`).join('')}<td class="r"><b>${money(grand)}</b></td></tr></tfoot></table>`;
    host.innerHTML = html;
  }
  renderAudit();
}

/* ---------- CSV ---------- */
export function csvOf(rows) { return rows.map(r => r.map(c => { c = String(c ?? ''); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n'); }
export function dl(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); }
/* CSV texts follow the current language; numbers keep the same format in both. */
export function worklogCSV(S) {
  const rows = [trs(['Period', 'Owner', 'Group', 'Category', 'Task', 'Hours', 'Weight', 'Weighted'])];
  C.worklogRows(S).forEach(x => rows.push([pl(x.period), x.owner.name, tn(x.task.group), tn(x.task.cat), tn(x.task.name), fmt(x.hours), fmt(x.weight), fmt(x.hours * x.weight)]));
  return csvOf(rows);
}
export function exportWorklogCSV() { if (!D.S) return; dl(new Blob([worklogCSV(D.S)], {type: 'text/csv;charset=utf-8;'}), 'BridgeAID_worklog.csv'); }
/* Full export: master data + per-period summary + every logged entry + payments, in one CSV with section headers. */
const KIND = {month: N_('month'), ip: N_('ip'), incubation: N_('incubation')};
const kindL = k => KIND[k] ? tr(KIND[k]) : k;
export function buildFullCSV(S) {
  const owners = C.sortedOwners(S), comp = C.computeAll(S), R = [];
  R.push([tr('# BRIDGEAID MONTHLY OWNERSHIP TRACKER — FULL EXPORT'), new Date().toISOString()]); R.push([]);
  R.push([tr('# OWNERS')]); R.push(trs(['Owner', 'Id', 'Baseline %', 'Cumulative equity hours', 'Cumulative share %'])); const last = C.ownerCumulative(S);
  owners.forEach(o => R.push([o.name, o.id, fmt(+o.baseline || 0), fmt(last.cum ? last.cum[o.id] : 0), fmt(last.cumShare ? last.cumShare[o.id] : 0)])); R.push([]);
  R.push([tr('# SALARY TABLES (monthly gross, 160 h) — versioned')]); R.push([tr('Effective from'), 'HUF→EUR', ...trs(['Role', 'Role id', 'Monthly gross HUF', '≈ EUR / month', 'EUR / hour'])]);
  C.tablesSorted(S).forEach(tb => S.roles.forEach(r => { const eur = (+tb.huf[r.id] || 0) / (+tb.fx || C.DEFAULT_FX); R.push([ymL(tb.from), fmt(tb.fx), tn(r.name), r.id, fmt(+tb.huf[r.id] || 0), fmt(eur), fmt(eur / C.HOURS_PER_MONTH)]); })); R.push([]);
  R.push([tr('# TASK CATALOG')]); R.push(trs(['Group', 'Category', 'Category id', 'Task', 'Task id', 'Weight']));
  S.catalog.groups.forEach(g => g.categories.forEach(c => c.subs.forEach(s => R.push([tn(g.name), tn(c.name), c.code || c.id, tn(s.name), s.id, fmt(s.weight)])))); R.push([]);
  R.push([tr('# PERIOD SUMMARY (per owner)')]); R.push(trs(['Period', 'Kind', 'Owner', 'Logged', 'Weighted', 'Avg weight', 'Role', 'Salary EUR', 'Paid hours', 'Paid weighted', 'Unpaid hours', 'Equity hours', 'Share this period %', 'Cumulative equity hours', 'Cumulative share %', 'Column status', 'Approval']));
  C.displayRows(S).forEach(r => owners.forEach(o => { const k = comp[r.id].cells[o.id], c = C.cellOf(r, o.id); const st = C.colFinal(S, r) ? tr('finalised') : (r.audit.needsReapproval ? tr('re-approval needed') : tr('approved {n}/{N}', {n: C.colApproved(S, r), N: owners.length}));
    R.push([pl(r), kindL(r.kind), o.name, fmt(k.H), fmt(k.W), fmt(k.avgW), tn(C.roleName(S, c.role)), c.salary != null ? fmt(c.salary) : '', fmt(k.paidHours), fmt(k.paidW), fmt(k.unpaidHours), fmt(k.equity), fmt(k.monthly), fmt(comp[r.id].cum[o.id]), fmt(comp[r.id].cumShare[o.id]), st, C.approvalLabel(S, r, o.id) || tr('not approved')]); })); R.push([]);
  R.push([tr('# WORK LOG (every entry)')]); R.push(trs(['Period', 'Kind', 'Owner', 'Group', 'Category', 'Task', 'Hours', 'Weight (snapshot)', 'Weighted']));
  C.worklogRows(S).forEach(x => R.push([pl(x.period), kindL(x.period.kind), x.owner.name, tn(x.task.group), tn(x.task.cat), tn(x.task.name), fmt(x.hours), fmt(x.weight), fmt(x.hours * x.weight)])); R.push([]);
  R.push([tr('# PAYMENTS')]); R.push(trs(['Month', 'Owner', 'Role', 'Salary EUR', 'Role market EUR', 'Paid hours', 'Logged hours']));
  C.displayRows(S).filter(r => r.kind === 'month').forEach(r => owners.forEach(o => { const c = r.cells[o.id]; if (!c || (c.salary == null && !c.role)) return; const k = comp[r.id].cells[o.id]; R.push([pl(r), o.name, tn(C.roleName(S, c.role)), fmt(+c.salary || 0), fmt(k.market), fmt(k.paidHours), fmt(k.H)]); }));
  return csvOf(R);
}
export function exportCSV() { if (!D.S) return; dl(new Blob([buildFullCSV(D.S)], {type: 'text/csv;charset=utf-8;'}), 'BridgeAID_monthly_ownership_full.csv'); }

/* ---------- PDF: one page per period + graphs + master data ----------
   Builds an off-screen print document (.pdf-page sections), renders each section with
   html2canvas and places it on its own PDF page (tall sections continue on extra pages). */
function pdfOwnerCard(S, r, o, k, c) {
  const isM = r.kind === 'month', unit = esc(isM ? tr('h') : tr('pts')), H = esc(tr('h')); const role = tn(C.roleName(S, c.role));
  const rows = (c.entries || []).map(e => { const tk = C.taskById(S, e.taskId); return `<tr><td>${esc(tn(tk ? tk.name : (e.taskName || tr('(removed task)'))))}</td><td class="r">${fmt1(+e.hours || 0)}</td><td class="r">×${fmt1(+e.weight)}</td><td class="r">${fmt1((+e.hours || 0) * (+e.weight))}</td></tr>`; }).join('');
  return `<div class="pcard"><div class="ph"><span class="sw" style="background:${C.ownerColor(S, o.id)}"></span><b>${esc(o.name)}</b><span class="st">${esc(r.approvals[o.id] ? '✓ ' + C.approvalLabel(S, r, o.id) : tr('not approved'))}</span></div>
    <table class="pt"><thead><tr><th>${esc(tr('Task'))}</th><th class="r">${unit}</th><th class="r">${esc(tr('w'))}</th><th class="r">${esc(tr('weighted'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="muted">${esc(tr('no entries'))}</td></tr>`}</tbody>
    <tfoot><tr><td>${esc(tr('Σ {H} {unit} × avg. weight {avgW}', {H: fmt1(k.H), unit: isM ? tr('h') : tr('pts'), avgW: fmt1(k.avgW)}))}</td><td colspan="3" class="r">${esc(tr('Σ weighted'))} <b>${fmt1(k.W)}</b></td></tr></tfoot></table>
    ${isM ? `<div class="kvp"><span>${esc(tr('Salary'))}: ${role ? esc(role) + ' · ' : ''}${c.salary != null ? money(c.salary) : '—'}</span><span>${esc(tr('Paid hours'))} ${fmt1(k.paidHours)} ${H} × ${fmt1(k.avgW)} = ${fmt1(k.paidW)}</span></div>` : ''}
    <div class="kvp eq"><span>${fmt1(k.W)} − ${fmt1(k.paidW)} = ${esc(tr('Equity hours'))} <b>${fmt1(k.equity)}</b></span><span>${esc(tr('Share'))} <b>${fmt(k.monthly)}%</b></span></div></div>`;
}
export function buildPrintDoc(S, barsHtml) {
  const owners = C.sortedOwners(S), comp = C.computeAll(S), last = C.ownerCumulative(S); const wrap = document.createElement('div'); wrap.id = 'printDoc'; wrap.className = 'printdoc';
  const thr = label => `<th class="r">${esc(label)}</th>`;
  let html = `<section class="pdf-page" data-page="cover"><h1>${esc(tr('BridgeAID — Monthly Ownership Tracker'))}</h1><div class="muted">${esc(tr('Exported {when}', {when: new Date().toLocaleString(locale())}))}</div>
    <h2>${esc(tr('Ownership'))}</h2><div class="sharebars">${barsHtml || ''}</div>
    <table class="pt wide"><thead><tr><th>${esc(tr('Owner'))}</th>${thr(tr('Baseline %'))}${thr(tr('Cumulative equity hours'))}${thr(tr('Cumulative share %'))}</tr></thead><tbody>${owners.map(o => `<tr><td>${esc(o.name)}</td><td class="r">${fmt(+o.baseline || 0)}</td><td class="r">${fmt1(last.cum ? last.cum[o.id] : 0)}</td><td class="r"><b>${fmt(last.cumShare ? last.cumShare[o.id] : 0)}%</b></td></tr>`).join('')}</tbody></table></section>`;
  C.displayRows(S).forEach(r => { const st = C.colStatus(S, r).txt;
    html += `<section class="pdf-page" data-page="${esc(r.id)}"><h1>${esc(pl(r))} <span class="tag">${esc(st)}</span></h1><div class="muted">${esc(tr('Equity hours in period'))}: <b>${fmt1(comp[r.id].colTotal)}</b> · ${esc(tr('cumulative total after this period'))}: <b>${fmt1(comp[r.id].cumTot)}</b></div>
      <div class="pgrid">${owners.map(o => pdfOwnerCard(S, r, o, comp[r.id].cells[o.id], C.cellOf(r, o.id))).join('')}</div>
      <table class="pt wide"><thead><tr><th>${esc(tr('Owner'))}</th>${thr(tr('Equity hours'))}${thr(tr('Share this period'))}${thr(tr('Cumulative hours'))}${thr(tr('Cumulative share'))}</tr></thead><tbody>${owners.map(o => `<tr><td>${esc(o.name)}</td><td class="r">${fmt1(comp[r.id].cells[o.id].equity)}</td><td class="r">${fmt(comp[r.id].cells[o.id].monthly)}%</td><td class="r">${fmt1(comp[r.id].cum[o.id])}</td><td class="r"><b>${fmt(comp[r.id].cumShare[o.id])}%</b></td></tr>`).join('')}</tbody></table></section>`; });
  html += `<section class="pdf-page" data-page="master"><h1>${esc(tr('Master data'))}</h1>${C.tablesSorted(S).map(tb => `<h2>${esc(tr('Role market salaries — effective from {month} · HUF→EUR {fx}', {month: ymL(tb.from), fx: fmt(tb.fx)}))}</h2>
    <table class="pt wide"><thead><tr><th>${esc(tr('Role'))}</th>${thr(tr('HUF / month'))}${thr(tr('EUR / month'))}${thr(tr('EUR / hour'))}</tr></thead><tbody>${S.roles.map(x => { const eur = (+tb.huf[x.id] || 0) / (+tb.fx || C.DEFAULT_FX); return `<tr><td>${esc(tn(x.name))}</td><td class="r">${(+tb.huf[x.id] || 0).toLocaleString('en-US')}</td><td class="r">${money(eur)}</td><td class="r">${money(eur / C.HOURS_PER_MONTH)}</td></tr>`; }).join('')}</tbody></table>`).join('')}
    <h2>${esc(tr('Task catalog & weights'))}</h2>${S.catalog.groups.map(g => `<h3>${esc(tn(g.name))}</h3>` + g.categories.map(c => `<table class="pt wide"><thead><tr><th>${esc(c.code || c.id)} — ${esc(tn(c.name))}</th>${thr(tr('weight'))}</tr></thead><tbody>${c.subs.map(s => `<tr><td>${esc(tn(s.name))}</td><td class="r">${fmt1(s.weight)}</td></tr>`).join('')}</tbody></table>`).join('')).join('')}</section>`;
  wrap.innerHTML = html;
  return wrap;
}
export async function exportPDF() {
  if (!D.S) return;
  if (typeof window.html2canvas === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) { window.alert(tr('PDF export needs html2canvas + jsPDF (offline/blocked). CSV still works.')); return; }
  const bars = document.getElementById('bars'); const wrap = buildPrintDoc(D.S, bars ? bars.innerHTML : ''); document.body.appendChild(wrap);
  await new Promise(r => window.requestAnimationFrame(() => setTimeout(r, 80)));
  const {jsPDF} = window.jspdf; const pdf = new jsPDF({orientation: 'portrait', unit: 'pt', format: 'a4'}); const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 24, imgW = pw - 2 * m, pageH = ph - 2 * m; let first = true;
  try {
    for (const sec of wrap.querySelectorAll('.pdf-page')) {
      const c = await window.html2canvas(sec, {scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: sec.scrollWidth}); const imgH = imgW * c.height / c.width; let rem = imgH, sy = 0;
      while (rem > 0) { if (!first) pdf.addPage(); first = false; const sl = Math.min(pageH, rem), srcH = sl * c.width / imgW; const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = srcH; tmp.getContext('2d').drawImage(c, 0, sy, c.width, srcH, 0, 0, c.width, srcH); pdf.addImage(tmp.toDataURL('image/png'), 'PNG', m, m, imgW, sl); rem -= sl; sy += srcH; }
    }
    pdf.save('BridgeAID_monthly_ownership.pdf');
  } catch (e) { console.error(e); toast(tr('PDF export failed: {msg}', {msg: e.message || e}), 'err'); }
  finally { wrap.remove(); }
}

export function initReport() {
  const tools = document.getElementById('rpTools'); if (!tools) return;
  tools.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; if (b.dataset.act === 'setReportView') setReportView(b.dataset.view); else if (b.dataset.act === 'exportWorklogCsv') exportWorklogCSV(); else if (b.dataset.act === 'exportAuditCsv') exportAuditCSV(); });
  tools.addEventListener('change', e => { if (e.target.id === 'rpPeriod' || e.target.id === 'rpOwner') renderReport(); });
  const au = document.getElementById('auTools'); if (au) au.addEventListener('change', e => { if (/^au(Period|Owner|Table)$/.test(e.target.id)) renderAudit(); });
}

/* ---------- audit log ---------- */
const AUDIT_TABLES = {entries: N_('Entries'), salaries: N_('Salaries'), approvals: N_('Approvals'), periods: N_('Periods'), owners: N_('Owners'), roles: N_('Roles'), salary_tables: N_('Salary tables'), salary_rates: N_('Salary rates'), tasks: N_('Tasks'), task_categories: N_('Task categories'), task_groups: N_('Task groups')};
const tableName = t => AUDIT_TABLES[t] ? tr(AUDIT_TABLES[t]) : t;
const short = (s, n = 40) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
/* one human-readable line per audit row, built from the old/new diff (in the current language) */
export function describeAudit(S, a) {
  const o = a.old || {}, n = a.new || {}, r = a.new || a.old || {};
  const who = a.actor ? C.ownerName(S, a.actor) : tr('system');
  const per = id => { const row = id && C.rowById(S, id); return row ? pl(row) : (id || tr('a period')); };
  const own = id => id ? C.ownerName(S, id) : '';
  const tname = row => tn(row.task_name || (C.taskById(S, row.task_id) || {}).name || row.task_id || tr('task'));
  const tb = id => { const x = S.salaryTables.find(y => String(y.id) === String(id)); return x ? tr('the table from {from}', {from: x.from}) : tr('table #{id}', {id}); };
  const rn = id => tn(C.roleName(S, id)) || id || '—';
  const huf = v => (+v || 0).toLocaleString('en-US');
  const eur = v => v == null ? '—' : money(+v);
  const from = v => String(v || '').slice(0, 7);
  const h1 = v => fmt1(+v || 0);
  switch (a.table) {
    case 'entries': {
      const p = per(r.period_id), o1 = own(r.owner_id), t = `'${short(tname(r))}'`;
      if (a.action === 'insert') return tr('{o}: logged {t} in {p}', {o: o1, t, p});
      if (a.action === 'delete') return tr('{o}: removed {t} ({h} h) from {p}', {o: o1, t, h: h1(o.hours), p});
      if (+o.hours !== +n.hours) return tr('{o}: hours {a} → {b} on {t} in {p}', {o: o1, a: h1(o.hours), b: h1(n.hours), t, p});
      return tr('{o}: changed {t} in {p}', {o: o1, t, p});
    }
    case 'salaries': {
      const p = per(r.period_id), o1 = own(r.owner_id);
      if (a.action === 'delete') return tr('{o}: salary removed from {p}', {o: o1, p});
      const parts = [];
      if (a.action === 'insert') { parts.push(tr('role {r}', {r: rn(n.role_id)})); parts.push(tr('salary {s}', {s: eur(n.gross_eur)})); }
      else { if ((o.role_id || null) !== (n.role_id || null)) parts.push(tr('role {a} → {b}', {a: rn(o.role_id), b: rn(n.role_id)})); if (eur(o.gross_eur) !== eur(n.gross_eur)) parts.push(tr('salary {a} → {b}', {a: eur(o.gross_eur), b: eur(n.gross_eur)})); }
      return tr('{o}: {parts} in {p}', {o: o1, parts: parts.join(', ') || tr('salary changed'), p});
    }
    case 'approvals': {
      const p = per(r.period_id), o1 = own(r.owner_id);
      if (a.action === 'insert') return r.approved_by && r.approved_by !== r.owner_id ? tr('{by} approved on behalf of {o} — {p}', {by: own(r.approved_by), o: o1, p}) : tr('{o} approved {p}', {o: o1, p});
      if (a.action === 'delete') return tr("{o}'s approval of {p} withdrawn", {o: o1, p});
      return tr("{o}'s approval of {p} changed", {o: o1, p});
    }
    case 'periods':
      if (a.action === 'insert') return tr('{who} added {label}', {who, label: pl(n)});
      if (a.action === 'delete') return tr('{who} removed {label}', {who, label: pl(o)});
      return tr('{who} changed {label}', {who, label: pl(o)}) + (o.label !== n.label ? ` → ${pl(n)}` : '');
    case 'owners': {
      if (a.action === 'insert') return tr('{who} added owner {name}', {who, name: n.name});
      if (a.action === 'delete') return tr('{who} removed owner {name}', {who, name: o.name});
      const parts = [];
      if (o.name !== n.name) parts.push(tr('name {a} → {b}', {a: o.name, b: n.name}));
      if (+o.baseline_pct !== +n.baseline_pct) parts.push(tr('baseline {a} → {b}%', {a: fmt(+o.baseline_pct), b: fmt(+n.baseline_pct)}));
      if ((o.auth_uid || null) !== (n.auth_uid || null)) parts.push(n.auth_uid ? tr('linked to a sign-in account') : tr('unlinked from the sign-in account'));
      if (!!o.is_admin !== !!n.is_admin) parts.push(n.is_admin ? tr('made admin') : tr('admin rights removed'));
      return tr('{who}: {name} {parts}', {who, name: n.name, parts: parts.join(', ') || tr('changed')});
    }
    case 'roles': return a.action === 'insert' ? tr('{who} added role {name}', {who, name: tn(n.name)}) : a.action === 'delete' ? tr('{who} removed role {name}', {who, name: tn(o.name)}) : tr('{who} renamed role {a} → {b}', {who, a: tn(o.name), b: tn(n.name)});
    case 'salary_tables': {
      if (a.action === 'insert') return tr('{who} added a salary table from {from} (HUF→EUR {fx})', {who, from: from(n.effective_from), fx: fmt(+n.fx_huf_eur)});
      if (a.action === 'delete') return tr('{who} removed the salary table from {from}', {who, from: from(o.effective_from)});
      const parts = [];
      if (from(o.effective_from) !== from(n.effective_from)) parts.push(tr('effective from {a} → {b}', {a: from(o.effective_from), b: from(n.effective_from)}));
      if (+o.fx_huf_eur !== +n.fx_huf_eur) parts.push(tr('HUF→EUR {a} → {b}', {a: fmt(+o.fx_huf_eur), b: fmt(+n.fx_huf_eur)}));
      return tr('{who} changed {parts} in the table from {from}', {who, parts: parts.join(', ') || tr('the salary table'), from: from(n.effective_from)});
    }
    case 'salary_rates': {
      const role = rn(r.role_id);
      if (a.action === 'delete') return tr('{who} removed the {role} base salary from {tb}', {who, role, tb: tb(o.table_id)});
      if (a.action === 'insert') return tr('{who} set {role} base salary {v} HUF in {tb}', {who, role, v: huf(n.gross_huf), tb: tb(n.table_id)});
      return tr('{who} changed {role} base salary {a} → {b} HUF in {tb}', {who, role, a: huf(o.gross_huf), b: huf(n.gross_huf), tb: tb(n.table_id)});
    }
    case 'tasks': {
      if (a.action === 'insert') return tr("{who} added task '{name}' (weight {w})", {who, name: short(tn(n.name)), w: h1(n.weight)});
      if (a.action === 'delete') return tr("{who} removed task '{name}'", {who, name: short(tn(o.name))});
      const parts = []; if (o.name !== n.name) parts.push(tr("renamed '{a}' → '{b}'", {a: short(tn(o.name)), b: short(tn(n.name))})); if (+o.weight !== +n.weight) parts.push(tr("'{name}' weight {a} → {b}", {name: short(tn(n.name)), a: h1(o.weight), b: h1(n.weight)}));
      return tr('{who}: {parts}', {who, parts: parts.join(', ') || tr('changed a task')});
    }
    case 'task_groups': {
      if (a.action === 'insert') return tr("{who} added group '{name}'", {who, name: short(tn(n.name))});
      if (a.action === 'delete') return tr("{who} removed group '{name}'", {who, name: short(tn(o.name))});
      return tr("{who} renamed group '{a}' → '{b}'", {who, a: short(tn(o.name)), b: short(tn(n.name))});
    }
    case 'task_categories': {
      if (a.action === 'insert') return tr("{who} added category '{name}'", {who, name: short(tn(n.name))});
      if (a.action === 'delete') return tr("{who} removed category '{name}'", {who, name: short(tn(o.name))});
      return tr("{who} renamed category '{a}' → '{b}'", {who, a: short(tn(o.name)), b: short(tn(n.name))});
    }
    default: return `${who}: ${a.action} ${a.table} ${a.key || ''}`.trim();
  }
}
function auditFilters() { const g = id => document.getElementById(id); return {period: g('auPeriod') ? g('auPeriod').value : 'all', owner: g('auOwner') ? g('auOwner').value : 'all', table: g('auTable') ? g('auTable').value : 'all'}; }
export function filteredAudit(S, f) {
  return (S.audit || []).filter(a => (f.period === 'all' || a.periodId === f.period) && (f.owner === 'all' || a.ownerId === f.owner || a.actor === f.owner) && (f.table === 'all' || a.table === f.table));
}
export function renderAudit() {
  const S = D.S, host = document.getElementById('auditBody'); if (!S || !host) return;
  if (S.auditError) { const cnt0 = document.getElementById('auCount'); if (cnt0) cnt0.textContent = ''; host.innerHTML = `<div class="notice-warn" data-audit-unavailable>${tr('Audit log unavailable — run the MIGRATION block at the end of {file} in the Supabase SQL editor.', {file: '<code>supabase/schema.sql</code>'})} <span class="muted small">(${esc(S.auditError.raw && S.auditError.raw.message || S.auditError.message)})</span></div>`; return; }
  const keep = (sel, html) => { const v = sel.value || 'all'; sel.innerHTML = html; sel.value = [...sel.options].some(x => x.value === v) ? v : 'all'; };
  const pSel = document.getElementById('auPeriod'), oSel = document.getElementById('auOwner'), tSel = document.getElementById('auTable');
  keep(pSel, `<option value="all">${esc(tr('All periods'))}</option>` + C.displayRows(S).map(r => `<option value="${esc(r.id)}">${esc(pl(r))}</option>`).join(''));
  keep(oSel, `<option value="all">${esc(tr('All owners'))}</option>` + C.sortedOwners(S).map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(''));
  const present = new Set((S.audit || []).map(a => a.table));
  keep(tSel, `<option value="all">${esc(tr('All tables'))}</option>` + Object.keys(AUDIT_TABLES).filter(t => present.has(t)).map(t => `<option value="${t}">${esc(tableName(t))}</option>`).join(''));
  const list = filteredAudit(S, auditFilters());
  const cnt = document.getElementById('auCount'); if (cnt) cnt.textContent = tr('{n} of {total} changes', {n: list.length, total: (S.audit || []).length});
  if (!list.length) { host.innerHTML = `<div class="muted">${esc(tr('No changes recorded for this selection.'))}</div>`; return; }
  const act = x => x === 'insert' ? tr('added') : x === 'delete' ? tr('removed') : tr('changed');
  host.innerHTML = `<table class="rp"><thead><tr><th>${esc(tr('When'))}</th><th>${esc(tr('Who'))}</th><th>${esc(tr('Action'))}</th><th>${esc(tr('What'))}</th><th></th></tr></thead><tbody>` + list.map(a =>
    `<tr data-audit="${a.id}"><td class="when">${esc(whenL(a.at, true))}</td><td class="who">${esc(a.actor ? C.ownerName(S, a.actor) : tr('system'))}</td><td><span class="act ${esc(a.action)}">${esc(act(a.action))}</span> <span class="muted small">${esc(tableName(a.table))}</span></td><td class="what">${esc(describeAudit(S, a))}</td>
      <td><details><summary>${esc(tr('raw'))}</summary><pre>old: ${esc(a.old ? JSON.stringify(a.old, null, 1) : '—')}\nnew: ${esc(a.new ? JSON.stringify(a.new, null, 1) : '—')}</pre></details></td></tr>`).join('') + '</tbody></table>';
}
export function auditCSV(S, list) {
  const rows = [trs(['When', 'Who', 'Action', 'Table', 'Key', 'Period', 'Owner', 'What', 'Old', 'New'])];
  (list || S.audit || []).forEach(a => { const row = a.periodId && C.rowById(S, a.periodId);
    rows.push([a.at, a.actor ? C.ownerName(S, a.actor) : tr('system'), a.action, a.table, a.key || '', a.periodId ? (row ? pl(row) : a.periodId) : '', a.ownerId ? C.ownerName(S, a.ownerId) : '', describeAudit(S, a), a.old ? JSON.stringify(a.old) : '', a.new ? JSON.stringify(a.new) : '']); });
  return csvOf(rows);
}
export function exportAuditCSV() { if (!D.S) return; dl(new Blob([auditCSV(D.S, filteredAudit(D.S, auditFilters()))], {type: 'text/csv;charset=utf-8;'}), 'BridgeAID_audit_log.csv'); }
