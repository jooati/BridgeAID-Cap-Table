/* ============================================================================
   ui-owners.js — Owners, roles & setup tab:
   • salary-table matrix: rows = roles (cards), columns = salary tables newest first (collapsible except the newest)
   • owners: name, baseline %, id — and for admins the Owners ↔ users link (auth accounts via the list_auth_users RPC)
   Non-admins see everything read-only.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import * as A from './auth.js';
import { toast, renderAll, requestRender } from './app.js';

const {esc, fmt, money, ymLabel} = C;
let collapsedTables = new Set();
let authUsers = null, authUsersLoading = null;   // [{id,email}] for admins

/* Salary matrix: header = effective-from month + HUF→EUR rate; card = HUF input + EUR/month, EUR/hour */
export function renderSalaryMatrix() {
  const S = D.S, host = document.getElementById('salaryTables'); if (!S || !host) return;
  const ro = !A.canMaster(), dis = ro ? 'disabled' : '';
  const ts = C.tablesSorted(S).slice().reverse();                        // newest first
  const allMonths = (() => { const a = []; let ym = C.START_YM; const end = C.incYm(C.nextYm(S)); while (ym < end) { a.push(ym); ym = C.incYm(ym); } return a; })();
  let html = '<thead><tr><th class="corner"><div class="ownhead" style="background:#EEF1F5;border-color:transparent"><div class="nm">Role</div><div class="cumtot">monthly gross, 160 h</div></div></th>';
  ts.forEach((tb, ti) => {
    const newest = ti === 0, col = collapsedTables.has(tb.from) && !newest; const until = newest ? 'in force now' : `until ${ymLabel(C.decYm(ts[ti - 1].from))}`;
    html += `<th class="${col ? 'col-collapsed' : ''}" data-col="${esc(tb.from)}"><div class="colhead ${newest ? 'cur' : ''}"><button class="vlbl arrow" data-act="toggleTableCol" data-from="${esc(tb.from)}" title="Expand">▶ ${ymLabel(tb.from)}</button>
      <div class="top"><div><div class="kind">${newest ? 'Newest table' : 'Salary table'}</div><div class="lbl">from <select class="hsel" data-act="setTableFrom" data-tid="${esc(tb.id)}" ${dis}>${allMonths.map(m => `<option value="${m}" ${m === tb.from ? 'selected' : ''}>${ymLabel(m)}</option>`).join('')}</select></div></div>
        <div class="hbtns">${(ts.length > 1 && !ro) ? `<button class="cbtn" data-act="delSalaryTable" data-tid="${esc(tb.id)}" title="Remove this table">×</button>` : ''}${newest ? '' : `<button class="cbtn arrowbtn" data-act="toggleTableCol" data-from="${esc(tb.from)}" title="Collapse">◀</button>`}</div></div>
      <div class="tot">HUF → EUR <input class="hfx" type="number" step="0.1" min="1" value="${tb.fx}" data-act="setTableFx" data-tid="${esc(tb.id)}" ${dis}></div><span class="st">${until}</span></div></th>`;
  });
  html += '</tr></thead><tbody>';
  S.roles.forEach(r => {
    html += `<tr data-role="${esc(r.id)}"><td class="rowhead"><div class="ownhead"><div class="nm"><input class="rname" type="text" value="${esc(r.name)}" data-act="roleName" data-rid="${esc(r.id)}" ${dis}></div><div class="cumtot">role</div>${ro ? '' : `<button class="xbtn" data-act="delRole" data-rid="${esc(r.id)}" title="Remove role">× remove</button>`}</div></td>`;
    ts.forEach((tb, ti) => {
      const newest = ti === 0, col = collapsedTables.has(tb.from) && !newest; const huf = +tb.huf[r.id] || 0, eur = huf / (+tb.fx || C.DEFAULT_FX);
      html += `<td class="${col ? 'col-collapsed' : ''}" data-col="${esc(tb.from)}"><div class="ocard"><div class="cum-mini">${money(eur)}</div>
        <div><div class="sec">Monthly gross (HUF)</div><input class="hufin" type="number" step="10000" min="0" value="${huf}" data-act="setTableHuf" data-tid="${esc(tb.id)}" data-rid="${esc(r.id)}" ${dis}></div>
        <div class="kv"><span class="k">≈ EUR / month</span><span class="v">${money(eur)}</span></div>
        <div class="kv rule"><span class="k">EUR / hour</span><span class="v">${money(eur / C.HOURS_PER_MONTH)}</span></div></div></td>`;
    });
    html += '</tr>';
  });
  host.classList.toggle('ro-master', ro);
  host.innerHTML = html + '</tbody>';
}
export function toggleTableCol(from) { collapsedTables.has(from) ? collapsedTables.delete(from) : collapsedTables.add(from); renderSalaryMatrix(); }
export function collapseOlderTables() { const ts = C.tablesSorted(D.S); ts.forEach((tb, i) => { if (i < ts.length - 1) collapsedTables.add(tb.from); }); renderSalaryMatrix(); }
export function expandAllTables() { collapsedTables.clear(); renderSalaryMatrix(); }
export function setTableFrom(tid, v) { if (!A.canMaster()) return; const r = D.updateSalaryTable(tid, {from: v}); if (r && r.error) { toast(r.error, 'err'); renderOwners(); return; } renderAll(); }
export function setTableFx(tid, v) { if (!A.canMaster()) return; D.updateSalaryTable(tid, {fx: v}); renderAll(); }
export function setTableHuf(tid, rid, v) { if (!A.canMaster()) return; D.setRate(tid, rid, v); renderAll(); }
export function addSalaryTable() { if (!A.canMaster()) return; const r = D.addSalaryTable(); renderAll(); toast(`New salary table from ${ymLabel(r.from)} — copied from the previous one; adjust the values and the month.`, 'ok'); }
export function delSalaryTable(tid) { if (!A.canMaster() || D.S.salaryTables.length <= 1) return; if (!window.confirm('Remove this salary table? Months it covered will fall back to the previous table.')) return; D.delSalaryTable(tid); renderAll(); }
export function addRole() { if (!A.canMaster()) return; const name = window.prompt('Role name:'); if (!name) return; D.addRole(name.trim()); renderAll(); }
export function delRole(rid) { if (!A.canMaster()) return; if (D.roleInUse(rid) && !window.confirm('This role is used on some cards (their paid hours will become 0). Delete anyway?')) return; D.delRole(rid); renderAll(); }

