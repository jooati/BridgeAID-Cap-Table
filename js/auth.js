/* ============================================================================
   auth.js — Supabase Auth: sign in / out, forgot password (email link), recovery
   ("set new password" on the redirect), change password; who am I (owner + admin flag).
   The modal is the only thing an unauthenticated visitor sees (body.locked hides <main>).
   ============================================================================ */
import * as D from './data.js';
import { tr, N_ } from './i18n.js';

export let session = null;   // supabase session or null
export let owner = null;     // the owners row linked to the signed-in user (null = not linked)
export let isAdmin = false;

let sb = null, mode = 'signin', handlers = {}, loadedUser = null, menuOpen = false;
const $ = id => document.getElementById(id);

export function siteUrl() { return window.location.origin + window.location.pathname; }
export function isSignedIn() { return !!session; }
/* permissions used by the UI */
export function canEditCard(oid) { return !!session && (isAdmin || (!!owner && owner.id === oid)); }
export function canApprove(oid) { return !!session && !!owner && (owner.id === oid || isAdmin); }   // admins may tick on anybody's behalf
export function canMaster() { return !!session && isAdmin; }

/* find the owner row for the signed-in user (call again after the owners slice reloads) */
export function resolveOwner() {
  owner = (session && D.S) ? (D.S.owners.find(o => o.authUid === session.user.id) || null) : null;
  isAdmin = !!(owner && owner.isAdmin);
  D.setMe(owner ? owner.id : null);
  refreshButton();
  return owner;
}

/* forget the session state (the app is booted again, e.g. in tests) */
export function reset() { session = null; owner = null; isAdmin = false; loadedUser = null; loading = null; menuOpen = false; mode = 'signin'; }
export async function initAuth(client, h) {
  sb = client; handlers = h || {}; reset();
  wireUi(); refreshButton();
  const recovery = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
  sb.auth.onAuthStateChange((event, sess) => {
    if (event === 'PASSWORD_RECOVERY') { session = sess; showModal('recovery'); return; }
    if (event === 'SIGNED_OUT') { onSignedOut(); return; }
    if (sess && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) onSession(sess);
  });
  const {data} = await sb.auth.getSession();
  const s = data && data.session;
  if (s) { await onSession(s); if (recovery) showModal('recovery'); }
  else showModal(recovery ? 'recovery' : 'signin');
}

let loading = null;
async function onSession(s) {
  session = s;
  if (loadedUser === s.user.id) { refreshButton(); return loading; }   // same user: await the in-flight load, if any
  loadedUser = s.user.id;
  hideModal();
  document.body.classList.remove('locked');
  loading = (async () => {
    try { if (handlers.onSignedIn) await handlers.onSignedIn(s); }
    catch (e) { console.error(e); if (handlers.onError) handlers.onError(e); }
    resolveOwner();
  })();
  await loading; loading = null;
}
function onSignedOut() {
  session = null; owner = null; isAdmin = false; loadedUser = null; D.setMe(null);
  closeAccountMenu();
  document.body.classList.add('locked');
  if (handlers.onSignedOut) handlers.onSignedOut();
  refreshButton();
  showModal('signin');
}

export async function signIn(email, password) {
  const {data, error} = await sb.auth.signInWithPassword({email, password});
  if (error) throw error;
  if (data && data.session) await onSession(data.session);
  return data;
}
export async function signOut() { const {error} = await sb.auth.signOut(); if (error) throw error; onSignedOut(); }
export async function forgotPassword(email) { const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: siteUrl()}); if (error) throw error; }
export async function changePassword(password) { const {error} = await sb.auth.updateUser({password}); if (error) throw error; }

