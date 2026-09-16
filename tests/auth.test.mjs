/* Sign in / forgot / recovery / change password / sign out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, SITE, sleep } from './setup.mjs';

test('unauthenticated visitors only see the sign-in modal; wrong password shows the error', async () => {
  const t = await setup({user: null});
  assert.ok(t.document.body.classList.contains('locked'));
  assert.equal(t.$('#authModal').hidden, false); assert.equal(t.A.currentMode(), 'signin');
  assert.equal(t.text(t.$('#loginLbl')), 'Sign in'); assert.equal(t.$('#adminBadge').hidden, true);
  assert.equal(t.D.S, null);
  t.$('#authEmail').value = 'kd@example.com'; t.$('#authPw').value = 'wrong';
  t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.equal(t.text(t.$('#authErr')), 'Invalid login credentials');
  assert.ok(t.document.body.classList.contains('locked'));

  /* correct password → data loads, name shown, no admin badge for KD */
  t.$('#authPw').value = 'secret123';
  t.fire(t.$('#authForm'), 'submit'); await sleep(50);
  while (!t.D.S) await sleep(10);
  await sleep(10);
  assert.equal(t.document.body.classList.contains('locked'), false); assert.equal(t.$('#authModal').hidden, true);
  assert.equal(t.text(t.$('#loginLbl')), 'KD'); assert.equal(t.$('#adminBadge').hidden, true);
  assert.equal(t.A.owner.id, 'kd'); assert.equal(t.A.isAdmin, false); assert.equal(t.D.me, 'kd');
  assert.equal(t.$('#syncPill').className, 'pill online');

  /* change password from the account menu */
  t.$('#loginBtn').click(); assert.equal(t.$('#accountMenu').hidden, false);
  assert.ok(t.text(t.$('#acctName')) === 'KD' && t.text(t.$('#acctEmail')) === 'kd@example.com');
  t.$('#accountMenu [data-act="changePassword"]').click();
  assert.equal(t.A.currentMode(), 'change'); assert.equal(t.$('#authModal').hidden, false); assert.equal(t.$('#authCancel').hidden, false);
  t.$('#authPw').value = 'newpass123'; t.$('#authPw2').value = 'different';
  t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.equal(t.text(t.$('#authErr')), 'The two passwords differ.');
  t.$('#authPw2').value = 'short'; t.$('#authPw').value = 'short'; t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.equal(t.text(t.$('#authErr')), 'The password must be at least 8 characters.');
  t.$('#authPw').value = 'newpass123'; t.$('#authPw2').value = 'newpass123'; t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.deepEqual(t.sb.auth.calls.at(-1), ['updateUser', {password: 'newpass123'}]);
  assert.equal(t.$('#authModal').hidden, true);
  assert.equal(t.sb.users.find(u => u.email === 'kd@example.com').password, 'newpass123');

  /* sign out → locked again, state cleared */
  t.$('#loginBtn').click(); t.$('#accountMenu [data-act="signOut"]').click(); await sleep(20);
  assert.ok(t.document.body.classList.contains('locked')); assert.equal(t.$('#authModal').hidden, false); assert.equal(t.A.currentMode(), 'signin');
  assert.equal(t.D.S, null); assert.equal(t.text(t.$('#loginLbl')), 'Sign in'); assert.equal(t.$('#trackerTable').innerHTML, '');
  assert.equal(t.$('#syncPill').className, 'pill local');

  /* forgot password → reset email with redirect to the site URL */
  t.$('#authForgot').click(); assert.equal(t.A.currentMode(), 'forgot'); assert.equal(t.$('#authPwRow').hidden, true);
  t.$('#authEmail').value = 'kd@example.com'; t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  const call = t.sb.auth.calls.find(c => c[0] === 'resetPasswordForEmail');
  assert.deepEqual(call, ['resetPasswordForEmail', 'kd@example.com', {redirectTo: SITE}]);
  assert.ok(t.text(t.$('#authText')).includes('Reset link sent to kd@example.com'));
  t.$('#authForgot').click(); assert.equal(t.A.currentMode(), 'signin');
});

