/* ============================================================================
   ui-tracker.js — period × owner card matrix and the two share bars.
   Rows = owners (A–Z, HB last). Columns = periods newest first, then Incubation, IP.
   All events are delegated from #trackerTable / #trackerTools via data-act attributes.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import * as A from './auth.js';
import { toast, renderAll, requestRender, moveFocus } from './app.js';

const {esc, fmt, fmt1, money} = C;
const COL_KEY = 'bridgeaid:tracker:collapsed';
export let collapsed = new Set();
let firstVisit = true;

export function loadCollapsed() {
  try { const c = window.localStorage.getItem(COL_KEY); if (c != null) { collapsed = new Set(JSON.parse(c)); firstVisit = false; } } catch (e) { /* ignore */ }
}
function saveCollapsed() { try { window.localStorage.setItem(COL_KEY, JSON.stringify([...collapsed])); } catch (e) { /* ignore */ } firstVisit = false; }
function isCurrent(S, r) { return r.kind === 'month' && r.ym === C.currentYm(S); }
function isCollapsed(S, r) { return collapsed.has(r.id) && !isCurrent(S, r); }

export function renderTracker() {
  const S = D.S, tbl = document.getElementById('trackerTable'); if (!S || !tbl) return;
  if (firstVisit && !collapsed.size) { /* first visit: keep current + previous month open */ C.displayRows(S).forEach((r, i) => { if (i >= 2) collapsed.add(r.id); }); firstVisit = false; }
  const owners = C.sortedOwners(S), rows = C.displayRows(S), comp = C.computeAll(S), last = C.ownerCumulative(S), admin = A.canMaster();
  let html = '<thead><tr><th class="corner"><div class="ownhead" style="background:#EEF1F5;border-color:transparent"><div class="nm">Owner</div><div class="cumtot">Cumulative share</div></div></th>';
  rows.forEach(r => {
    const isCur = isCurrent(S, r), col = isCollapsed(S, r), st = C.colStatus(S, r);
    html += `<th class="${col ? 'col-collapsed' : ''}" data-col="${esc(r.id)}"><div class="colhead ${isCur ? 'cur' : ''} ${r.kind !== 'month' ? 'special' : ''}">
      <button class="vlbl arrow" data-act="toggleCol" data-rid="${esc(r.id)}" title="Expand">▶ ${st.fin ? '<span class="fin-badge" title="Finalised — every owner approved">✓</span> ' : ''}${esc(r.label)}</button>
      <div class="top"><div><div class="kind">${r.kind === 'month' ? (isCur ? 'Current month' : 'Month') : 'Special period'}</div><div class="lbl">${esc(r.label)}${st.fin ? ' <span class="fin-badge" title="Finalised — every owner approved">✓</span>' : ''}</div></div>
        <div class="hbtns">${(admin && D.canRemoveMonth(r) && !isCur) ? `<button class="cbtn" data-act="removeRow" data-rid="${esc(r.id)}" title="Remove this month">×</button>` : ''}${isCur ? '' : `<button class="cbtn arrowbtn" data-act="toggleCol" data-rid="${esc(r.id)}" title="Collapse column">◀</button>`}</div></div>
      <div class="tot">Equity hours in period <b>${fmt1(comp[r.id].colTotal)}</b></div>
      <span class="st ${st.cls}">${st.txt}</span>
      ${r.audit.editedBy ? `<div class="audit-line">edited by ${esc(C.ownerName(S, r.audit.editedBy))} · ${C.fmtWhen(r.audit.editedAt)}</div>` : ''}
      <div class="actions2">${(st.fin && admin) ? `<button class="cbtn" data-act="reopenRow" data-rid="${esc(r.id)}">Reopen</button>` : ''}</div></div></th>`;
  });
  html += '</tr></thead><tbody>';
  owners.forEach(o => {
    html += `<tr data-owner="${esc(o.id)}"><td class="rowhead"><div class="ownhead"><div class="nm"><span class="sw" style="background:${C.ownerColor(S, o.id)}"></span>${esc(o.name)}</div>
      <div class="cumtot">Cumulative share</div><div class="cumv">${fmt(last.cumShare ? last.cumShare[o.id] : 0)}%</div><div class="cumh">${fmt1(last.cum ? last.cum[o.id] : 0)} h cumulative</div></div></td>`;
    rows.forEach(r => {
      const col = isCollapsed(S, r), c = C.cellOf(r, o.id), k = comp[r.id].cells[o.id], fin = C.colFinal(S, r), appr = !!r.approvals[o.id];
      const editable = A.canEditCard(o.id) && !fin, mayApprove = A.canApprove(o.id), isM = r.kind === 'month', unit = isM ? 'h' : 'pts', ro = !editable;
      const entries = (c.entries || []).map((e, i) => { const t = C.taskById(S, e.taskId); const name = t ? t.name : (e.taskName || '(removed task)'); const wl = (+e.hours || 0) * (+e.weight);
        return `<tr><td title="${esc((t ? t.cat + ' › ' : '') + name)} · weight ×${fmt(+e.weight)}">${esc(name)} <span class="wt">×${fmt1(+e.weight)}</span></td>
          <td class="h" title="${fmt(+e.hours || 0)} ${unit} × ${fmt(+e.weight)} = ${fmt(wl)}"><input type="number" step="0.25" min="0" value="${e.hours}" data-act="setHours" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}" data-i="${i}" ${ro ? 'disabled' : ''}></td>
          <td class="eq" title="${fmt(+e.hours || 0)} ${unit} × ${fmt(+e.weight)} = ${fmt(wl)}">× ${fmt1(+e.weight)} = <b>${fmt1(wl)}</b></td>
          <td class="x"><button class="xbtn" data-act="delEntry" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}" data-i="${i}" title="Remove">×</button></td></tr>`; }).join('');
      const roleOpts = '<option value="">— role —</option>' + S.roles.map(x => `<option value="${esc(x.id)}" ${c.role === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
      const tb = C.tableFor(S, r.ym);
      html += `<td class="${col ? 'col-collapsed' : ''}" data-col="${esc(r.id)}"><div class="ocard ${fin ? 'final' : ''} ${ro ? 'ro' : ''} ${r.audit.needsReapproval && !appr ? 'needs' : ''}" data-card="${esc(r.id)}:${esc(o.id)}">
        <div class="cum-mini" title="Equity hours in this period">${fmt1(k.equity)} h</div>
        <div><div class="sec">Tasks &amp; ${unit === 'h' ? 'hours' : 'points'}</div><table class="mini"><tbody>${entries || '<tr><td style="color:var(--slate-light)">No entries</td></tr>'}</tbody></table>
          <div class="addent"><input type="text" placeholder="+ type a task from the Task division menu" data-act="acInput" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}" ${ro ? 'disabled' : ''}><div class="ac" hidden></div></div></div>
        <div class="kv rule sum" title="Σ hours × avg. weight = Σ weighted"><span class="k">Σ ${unit === 'h' ? 'hours' : 'points'} <b>${fmt1(k.H)}</b> × avg. weight <b>${fmt1(k.avgW)}</b> =</span><span class="v">Σ weighted <b>${fmt1(k.W)}</b></span></div>
        ${isM ? `<div class="payblk"><div class="sec">Salary this month</div><div class="pay"><select data-act="setRole" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}" ${ro ? 'disabled' : ''}>${roleOpts}</select><input type="text" inputmode="decimal" placeholder="€ gross" value="${c.salary != null ? money(c.salary) : ''}" data-act="setSal" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}" title="Gross salary received for this role, EUR" ${ro ? 'disabled' : ''}></div>
          <div class="kv paid ${k.over ? 'over' : ''}" title="${money(c.salary || 0)} ÷ ${money(k.market)} market (salary table from ${tb ? C.ymLabel(tb.from) : '—'}) × 160 h = paid hours; × average task weight = weighted deduction"><span class="k">Paid hours</span><span class="v">${fmt1(k.paidHours)} h${k.over ? ' (exceeds logged)' : ''} × avg. weight ${fmt1(k.avgW)} = ${fmt1(k.paidW)}</span></div></div>` : ''}
        <div class="kv eq" title="Paid hours are removed at your average task weight (${fmt1(k.avgW)} = Σ weighted ÷ Σ hours)"><span class="k">${fmt1(k.W)} − ${fmt1(k.paidW)} =</span><span class="v">Equity hours <b>${fmt1(k.equity)}</b></span></div>
        <div class="kv rule"><span class="k">Equity in this ${isM ? 'month' : 'period'}</span><span class="v">${fmt(k.monthly)}%</span></div>
        <label class="appr ${appr ? 'done' : ''}"><input type="checkbox" ${appr ? 'checked' : ''} ${mayApprove ? '' : 'disabled'} data-act="setApproval" data-rid="${esc(r.id)}" data-oid="${esc(o.id)}">${appr ? esc(C.approvalLabel(S, r, o.id)) : (mayApprove ? 'Approve this ' + (isM ? 'month' : 'period') : (A.isSignedIn() ? 'Not yet approved' : 'Sign in to approve'))}</label>
      </div></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>'; tbl.innerHTML = html; renderPie();
}

/* two stacked bars: baseline ownership vs. current cumulative equity share */
export function barHTML(title, parts, total) {
  const segs = parts.filter(p => p.v > 0).map(p => { const pct = total > 0 ? p.v / total * 100 : 0; const wide = pct >= 7;
    return `<div class="seg" style="width:${pct}%;background:${p.c};color:${C.ink(p.c)}" title="${esc(p.name)}: ${fmt(pct)}%">${wide ? `<span class="sn">${esc(p.name)}</span><span class="sp">${fmt(pct)}%</span>` : ''}</div>`; }).join('');
  return `<div class="bar-row"><div class="bar-title">${esc(title)}</div><div class="bar">${segs || '<div class="seg empty">no data</div>'}</div></div>`;
}
export function barsHTML(S) {
  const owners = C.sortedOwners(S), last = C.ownerCumulative(S);
  const base = owners.map(o => ({name: o.name, v: +o.baseline || 0, c: C.ownerColor(S, o.id)})); const baseTot = base.reduce((a, p) => a + p.v, 0);
  const cur = owners.map(o => ({name: o.name, v: last.cumShare ? last.cumShare[o.id] : 0, c: C.ownerColor(S, o.id)})); const curTot = cur.reduce((a, p) => a + p.v, 0);
  return barHTML('Baseline ownership', base, baseTot) + barHTML('Current cumulative equity share', cur, curTot)
    + `<div class="bar-legend">${owners.map(o => `<span><i style="background:${C.ownerColor(S, o.id)}"></i>${esc(o.name)}</span>`).join('')}${Math.abs(baseTot - 100) > 0.005 ? `<span class="bar-warn">Baseline sums to ${fmt(baseTot)}% — edit on the Owners tab</span>` : ''}</div>`;
}
export function renderPie() { const host = document.getElementById('bars'); if (!host || !D.S) return; host.innerHTML = barsHTML(D.S); }

/* ---------- collapse / expand ---------- */
export function toggleCol(rid) { const S = D.S; const r = C.rowById(S, rid); if (r && isCurrent(S, r)) return; collapsed.has(rid) ? collapsed.delete(rid) : collapsed.add(rid); saveCollapsed(); renderTracker(); }
export function collapseOlder() { const S = D.S; S.rows.forEach(r => { if (!isCurrent(S, r)) collapsed.add(r.id); }); saveCollapsed(); renderTracker(); }
export function expandAll() { collapsed.clear(); saveCollapsed(); renderTracker(); }

/* ---------- autocomplete ---------- */
let _acSel = -1;
export function acMatches(S, q) { q = q.trim().toLowerCase(); if (!q) return []; return C.allTasks(S).filter(t => t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q)).slice(0, 12); }
function acInput(inp, rid, oid) {
  const box = inp.nextElementSibling, m = acMatches(D.S, inp.value); _acSel = -1;
  if (!m.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = m.map((t, i) => `<div class="ac-item" data-i="${i}" data-act="acPick" data-rid="${esc(rid)}" data-oid="${esc(oid)}" data-tid="${esc(t.id)}"><span class="wt">×${fmt(t.weight)}</span>${esc(t.name)}<small>${esc(t.group)} › ${esc(t.cat)}</small></div>`).join('');
  box.hidden = false;
}
function acKey(e, inp, rid, oid) {
  const box = inp.nextElementSibling; if (!box || box.hidden) return; const items = [...box.querySelectorAll('.ac-item')];
  if (e.key === 'ArrowDown') { e.preventDefault(); _acSel = Math.min(_acSel + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _acSel = Math.max(_acSel - 1, 0); }
  else if (e.key === 'Enter') { e.preventDefault(); const t = acMatches(D.S, inp.value)[_acSel >= 0 ? _acSel : 0]; if (t) acPick(rid, oid, t.id); return; }
  else if (e.key === 'Escape') { box.hidden = true; return; }
  items.forEach((it, i) => it.classList.toggle('sel', i === _acSel));
}
function acHide(inp) { const b = inp && inp.nextElementSibling; if (b) b.hidden = true; }
export function acPick(rid, oid, tid) {
  const row = C.rowById(D.S, rid); if (!row || C.colFinal(D.S, row) || !A.canEditCard(oid)) return;
  D.addEntry(rid, oid, tid); renderAll();
}

/* Enter in an hours field: save now and jump to the next hours field of the card (blur after the last one) */
function commitHoursAndAdvance(el) {
  const card = el.closest('.ocard'); const inputs = card ? [...card.querySelectorAll('input[data-act="setHours"]')] : []; const i = inputs.indexOf(el);
  D.flushPending();
  if (i >= 0 && i < inputs.length - 1) { const next = inputs[i + 1]; moveFocus(() => next.focus()); if (next.select) next.select(); requestRender(); }
  else el.blur();
}

/* ---------- actions ---------- */
function guard(rid, oid) { const row = C.rowById(D.S, rid); if (!row) return false; if (C.colFinal(D.S, row)) { toast('This period is finalised — an admin must reopen it first.', 'err'); return false; } if (!A.canEditCard(oid)) { toast(A.isSignedIn() ? 'You can only edit your own card.' : 'Sign in to edit.', 'err'); return false; } return true; }
export function setHours(rid, oid, i, v) { if (!guard(rid, oid)) return; D.setHours(rid, oid, i, v); requestRender(); }
export function delEntry(rid, oid, i) { if (!guard(rid, oid)) return; D.delEntry(rid, oid, i); renderAll(); }
export function setRole(rid, oid, v) { if (!guard(rid, oid)) return; D.setSalary(rid, oid, {role: v || null}); renderAll(); }
export function setSal(rid, oid, v) { if (!guard(rid, oid)) return; const n = C.parseMoney(v); D.setSalary(rid, oid, {salary: isNaN(n) ? null : n}); renderAll(); }
export function setApproval(rid, oid, checked) {
  if (!A.canApprove(oid)) { toast(A.isSignedIn() ? 'You can only approve as yourself.' : 'Sign in to approve.', 'err'); renderTracker(); return; }
  D.setApproval(rid, oid, checked); renderAll(); toast(checked ? 'Approved.' : 'Approval withdrawn.', 'ok');
}
export function reopenRow(rid) { if (!A.canMaster()) return; if (!window.confirm('Reopen this finalised period? All approvals will be cleared.')) return; D.reopen(rid); renderAll(); }
export function removeRow(rid) { if (!A.canMaster()) return; const row = C.rowById(D.S, rid); if (!D.canRemoveMonth(row)) return; if (!window.confirm(`Remove ${row.label}? Its entries will be deleted.`)) return; D.removeMonth(rid); renderAll(); }
export function addMonth() { if (!A.canMaster()) return; const r = D.addMonth(); renderAll(); toast(`Added ${r.label}.`, 'ok'); }

/* ---------- wiring (once) ---------- */
export function initTracker() {
  loadCollapsed();
  const tbl = document.getElementById('trackerTable'), tools = document.getElementById('trackerTools'); if (!tbl) return;
  const ds = el => el.dataset;
  tools.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; ({addMonth, collapseOlder, expandAll})[b.dataset.act]?.(); });
  tbl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const d = ds(b);
    switch (d.act) {
      case 'toggleCol': toggleCol(d.rid); break;
      case 'removeRow': removeRow(d.rid); break;
      case 'reopenRow': reopenRow(d.rid); break;
      case 'delEntry': delEntry(d.rid, d.oid, +d.i); break;
    }
  });
  tbl.addEventListener('mousedown', e => { const b = e.target.closest('[data-act="acPick"]'); if (b) { e.preventDefault(); acPick(b.dataset.rid, b.dataset.oid, b.dataset.tid); } });
  tbl.addEventListener('input', e => {
    const el = e.target, d = ds(el); if (!d.act) return;
    if (d.act === 'setHours') setHours(d.rid, d.oid, +d.i, el.value);
    else if (d.act === 'acInput') acInput(el, d.rid, d.oid);
  });
  tbl.addEventListener('change', e => {
    const el = e.target, d = ds(el); if (!d.act) return;
    if (d.act === 'setRole') setRole(d.rid, d.oid, el.value);
    else if (d.act === 'setSal') setSal(d.rid, d.oid, el.value);
    else if (d.act === 'setApproval') setApproval(d.rid, d.oid, el.checked);
  });
  tbl.addEventListener('focusin', e => { const el = e.target; if (el.dataset && (el.dataset.act === 'setHours' || el.dataset.act === 'setSal')) el.dataset.prev = el.value; });
  tbl.addEventListener('keydown', e => {
    const el = e.target, d = el.dataset || {};
    if (d.act === 'acInput') { acKey(e, el, d.rid, d.oid); return; }
    if (d.act === 'setHours') {
      if (e.key === 'Enter') { e.preventDefault(); commitHoursAndAdvance(el); }
      else if (e.key === 'Escape') { e.preventDefault(); el.value = d.prev ?? el.value; setHours(d.rid, d.oid, +d.i, el.value); }
    } else if (d.act === 'setSal') {
      if (e.key === 'Enter') { e.preventDefault(); setSal(d.rid, d.oid, el.value); }
      else if (e.key === 'Escape') { e.preventDefault(); el.value = d.prev ?? el.value; }
    }
  });
  tbl.addEventListener('focusout', e => { const el = e.target; if (el.dataset && el.dataset.act === 'acInput') setTimeout(() => acHide(el), 150); });
}