/* ---------- modal ---------- */
const MODES = {
  signin:   {title: N_('Sign in'), text: N_('BridgeAID Monthly Ownership Tracker — owners only.'), email: true, pw: true, pw2: false, submit: N_('Sign in'), link: N_('Forgot password?'), cancel: false},
  forgot:   {title: N_('Reset password'), text: N_('We email you a link; open it and choose a new password.'), email: true, pw: false, pw2: false, submit: N_('Send reset link'), link: N_('Back to sign in'), cancel: false},
  recovery: {title: N_('Set new password'), text: N_('Choose a new password for your account (at least 8 characters).'), email: false, pw: true, pw2: true, submit: N_('Save password'), link: '', cancel: false},
  change:   {title: N_('Change password'), text: N_('Choose a new password (at least 8 characters).'), email: false, pw: true, pw2: true, submit: N_('Save password'), link: '', cancel: true},
};
export function currentMode() { return mode; }
/* the texts of the current mode, in the current language */
function paintModal() {
  const cfg = MODES[mode]; if (!$('authTitle')) return;
  $('authTitle').textContent = tr(cfg.title); $('authText').textContent = tr(cfg.text);
  $('authSubmit').textContent = tr(cfg.submit); $('authForgot').textContent = cfg.link ? tr(cfg.link) : '';
}
/* the language changed */
export function relabel() { paintModal(); refreshButton(); }
export function showModal(m) {
  mode = m; const cfg = MODES[m]; const back = $('authModal'); if (!back) return;
  paintModal();
  $('authEmailRow').hidden = !cfg.email; $('authPwRow').hidden = !cfg.pw; $('authPw2Row').hidden = !cfg.pw2;
  $('authPw').autocomplete = cfg.pw2 ? 'new-password' : 'current-password'; $('authPw').required = cfg.pw; $('authPw2').required = cfg.pw2; $('authEmail').required = cfg.email;
  $('authPw').value = ''; $('authPw2').value = ''; $('authErr').textContent = '';
  $('authForgot').hidden = !cfg.link; $('authCancel').hidden = !cfg.cancel;
  back.hidden = false;
  const first = cfg.email ? $('authEmail') : $('authPw'); if (first && first.focus) setTimeout(() => first.focus(), 0);
}
export function hideModal() { const back = $('authModal'); if (back) back.hidden = true; }
export function modalVisible() { const back = $('authModal'); return !!back && !back.hidden; }

async function submit(e) {
  if (e) e.preventDefault();
  const err = $('authErr'); err.textContent = '';
  const email = $('authEmail').value.trim(), pw = $('authPw').value, pw2 = $('authPw2').value;
  const btn = $('authSubmit'); btn.disabled = true;
  try {
    if (mode === 'signin') { await signIn(email, pw); }
    else if (mode === 'forgot') { await forgotPassword(email); err.style.color = ''; $('authText').textContent = tr('Reset link sent to {email} — check your inbox.', {email}); }
    else { if (pw.length < 8) throw new Error(tr('The password must be at least 8 characters.')); if (pw !== pw2) throw new Error(tr('The two passwords differ.'));
      await changePassword(pw); hideModal();
      if (mode === 'recovery') { try { window.history.replaceState(null, '', window.location.pathname + '#tracker'); } catch (e2) { /* ignore */ } }
      if (handlers.onToast) handlers.onToast(tr('Password saved.'), 'ok');
      if (!session) showModal('signin'); }
  } catch (ex) { err.textContent = tr(ex.message || String(ex)); }   // known Supabase messages are in the dictionary
  finally { btn.disabled = false; }
}

/* ---------- header button + account menu ---------- */
export function refreshButton() {
  const lbl = $('loginLbl'), badge = $('adminBadge'), btn = $('loginBtn'); if (!lbl) return;
  lbl.textContent = owner ? owner.name : (session ? (session.user.email || tr('Signed in')) : tr('Sign in'));
  badge.hidden = !isAdmin; btn.classList.toggle('signed', !!session);
  const email = session ? (session.user.email || '') : '';
  btn.title = !session ? tr('Sign in') : (owner ? `${owner.name} · ${email}` : email);   // the name is the identity; the email lives in the tooltip
  if ($('acctName')) { $('acctName').textContent = owner ? owner.name : tr('not linked to an owner'); $('acctEmail').textContent = session ? session.user.email || '' : ''; }
  document.querySelectorAll('.admin-only').forEach(el => el.hidden = !isAdmin);
}
function openAccountMenu() { menuOpen = true; $('accountMenu').hidden = false; $('loginBtn').setAttribute('aria-expanded', 'true'); }
export function closeAccountMenu() { menuOpen = false; const m = $('accountMenu'); if (m) m.hidden = true; const b = $('loginBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }

let wiredDoc = null;
function wireUi() {
  if (wiredDoc === document || !$('authForm')) return; wiredDoc = document;
  $('authForm').addEventListener('submit', submit);
  $('authForgot').addEventListener('click', () => showModal(mode === 'forgot' ? 'signin' : 'forgot'));
  $('authCancel').addEventListener('click', () => { hideModal(); });
  $('loginBtn').addEventListener('click', () => { if (!session) { showModal('signin'); return; } menuOpen ? closeAccountMenu() : openAccountMenu(); });
  $('accountMenu').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; closeAccountMenu();
    if (b.dataset.act === 'signOut') { try { await signOut(); } catch (ex) { handlers.onToast && handlers.onToast(ex.message, 'err'); } }
    if (b.dataset.act === 'changePassword') showModal('change');
  });
  document.addEventListener('click', e => { if (menuOpen && !e.target.closest('.acct-wrap')) closeAccountMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAccountMenu(); if (modalVisible() && (mode === 'change' || (mode === 'recovery' && session))) hideModal(); } });
}