/* ---------- owners list + Owners ↔ users ---------- */
export function renderOwnerList() {
  const S = D.S, host = document.getElementById('ownerList'); if (!S || !host) return;
  const admin = A.canMaster(), dis = admin ? '' : 'disabled';
  const users = authUsers || [];
  const linkCell = o => {
    if (!admin) return `<span class="linked ${o.authUid ? '' : 'none'}">${o.authUid ? 'linked to a sign-in account' : 'not linked'}</span>`;
    const known = o.authUid && !users.some(u => u.id === o.authUid);
    return `<span class="linked"><select data-act="linkOwner" data-oid="${esc(o.id)}" title="Sign-in account (auth user) for this owner"><option value="">— not linked —</option>${users.map(u => `<option value="${esc(u.id)}" ${u.id === o.authUid ? 'selected' : ''}>${esc(u.email || u.id)}</option>`).join('')}${known ? `<option value="${esc(o.authUid)}" selected>(unknown user ${esc(String(o.authUid).slice(0, 8))}…)</option>` : ''}</select>
      <label class="chk adm" title="Admins maintain master data, periods and user links"><input type="checkbox" data-act="setAdmin" data-oid="${esc(o.id)}" ${o.isAdmin ? 'checked' : ''}>admin</label></span>`;
  };
  host.classList.toggle('ro-master', !admin);
  host.innerHTML = `<div class="own-head"><span>Name</span><span>Baseline %</span><span>id</span><span>Sign-in account</span><span></span></div>` +
    (C.sortedOwners(S).map(o => `<div class="own-row" data-oid="${esc(o.id)}"><input type="text" value="${esc(o.name)}" data-act="renameOwner" data-oid="${esc(o.id)}" ${dis}><span class="bl"><input type="number" step="0.01" min="0" max="100" value="${fmt(+o.baseline || 0)}" data-act="setBaseline" data-oid="${esc(o.id)}" ${dis}>%</span><span class="oid">${esc(o.id)}${o.isAdmin && !admin ? ' · admin' : ''}</span>${linkCell(o)}${admin ? `<button class="xbtn" data-act="removeOwner" data-oid="${esc(o.id)}">×</button>` : '<span></span>'}</div>`).join('') || '<div style="color:var(--slate-light)">No owners yet.</div>') +
    (admin && authUsers === null ? '<p class="note">Loading sign-in accounts…</p>' : '') +
    (admin && authUsers && !authUsers.length ? '<p class="note">No sign-in accounts yet — create the users in Supabase → Authentication → Users, then link them here.</p>' : '');
}
async function ensureAuthUsers() {
  if (!A.canMaster() || authUsers || authUsersLoading) return;
  authUsersLoading = D.listAuthUsers().then(list => { authUsers = list; renderOwnerList(); }).catch(e => { authUsers = []; console.warn(e); toast('Could not list sign-in accounts: ' + (e.message || e), 'err'); renderOwnerList(); }).finally(() => { authUsersLoading = null; });
}
export function invalidateAuthUsers() { authUsers = null; }
export function renderOwners() {
  const note = document.getElementById('roleNote'); if (note) note.hidden = A.canMaster();
  renderSalaryMatrix(); renderOwnerList(); ensureAuthUsers();
}
export function addOwner() { if (!A.canMaster()) return; const name = window.prompt('Owner name:'); if (!name) return; D.addOwner(name.trim()); renderAll(); }
export function setBaseline(oid, v) { if (!A.canMaster()) return; D.updateOwner(oid, {baseline: v}); renderAll(); }
export function renameOwner(oid, v) { if (!A.canMaster()) return; D.updateOwner(oid, {name: v}); requestRender(); }
export function removeOwner(oid) { if (!A.canMaster()) return; if (!window.confirm(`Remove ${C.ownerName(D.S, oid)}? Their entries and approvals will be deleted from every period.`)) return; D.removeOwner(oid); renderAll(); }
export function linkOwner(oid, uid) {
  if (!A.canMaster()) return;
  const other = D.S.owners.find(o => o.id !== oid && uid && o.authUid === uid);
  if (other) { toast(`That account is already linked to ${other.name} — unlink it there first.`, 'err'); renderOwnerList(); return; }
  D.updateOwner(oid, {authUid: uid || null}); A.resolveOwner(); renderAll(); toast(uid ? 'Account linked.' : 'Account unlinked.', 'ok');
}
export function setAdmin(oid, on) {
  if (!A.canMaster()) return;
  if (!on && A.owner && A.owner.id === oid && !window.confirm('Remove your own admin rights? You will not be able to undo this yourself.')) { renderOwnerList(); return; }
  D.updateOwner(oid, {isAdmin: on}); A.resolveOwner(); renderAll();
}