test('the recovery link opens the "set new password" form and saves the password', async () => {
  const t = await setup({user: 'kd@example.com', url: SITE + '#access_token=abc&type=recovery'});
  assert.equal(t.A.currentMode(), 'recovery'); assert.equal(t.$('#authModal').hidden, false);
  assert.equal(t.$('#authEmailRow').hidden, true); assert.equal(t.$('#authPw2Row').hidden, false);
  assert.equal(t.text(t.$('#authTitle')), 'Set new password');
  t.$('#authPw').value = 'brandnew99'; t.$('#authPw2').value = 'brandnew99'; t.fire(t.$('#authForm'), 'submit'); await sleep(20);
  assert.deepEqual(t.sb.auth.calls.at(-1), ['updateUser', {password: 'brandnew99'}]);
  assert.equal(t.$('#authModal').hidden, true); assert.equal(t.window.location.hash, '#tracker');
  assert.equal(t.document.body.classList.contains('locked'), false); assert.equal(t.text(t.$('#loginLbl')), 'KD');
  /* the PASSWORD_RECOVERY auth event (PKCE flow) opens the same form */
  t.sb.auth.simulateRecovery(t.USERS[2]); assert.equal(t.A.currentMode(), 'recovery'); assert.equal(t.$('#authModal').hidden, false);
  t.A.hideModal();
});

test('a signed-in account that is not linked to an owner sees everything read-only', async () => {
  const t = await setup({user: 'new@example.com'});
  assert.equal(t.document.body.classList.contains('locked'), false);
  assert.equal(t.text(t.$('#loginLbl')), 'new@example.com'); assert.equal(t.A.owner, null); assert.equal(t.D.me, null);
  assert.equal(t.$('#notice').hidden, false); assert.ok(t.text(t.$('#notice')).includes('not linked to an owner'));
  assert.ok(t.$$('#trackerTable .ocard').every(c => c.classList.contains('ro')));
  assert.ok(t.$$('#trackerTable .appr input').every(i => i.disabled));
  assert.equal(t.text(t.$('#trackerTable .appr')), 'Not yet approved');
  assert.equal(t.$('#trackerTools [data-act="addMonth"]').hidden, true);
});

test('header identity: owner name from owners.auth_uid, email only until an admin links the account', async () => {
  const t = await setup({user: 'new@example.com'});
  assert.equal(t.text(t.$('#loginLbl')), 'new@example.com'); assert.equal(t.$('#adminBadge').hidden, true);
  assert.equal(t.$('#loginBtn').title, 'new@example.com');
  /* an admin links the account (arrives through the owners realtime slice) */
  t.sb.db.owners.find(o => o.id === 'kb').auth_uid = 'u-new'; t.D.onRealtime('owners'); await t.D.flushReload();
  assert.equal(t.text(t.$('#loginLbl')), 'KB'); assert.equal(t.A.owner.id, 'kb'); assert.equal(t.$('#notice').hidden, true);
  assert.equal(t.$('#loginBtn').title, 'KB · new@example.com');
  assert.equal(t.$('#trackerTable .ocard[data-card="m202609:kb"]').classList.contains('ro'), false, 'own card became editable');
  /* admin flag arrives the same way */
  t.sb.db.owners.find(o => o.id === 'kb').is_admin = true; t.D.onRealtime('owners'); await t.D.flushReload();
  assert.equal(t.$('#adminBadge').hidden, false); assert.equal(t.text(t.$('#loginLbl')), 'KB');
  /* the account menu still opens with change password / sign out */
  t.$('#loginBtn').click(); assert.equal(t.$('#accountMenu').hidden, false); assert.equal(t.text(t.$('#acctName')), 'KB');
  assert.deepEqual(t.$$('#accountMenu [data-act]').map(b => b.dataset.act), ['changePassword', 'signOut']);
  t.A.closeAccountMenu();
});
