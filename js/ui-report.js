/* ============================================================================
   ui-report.js — work log & task report (by task / by person / payments) and the exports:
   work-log CSV, full CSV (sectioned), PDF (one page per period + graphs + master data).
   The builders (worklogCSV, buildFullCSV, buildPrintDoc) are testable without a browser download.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import { toast } from './app.js';

const {esc, fmt, fmt1, money, ymLabel} = C;
let reportView = 'task';

export function setReportView(v) { reportView = v; document.querySelectorAll('#rpTools .segb').forEach(b => b.classList.toggle('active', b.dataset.view === v)); renderReport(); }
export function getReportView() { return reportView; }
function reportFilters() { const p = document.getElementById('rpPeriod'), o = document.getElementById('rpOwner'); return {period: p ? p.value : 'all', owner: o ? o.value : 'all'}; }
function hbar(v, max, color) { const w = max > 0 ? Math.max(2, v / max * 100) : 0; return `<div class="hb"><span style="width:${w}%;background:${color || 'var(--navy)'}"></span></div>`; }

export function renderReport() {
  const S = D.S, host = document.getElementById('reportBody'); if (!S || !host) return;
  const pSel = document.getElementById('rpPeriod'), oSel = document.getElementById('rpOwner'); const pv = pSel.value || 'all', ov = oSel.value || 'all';
  pSel.innerHTML = '<option value="all">All periods</option>' + C.displayRows(S).map(r => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join(''); pSel.value = [...pSel.options].some(x => x.value === pv) ? pv : 'all';
  oSel.innerHTML = '<option value="all">All owners</option>' + C.sortedOwners(S).map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(''); oSel.value = [...oSel.options].some(x => x.value === ov) ? ov : 'all';
  const f = reportFilters(); const rows = C.worklogRows(S).filter(x => (f.period === 'all' || x.period.id === f.period) && (f.owner === 'all' || x.owner.id === f.owner));
  const totalH = rows.reduce((a, x) => a + x.hours, 0), totalW = rows.reduce((a, x) => a + x.hours * x.weight, 0);
  const oc = id => C.ownerColor(S, id);
  if (reportView === 'task') {
    const by = {}; rows.forEach(x => { const k = x.task.id; by[k] = by[k] || {task: x.task, hours: 0, weighted: 0, owners: {}, periods: new Set()}; by[k].hours += x.hours; by[k].weighted += x.hours * x.weight; by[k].owners[x.owner.id] = (by[k].owners[x.owner.id] || 0) + x.hours; by[k].periods.add(x.period.id); });
    const list = Object.values(by).sort((a, b) => b.hours - a.hours); const max = list.length ? list[0].hours : 0;
    host.innerHTML = `<div class="rp-sum">Total logged <b>${fmt1(totalH)} h</b> · weighted <b>${fmt1(totalW)}</b> · ${list.length} tasks</div>
      ${list.length ? `<table class="rp"><thead><tr><th>Task</th><th>Category</th><th class="r">Hours</th><th class="r">% of total</th><th class="r">Weighted</th><th class="r">Periods</th><th>Who worked on it</th><th class="bar-col">Time share</th></tr></thead><tbody>` +
      list.map(x => `<tr><td><b>${esc(x.task.name)}</b></td><td class="muted">${esc(x.task.group)}${x.task.group ? ' › ' : ''}${esc(x.task.cat)}</td><td class="r">${fmt1(x.hours)}</td><td class="r">${fmt(totalH ? x.hours / totalH * 100 : 0)}%</td><td class="r muted">${fmt1(x.weighted)}</td><td class="r muted">${x.periods.size}</td>
        <td>${Object.entries(x.owners).sort((a, b) => b[1] - a[1]).map(([id, h]) => `<span class="chip" style="border-color:${oc(id)}"><i style="background:${oc(id)}"></i>${esc(C.ownerName(S, id))} ${fmt1(h)} h</span>`).join(' ')}</td><td class="bar-col">${hbar(x.hours, max)}</td></tr>`).join('') + `</tbody></table>` : '<div class="muted">No logged work for this selection.</div>'}`;
  } else if (reportView === 'person') {
    const owners = C.sortedOwners(S).filter(o => f.owner === 'all' || o.id === f.owner); let html = `<div class="rp-sum">Total logged <b>${fmt1(totalH)} h</b> · weighted <b>${fmt1(totalW)}</b></div>`;
    owners.forEach(o => { const mine = rows.filter(x => x.owner.id === o.id); const by = {}; mine.forEach(x => { by[x.task.id] = by[x.task.id] || {task: x.task, hours: 0, weighted: 0, periods: new Set()}; by[x.task.id].hours += x.hours; by[x.task.id].weighted += x.hours * x.weight; by[x.task.id].periods.add(x.period.id); });
      const list = Object.values(by).sort((a, b) => b.hours - a.hours); const oh = mine.reduce((a, x) => a + x.hours, 0), ow = mine.reduce((a, x) => a + x.hours * x.weight, 0); const max = list.length ? list[0].hours : 0;
      html += `<div class="rp-person" data-owner="${esc(o.id)}"><div class="rp-ph"><span class="sw" style="background:${oc(o.id)}"></span><b>${esc(o.name)}</b><span class="muted">${fmt1(oh)} h logged · weighted ${fmt1(ow)} · avg. weight ${fmt1(oh ? ow / oh : 0)}</span></div>
        ${list.length ? `<table class="rp"><thead><tr><th>Task</th><th>Category</th><th class="r">Hours</th><th class="r">% of own</th><th class="r">Weighted</th><th class="r">Periods</th><th class="bar-col"></th></tr></thead><tbody>` + list.map(x => `<tr><td>${esc(x.task.name)}</td><td class="muted">${esc(x.task.cat)}</td><td class="r">${fmt1(x.hours)}</td><td class="r">${fmt(oh ? x.hours / oh * 100 : 0)}%</td><td class="r muted">${fmt1(x.weighted)}</td><td class="r muted">${x.periods.size}</td><td class="bar-col">${hbar(x.hours, max, oc(o.id))}</td></tr>`).join('') + `</tbody></table>` : '<div class="muted">No logged work.</div>'}</div>`; });
    host.innerHTML = html;
  } else {
    const periods = C.chronoRows(S).filter(r => r.kind === 'month' && (f.period === 'all' || r.id === f.period)).slice().reverse(); const owners = C.sortedOwners(S).filter(o => f.owner === 'all' || o.id === f.owner); const comp = C.computeAll(S);
    const tot = {}; owners.forEach(o => tot[o.id] = {sal: 0, paidH: 0, H: 0}); let grand = 0;
    let html = `<table class="rp"><thead><tr><th>Month</th>${owners.map(o => `<th class="r">${esc(o.name)}</th>`).join('')}<th class="r">Month total</th></tr></thead><tbody>`;
    periods.forEach(r => { let mt = 0; html += `<tr><td><b>${esc(r.label)}</b></td>` + owners.map(o => { const c = r.cells[o.id] || {}; const k = comp[r.id].cells[o.id]; const sal = +c.salary || 0; mt += sal; tot[o.id].sal += sal; tot[o.id].paidH += Math.min(k.paidHours, k.H); tot[o.id].H += k.H; const role = C.roleName(S, c.role);
      return `<td class="r">${sal ? `<b>${money(sal)}</b><div class="muted small">${esc(role)} · ${fmt1(k.paidHours)} h paid${k.over ? ' ⚠' : ''}</div>` : '<span class="muted">—</span>'}</td>`; }).join('') + `<td class="r"><b>${money(mt)}</b></td></tr>`; grand += mt; });
    html += `</tbody><tfoot><tr><td>Total</td>${owners.map(o => `<td class="r"><b>${money(tot[o.id].sal)}</b><div class="muted small">${fmt1(tot[o.id].paidH)} of ${fmt1(tot[o.id].H)} h paid</div></td>`).join('')}<td class="r"><b>${money(grand)}</b></td></tr></tfoot></table>`;
    host.innerHTML = html;
  }
}

/* ---------- CSV ---------- */
export function csvOf(rows) { return rows.map(r => r.map(c => { c = String(c ?? ''); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n'); }
export function dl(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); }
export function worklogCSV(S) {
  const rows = [['Period', 'Owner', 'Group', 'Category', 'Task', 'Hours', 'Weight', 'Weighted']];
  C.worklogRows(S).forEach(x => rows.push([x.period.label, x.owner.name, x.task.group, x.task.cat, x.task.name, fmt(x.hours), fmt(x.weight), fmt(x.hours * x.weight)]));
  return csvOf(rows);
}
export function exportWorklogCSV() { if (!D.S) return; dl(new Blob([worklogCSV(D.S)], {type: 'text/csv;charset=utf-8;'}), 'BridgeAID_worklog.csv'); }
/* Full export: master data + per-period summary + every logged entry + payments, in one CSV with section headers. */
export function buildFullCSV(S) {
  const owners = C.sortedOwners(S), comp = C.computeAll(S), R = [];
  R.push(['# BRIDGEAID MONTHLY OWNERSHIP TRACKER — FULL EXPORT', new Date().toISOString()]); R.push([]);
  R.push(['# OWNERS']); R.push(['Owner', 'Id', 'Baseline %', 'Cumulative equity hours', 'Cumulative share %']); const last = C.ownerCumulative(S);
  owners.forEach(o => R.push([o.name, o.id, fmt(+o.baseline || 0), fmt(last.cum ? last.cum[o.id] : 0), fmt(last.cumShare ? last.cumShare[o.id] : 0)])); R.push([]);
  R.push(['# SALARY TABLES (monthly gross, 160 h) — versioned']); R.push(['Effective from', 'HUF→EUR', 'Role', 'Role id', 'Monthly gross HUF', '≈ EUR / month', 'EUR / hour']);
  C.tablesSorted(S).forEach(tb => S.roles.forEach(r => { const eur = (+tb.huf[r.id] || 0) / (+tb.fx || C.DEFAULT_FX); R.push([ymLabel(tb.from), fmt(tb.fx), r.name, r.id, fmt(+tb.huf[r.id] || 0), fmt(eur), fmt(eur / C.HOURS_PER_MONTH)]); })); R.push([]);
  R.push(['# TASK CATALOG']); R.push(['Group', 'Category', 'Category id', 'Task', 'Task id', 'Weight']);
  S.catalog.groups.forEach(g => g.categories.forEach(c => c.subs.forEach(s => R.push([g.name, c.name, c.code || c.id, s.name, s.id, fmt(s.weight)])))); R.push([]);
  R.push(['# PERIOD SUMMARY (per owner)']); R.push(['Period', 'Kind', 'Owner', 'Logged', 'Weighted', 'Avg weight', 'Role', 'Salary EUR', 'Paid hours', 'Paid weighted', 'Unpaid hours', 'Equity hours', 'Share this period %', 'Cumulative equity hours', 'Cumulative share %', 'Column status', 'Approval']);
  C.displayRows(S).forEach(r => owners.forEach(o => { const k = comp[r.id].cells[o.id], c = C.cellOf(r, o.id); const st = C.colFinal(S, r) ? 'finalised' : (r.audit.needsReapproval ? 're-approval needed' : `approved ${C.colApproved(S, r)}/${owners.length}`);
    R.push([r.label, r.kind, o.name, fmt(k.H), fmt(k.W), fmt(k.avgW), C.roleName(S, c.role), c.salary != null ? fmt(c.salary) : '', fmt(k.paidHours), fmt(k.paidW), fmt(k.unpaidHours), fmt(k.equity), fmt(k.monthly), fmt(comp[r.id].cum[o.id]), fmt(comp[r.id].cumShare[o.id]), st, C.approvalLabel(S, r, o.id) || 'not approved']); })); R.push([]);
  R.push(['# WORK LOG (every entry)']); R.push(['Period', 'Kind', 'Owner', 'Group', 'Category', 'Task', 'Hours', 'Weight (snapshot)', 'Weighted']);
  C.worklogRows(S).forEach(x => R.push([x.period.label, x.period.kind, x.owner.name, x.task.group, x.task.cat, x.task.name, fmt(x.hours), fmt(x.weight), fmt(x.hours * x.weight)])); R.push([]);
  R.push(['# PAYMENTS']); R.push(['Month', 'Owner', 'Role', 'Salary EUR', 'Role market EUR', 'Paid hours', 'Logged hours']);
  C.displayRows(S).filter(r => r.kind === 'month').forEach(r => owners.forEach(o => { const c = r.cells[o.id]; if (!c || (c.salary == null && !c.role)) return; const k = comp[r.id].cells[o.id]; R.push([r.label, o.name, C.roleName(S, c.role), fmt(+c.salary || 0), fmt(k.market), fmt(k.paidHours), fmt(k.H)]); }));
  return csvOf(R);
}
export function exportCSV() { if (!D.S) return; dl(new Blob([buildFullCSV(D.S)], {type: 'text/csv;charset=utf-8;'}), 'BridgeAID_monthly_ownership_full.csv'); }

/* ---------- PDF: one page per period + graphs + master data ----------
   Builds an off-screen print document (.pdf-page sections), renders each section with
   html2canvas and places it on its own PDF page (tall sections continue on extra pages). */
function pdfOwnerCard(S, r, o, k, c) {
  const isM = r.kind === 'month', unit = isM ? 'h' : 'pts'; const role = C.roleName(S, c.role);
  const rows = (c.entries || []).map(e => { const tk = C.taskById(S, e.taskId); return `<tr><td>${esc(tk ? tk.name : (e.taskName || '(removed task)'))}</td><td class="r">${fmt1(+e.hours || 0)}</td><td class="r">×${fmt1(+e.weight)}</td><td class="r">${fmt1((+e.hours || 0) * (+e.weight))}</td></tr>`; }).join('');
  return `<div class="pcard"><div class="ph"><span class="sw" style="background:${C.ownerColor(S, o.id)}"></span><b>${esc(o.name)}</b><span class="st">${r.approvals[o.id] ? '✓ ' + esc(C.approvalLabel(S, r, o.id)) : 'not approved'}</span></div>
    <table class="pt"><thead><tr><th>Task</th><th class="r">${unit}</th><th class="r">w</th><th class="r">weighted</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">no entries</td></tr>'}</tbody>
    <tfoot><tr><td>Σ ${fmt1(k.H)} ${unit} × avg. weight ${fmt1(k.avgW)}</td><td colspan="3" class="r">Σ weighted <b>${fmt1(k.W)}</b></td></tr></tfoot></table>
    ${isM ? `<div class="kvp"><span>Salary: ${role ? esc(role) + ' · ' : ''}${c.salary != null ? money(c.salary) : '—'}</span><span>Paid hours ${fmt1(k.paidHours)} h × ${fmt1(k.avgW)} = ${fmt1(k.paidW)}</span></div>` : ''}
    <div class="kvp eq"><span>${fmt1(k.W)} − ${fmt1(k.paidW)} = Equity hours <b>${fmt1(k.equity)}</b></span><span>Share <b>${fmt(k.monthly)}%</b></span></div></div>`;
}
export function buildPrintDoc(S, barsHtml) {
  const owners = C.sortedOwners(S), comp = C.computeAll(S), last = C.ownerCumulative(S); const wrap = document.createElement('div'); wrap.id = 'printDoc'; wrap.className = 'printdoc';
  let html = `<section class="pdf-page" data-page="cover"><h1>BridgeAID — Monthly Ownership Tracker</h1><div class="muted">Exported ${new Date().toLocaleString('en-GB')}</div>
    <h2>Ownership</h2><div class="sharebars">${barsHtml || ''}</div>
    <table class="pt wide"><thead><tr><th>Owner</th><th class="r">Baseline %</th><th class="r">Cumulative equity hours</th><th class="r">Cumulative share %</th></tr></thead><tbody>${owners.map(o => `<tr><td>${esc(o.name)}</td><td class="r">${fmt(+o.baseline || 0)}</td><td class="r">${fmt1(last.cum ? last.cum[o.id] : 0)}</td><td class="r"><b>${fmt(last.cumShare ? last.cumShare[o.id] : 0)}%</b></td></tr>`).join('')}</tbody></table></section>`;
  C.displayRows(S).forEach(r => { const st = C.colStatus(S, r).txt;
    html += `<section class="pdf-page" data-page="${esc(r.id)}"><h1>${esc(r.label)} <span class="tag">${st}</span></h1><div class="muted">Equity hours in period: <b>${fmt1(comp[r.id].colTotal)}</b> · cumulative total after this period: <b>${fmt1(comp[r.id].cumTot)}</b></div>
      <div class="pgrid">${owners.map(o => pdfOwnerCard(S, r, o, comp[r.id].cells[o.id], C.cellOf(r, o.id))).join('')}</div>
      <table class="pt wide"><thead><tr><th>Owner</th><th class="r">Equity hours</th><th class="r">Share this period</th><th class="r">Cumulative hours</th><th class="r">Cumulative share</th></tr></thead><tbody>${owners.map(o => `<tr><td>${esc(o.name)}</td><td class="r">${fmt1(comp[r.id].cells[o.id].equity)}</td><td class="r">${fmt(comp[r.id].cells[o.id].monthly)}%</td><td class="r">${fmt1(comp[r.id].cum[o.id])}</td><td class="r"><b>${fmt(comp[r.id].cumShare[o.id])}%</b></td></tr>`).join('')}</tbody></table></section>`; });
  html += `<section class="pdf-page" data-page="master"><h1>Master data</h1>${C.tablesSorted(S).map(tb => `<h2>Role market salaries — effective from ${ymLabel(tb.from)} · HUF→EUR ${fmt(tb.fx)}</h2>
    <table class="pt wide"><thead><tr><th>Role</th><th class="r">HUF / month</th><th class="r">EUR / month</th><th class="r">EUR / hour</th></tr></thead><tbody>${S.roles.map(x => { const eur = (+tb.huf[x.id] || 0) / (+tb.fx || C.DEFAULT_FX); return `<tr><td>${esc(x.name)}</td><td class="r">${(+tb.huf[x.id] || 0).toLocaleString('en-US')}</td><td class="r">${money(eur)}</td><td class="r">${money(eur / C.HOURS_PER_MONTH)}</td></tr>`; }).join('')}</tbody></table>`).join('')}
    <h2>Task catalog &amp; weights</h2>${S.catalog.groups.map(g => `<h3>${esc(g.name)}</h3>` + g.categories.map(c => `<table class="pt wide"><thead><tr><th>${esc(c.code || c.id)} — ${esc(c.name)}</th><th class="r">weight</th></tr></thead><tbody>${c.subs.map(s => `<tr><td>${esc(s.name)}</td><td class="r">${fmt1(s.weight)}</td></tr>`).join('')}</tbody></table>`).join('')).join('')}</section>`;
  wrap.innerHTML = html;
  return wrap;
}
export async function exportPDF() {
  if (!D.S) return;
  if (typeof window.html2canvas === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) { window.alert('PDF export needs html2canvas + jsPDF (offline/blocked). CSV still works.'); return; }
  const bars = document.getElementById('bars'); const wrap = buildPrintDoc(D.S, bars ? bars.innerHTML : ''); document.body.appendChild(wrap);
  await new Promise(r => window.requestAnimationFrame(() => setTimeout(r, 80)));
  const {jsPDF} = window.jspdf; const pdf = new jsPDF({orientation: 'portrait', unit: 'pt', format: 'a4'}); const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 24, imgW = pw - 2 * m, pageH = ph - 2 * m; let first = true;
  try {
    for (const sec of wrap.querySelectorAll('.pdf-page')) {
      const c = await window.html2canvas(sec, {scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: sec.scrollWidth}); const imgH = imgW * c.height / c.width; let rem = imgH, sy = 0;
      while (rem > 0) { if (!first) pdf.addPage(); first = false; const sl = Math.min(pageH, rem), srcH = sl * c.width / imgW; const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = srcH; tmp.getContext('2d').drawImage(c, 0, sy, c.width, srcH, 0, 0, c.width, srcH); pdf.addImage(tmp.toDataURL('image/png'), 'PNG', m, m, imgW, sl); rem -= sl; sy += srcH; }
    }
    pdf.save('BridgeAID_monthly_ownership.pdf');
  } catch (e) { console.error(e); toast('PDF export failed: ' + (e.message || e), 'err'); }
  finally { wrap.remove(); }
}

export function initReport() {
  const tools = document.getElementById('rpTools'); if (!tools) return;
  tools.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; if (b.dataset.act === 'setReportView') setReportView(b.dataset.view); else if (b.dataset.act === 'exportWorklogCsv') exportWorklogCSV(); });
  tools.addEventListener('change', e => { if (e.target.id === 'rpPeriod' || e.target.id === 'rpOwner') renderReport(); });
}
