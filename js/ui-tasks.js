/* ============================================================================
   ui-tasks.js — task catalog & weights (groups → categories → tasks).
   Admins edit in place; everyone else sees it read-only. Weights are snapshotted
   into entries when logged, so a change here affects new entries only.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import * as A from './auth.js';
import { renderAll, requestRender } from './app.js';

const {esc, fmt} = C;

export function renderTasks() {
  const S = D.S, host = document.getElementById('taskSection'); if (!S || !host) return;
  const ro = !A.canMaster(), dis = ro ? 'disabled' : '';
  let html = ro ? '<p class="role-note">Task weights are maintained by the admins — shown read-only.</p>' : '';
  S.catalog.groups.forEach(g => {
    html += `<div class="td-group" data-gid="${esc(g.id)}"><div class="td-group-head"><span class="gtag">${g.id === 'proj' ? 'Projects' : 'Operations'}</span><input type="text" value="${esc(g.name)}" data-act="groupName" data-gid="${esc(g.id)}" ${dis}></div>`;
    g.categories.forEach(c => {
      const cw = c.subs.reduce((a, s) => a + (+s.weight || 0), 0);
      html += `<div class="td-cat" data-cid="${esc(c.id)}"><div class="td-cat-head"><span class="ctag">${esc(c.code || c.id)}</span><input type="text" value="${esc(c.name)}" data-act="catName" data-cid="${esc(c.id)}" ${dis}><span class="cat-wt">Σ ${fmt(cw)}</span></div><div class="td-cat-body">`;
      c.subs.forEach(s => {
        html += `<div class="td-sub" data-tid="${esc(s.id)}"><input class="nm" type="text" value="${esc(s.name)}" data-act="taskName" data-tid="${esc(s.id)}" ${dis}><input class="wt" type="number" step="0.5" min="0" value="${s.weight}" data-act="taskWeight" data-tid="${esc(s.id)}" ${dis}><button class="xbtn" data-act="delTask" data-tid="${esc(s.id)}" ${dis}>×</button></div>`;
      });
      html += `<button class="td-add" data-act="addTask" data-cid="${esc(c.id)}" ${dis}>+ Add task</button></div></div>`;
    });
    html += `<button class="td-add" data-act="addCat" data-gid="${esc(g.id)}" ${dis}>+ Add category</button></div>`;
  });
  host.classList.toggle('ro-master', ro);
  host.innerHTML = html;
}

export function addTask(cid) { if (!A.canMaster()) return; D.addTask(cid); renderAll(); }
export function addCat(gid) { if (!A.canMaster()) return; D.addCategory(gid); renderAll(); }
export function delTask(tid) {
  if (!A.canMaster()) return;
  if (D.taskInUse(tid) && !window.confirm('This task has logged entries (weight snapshots are kept). Delete anyway?')) return;
  D.delTask(tid); renderAll();
}
export function setTaskWeight(tid, v) { if (!A.canMaster()) return; D.updateTask(tid, {weight: v}); requestRender(); }
export function setTaskName(tid, v) { if (!A.canMaster()) return; D.updateTask(tid, {name: v}); }

export function initTasks() {
  const host = document.getElementById('taskSection'); if (!host) return;
  host.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const d = b.dataset;
    if (d.act === 'delTask') delTask(d.tid); else if (d.act === 'addTask') addTask(d.cid); else if (d.act === 'addCat') addCat(d.gid);
  });
  host.addEventListener('input', e => {
    const el = e.target, d = el.dataset; if (!d.act || !A.canMaster()) return;
    if (d.act === 'groupName') D.updateGroup(d.gid, el.value);
    else if (d.act === 'catName') D.updateCategory(d.cid, el.value);
    else if (d.act === 'taskName') setTaskName(d.tid, el.value);
    else if (d.act === 'taskWeight') setTaskWeight(d.tid, el.value);
  });
}
