/* ============================================================================
   app.js — boot, tabs (#hash deep links), header menu (CSV / PDF export), toast, render orchestration.
   ============================================================================ */
import * as C from './calc.js';
import * as D from './data.js';
import * as A from './auth.js';
import { renderTracker, initTracker } from './ui-tracker.js';
import { renderTasks, initTasks } from './ui-tasks.js';
import { renderOwners, initOwners, invalidateAuthUsers } from './ui-owners.js';
import { renderReport, initReport, exportCSV, exportPDF } from './ui-report.js';
import { initDiag } from './ui-diag.js';

export const TABS = [
  {slug: 'owners', label: 'Owners, roles & setup', panel: 'tab-owners', num: 1},
  {slug: 'tasks', label: 'Task division — weights', panel: 'tab-tasks', num: 2},
  {slug: 'tracker', label: 'Monthly ownership tracker', panel: 'tab-tracker', num: 3},
  {slug: 'report', label: 'Work log & task report', panel: 'tab-report', num: 4}];
let activeTab = 'tracker', menuOpen = false, bootedDoc = null;
const $ = id => document.getElementById(id);

/* ---------- toast ---------- */
let _tt = null;
export function toast(msg, kind) { const el = $('toast'); if (!el) return; el.textContent = msg; el.className = 'toast show ' + (kind || ''); if (_tt) clearTimeout(_tt); _tt = setTimeout(() => { el.className = 'toast ' + (kind || ''); }, 3800); }

/* ---------- render ---------- */
export function renderAll() { if (!D.S) return; renderTracker(); renderTasks(); renderOwners(); renderReport(); }
let deferred = false;
/* Re-render now — unless the user is typing in a field: then once that field blurs (never overwrite what is being typed). */
export function requestRender() {
  const a = document.activeElement;
  const typing = a && a.closest && a.closest('main') && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox' && !a.disabled;
  if (typing) { if (!deferred) { deferred = true; a.addEventListener('blur', () => { deferred = false; if (!suppress) renderAll(); }, {once: true}); } return; }
  renderAll();
}
export function isRenderDeferred() { return deferred; }
/* move focus from one field to another without the blur of the first one re-rendering (Enter → next field) */
let suppress = false;
export function moveFocus(fn) { suppress = true; try { fn(); } finally { suppress = false; } }
function clearUi() { ['trackerTable', 'bars', 'taskSection', 'salaryTables', 'ownerList', 'reportBody', 'auditBody'].forEach(id => { const el = $(id); if (el) el.innerHTML = ''; }); showNotice(''); }
/* persistent banner under the header (unlinked account, failed core tables) */
export function showNotice(msg) { const n = $('notice'); if (!n) return; n.textContent = msg || ''; n.hidden = !msg; }
export function refreshNotice() {
  if (!A.isSignedIn() || !D.S) { showNotice(''); return; }
  const failed = D.CORE_TABLES.filter(t => D.loadStatus[t]);
  if (failed.length) { showNotice(`Some data could not be loaded (${failed.join(', ')}) — the tracker may be incomplete. Click the status pill for diagnostics.`); return; }
  if (!A.owner) { showNotice(`Your account (${A.session.user.email || ''}) is not linked to an owner yet — ask an admin (Owners tab). Everything is read-only.`); return; }
  showNotice('');
}

/* ---------- tabs ---------- */
export function activeTabSlug() { return activeTab; }
function renderTabNav() { $('topNav').innerHTML = TABS.map(t => `<a class="tab-link" id="navitem-${t.slug}" href="#${t.slug}" data-slug="${t.slug}"><span class="nav-num">${t.num}</span>${t.label}</a>`).join(''); }
export function goTab(slug, push) {
  const tab = TABS.find(t => t.slug === slug) || TABS[0]; activeTab = tab.slug;
  TABS.forEach(t => { const p = $(t.panel); if (p) { t.slug === tab.slug ? p.removeAttribute('hidden') : p.setAttribute('hidden', ''); } const it = $('navitem-' + t.slug); if (it) it.classList.toggle('active', t.slug === tab.slug); });
  if (push && window.location.hash.slice(1) !== tab.slug) { try { window.history.pushState({slug: tab.slug}, '', '#' + tab.slug); } catch (e) { /* ignore */ } }
}
export function tabFromHash() { const s = window.location.hash.slice(1); return TABS.some(t => t.slug === s) ? s : 'tracker'; }   // land on the tracker by default