export function initOwners() {
  const body = document.getElementById('ownersBody'); if (!body) return;
  body.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const d = b.dataset;
    switch (d.act) {
      case 'toggleTableCol': toggleTableCol(d.from); break;
      case 'delSalaryTable': delSalaryTable(d.tid); break;
      case 'delRole': delRole(d.rid); break;
      case 'addSalaryTable': addSalaryTable(); break;
      case 'collapseOlderTables': collapseOlderTables(); break;
      case 'expandAllTables': expandAllTables(); break;
      case 'addRole': addRole(); break;
      case 'addOwner': addOwner(); break;
      case 'removeOwner': removeOwner(d.oid); break;
    }
  });
  body.addEventListener('focusin', e => { const el = e.target; if (el.dataset && (el.dataset.act === 'setTableHuf' || el.dataset.act === 'setTableFx')) el.dataset.prev = el.value; });
  body.addEventListener('keydown', e => {
    const el = e.target, d = el.dataset || {}; if (d.act !== 'setTableHuf' && d.act !== 'setTableFx') return;
    if (e.key === 'Enter') { e.preventDefault(); d.act === 'setTableHuf' ? setTableHuf(d.tid, d.rid, el.value) : setTableFx(d.tid, el.value); }
    else if (e.key === 'Escape') { e.preventDefault(); el.value = d.prev ?? el.value; }
  });
  body.addEventListener('input', e => {
    const el = e.target, d = el.dataset; if (!d.act) return;
    if (d.act === 'roleName' && A.canMaster()) D.updateRole(d.rid, el.value);
    else if (d.act === 'renameOwner') renameOwner(d.oid, el.value);
  });
  body.addEventListener('change', e => {
    const el = e.target, d = el.dataset; if (!d.act) return;
    switch (d.act) {
      case 'setTableFrom': setTableFrom(d.tid, el.value); break;
      case 'setTableFx': setTableFx(d.tid, el.value); break;
      case 'setTableHuf': setTableHuf(d.tid, d.rid, el.value); break;
      case 'setBaseline': setBaseline(d.oid, el.value); break;
      case 'linkOwner': linkOwner(d.oid, el.value); break;
      case 'setAdmin': setAdmin(d.oid, el.checked); break;
    }
  });
}