/* ---------- header menu ---------- */
function openMenu() { menuOpen = true; $('navMenu').removeAttribute('hidden'); const b = $('menuBtn'); b.setAttribute('aria-expanded', 'true'); b.classList.add('open'); }
export function closeMenu(rf) { menuOpen = false; const m = $('navMenu'); if (m) m.setAttribute('hidden', ''); const b = $('menuBtn'); if (b) { b.setAttribute('aria-expanded', 'false'); b.classList.remove('open'); if (rf) b.focus(); } }
function setPill(kind, txt) { const p = $('syncPill'); if (!p) return; p.className = 'pill ' + kind; p.innerHTML = '<span class="dot"></span>' + C.esc(txt); }

function wireHeader() {
  $('topNav').addEventListener('click', e => { const a = e.target.closest('a[data-slug]'); if (!a) return; e.preventDefault(); goTab(a.dataset.slug, true); });
  $('menuBtn').addEventListener('click', () => menuOpen ? closeMenu() : openMenu());
  $('navMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; closeMenu();
    switch (b.dataset.act) {
      case 'exportCsv': if (D.S) exportCSV(); else toast('Sign in first.', 'err'); break;
      case 'exportPdf': if (D.S) exportPDF(); else toast('Sign in first.', 'err'); break;
    }
  });
  document.addEventListener('click', e => { if (menuOpen && !e.target.closest('.menu-wrap')) closeMenu(); });
  document.addEventListener('keydown', e => { if (menuOpen && e.key === 'Escape') closeMenu(true); });
  window.addEventListener('popstate', () => goTab(tabFromHash(), false));
  window.addEventListener('hashchange', () => { if (tabFromHash() !== activeTab) goTab(tabFromHash(), false); });
  window.addEventListener('beforeunload', () => { D.flushPending(); });
}

/* ---------- boot ---------- */
export async function boot(opts = {}) {
  if (bootedDoc) await D.reset();                       // booted before (tests): start from a clean slate
  if (opts.client) D.setClient(opts.client);
  if (bootedDoc !== document) {
    bootedDoc = document;
    renderTabNav(); wireHeader(); initTracker(); initTasks(); initOwners(); initReport(); initDiag();
    D.onChange(ev => {
      if (ev.type === 'data') { if (!ev.slices || ev.slices.includes('owners') || ev.slices.includes('all')) { A.resolveOwner(); invalidateAuthUsers(); } refreshNotice(); requestRender(); }
      else if (ev.type === 'status') setPill(ev.online && !D.coreFailed() ? 'online' : 'offline', D.coreFailed() ? 'Load failed' : (ev.text || (ev.online ? 'Live' : 'Offline')));
      else if (ev.type === 'error') { toast(ev.message, 'err'); }
    });
  }
  goTab(tabFromHash(), false);
  let sb;
  try { sb = await D.getClient(); }
  catch (e) { console.error(e); setPill('offline', 'Database library failed to load'); toast('Could not load the Supabase client — check your connection and reload.', 'err'); return; }
  setPill('offline', 'Connecting…');
  await A.initAuth(sb, {
    onSignedIn: async () => {
      setPill('offline', 'Loading…');
      await D.loadAll();                              // never throws: failed tables degrade their own slice
      A.resolveOwner(); renderAll(); goTab(tabFromHash(), false); refreshNotice();
      if (D.coreFailed()) setPill('offline', 'Load failed');
      D.subscribeRealtime();
    },
    onSignedOut: () => { D.unsubscribeRealtime(); D.clearState(); clearUi(); setPill('local', 'Offline'); },
    onToast: toast,
    onError: e => { setPill('offline', 'Load failed'); toast('Could not load the data: ' + (e.message || e), 'err'); },
  });
  if (!A.isSignedIn()) setPill('local', 'Signed out');
}
