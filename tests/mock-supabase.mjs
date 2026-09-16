/* ============================================================================
   mock-supabase.mjs — in-memory stand-in for @supabase/supabase-js v2 used by the tests.
   Implements: from().select/insert/upsert/update/delete + eq/in/match/order/single,
   the schema's triggers (approval reset, re-approval flag) and a light RLS,
   auth (getSession, onAuthStateChange, signInWithPassword, signOut, resetPasswordForEmail, updateUser),
   rpc('list_auth_users') and realtime channels with a manual `emit()`.
   ============================================================================ */

export const PK = {
  owners: ['id'], roles: ['id'], salary_tables: ['id'], salary_rates: ['table_id', 'role_id'], task_groups: ['id'], task_categories: ['id'], tasks: ['id'],
  periods: ['id'], entries: ['id'], salaries: ['period_id', 'owner_id'], approvals: ['period_id', 'owner_id'], audit_log: ['id'],
};
const SERIAL = {salary_tables: 'id', entries: 'id', audit_log: 'id'};
const AUDITED = ['entries', 'salaries', 'approvals', 'periods', 'owners', 'roles', 'salary_tables', 'salary_rates', 'tasks', 'task_categories', 'task_groups'];
const MASTER = ['owners', 'roles', 'salary_tables', 'salary_rates', 'task_groups', 'task_categories', 'tasks', 'periods'];
const clone = x => JSON.parse(JSON.stringify(x));
const same = (a, b) => String(a) === String(b);

export function createMockSupabase({tables = {}, users = [], session = null, service = false, fail = {}} = {}) {
  const db = {}; Object.keys(PK).forEach(t => db[t] = clone(tables[t] || []));
  const seq = {}; Object.keys(SERIAL).forEach(t => seq[t] = db[t].reduce((m, r) => Math.max(m, +r[SERIAL[t]] || 0), 0));
  const writes = [];                      // log: {table, op, rows}
  const channels = [];
  const rt = {auto: false, emit(table, payload = {}) { channels.forEach(ch => ch._handlers.filter(h => h.table === table || h.table === '*').forEach(h => h.cb({eventType: 'UPDATE', table, ...payload}))); }};

  /* ---- auth ---- */
  const mkSession = u => ({access_token: 'tok-' + u.id, user: {id: u.id, email: u.email}});
  const auth = {
    _cbs: [], _session: session ? mkSession(session) : null, calls: [],
    fire(event, s) { auth._cbs.forEach(cb => { try { cb(event, s); } catch (e) { console.error(e); } }); },
    async getSession() { return {data: {session: auth._session}, error: null}; },
    async getUser() { return {data: {user: auth._session ? auth._session.user : null}, error: null}; },
    onAuthStateChange(cb) { auth._cbs.push(cb); return {data: {subscription: {unsubscribe() { auth._cbs = auth._cbs.filter(x => x !== cb); }}}}; },
    async signInWithPassword({email, password}) {
      auth.calls.push(['signInWithPassword', email]);
      const u = users.find(x => x.email === email);
      if (!u || u.password !== password) return {data: {session: null, user: null}, error: {message: 'Invalid login credentials'}};
      auth._session = mkSession(u); auth.fire('SIGNED_IN', auth._session);
      return {data: {session: auth._session, user: auth._session.user}, error: null};
    },
    async signOut() { auth.calls.push(['signOut']); auth._session = null; auth.fire('SIGNED_OUT', null); return {error: null}; },
    async resetPasswordForEmail(email, opts) { auth.calls.push(['resetPasswordForEmail', email, opts]); return {data: {}, error: null}; },
    async updateUser(attrs) { auth.calls.push(['updateUser', attrs]); if (!auth._session) return {data: {user: null}, error: {message: 'Auth session missing!'}}; const u = users.find(x => x.id === auth._session.user.id); if (u && attrs.password) u.password = attrs.password; return {data: {user: auth._session.user}, error: null}; },
    /* test helpers */
    setSession(user) { auth._session = user ? mkSession(user) : null; },
    simulateRecovery(user) { auth._session = mkSession(user); auth.fire('PASSWORD_RECOVERY', auth._session); },
  };
  const uid = () => auth._session ? auth._session.user.id : null;
  const myOwner = () => { const id = uid(); return id ? db.owners.find(o => o.auth_uid === id) : null; };
  const isAdmin = () => !!(myOwner() && myOwner().is_admin);
  const periodFinal = pid => db.approvals.filter(a => a.period_id === pid).length === db.owners.length && db.owners.length > 0;

  /* ---- triggers ---- */
  /* audit_row(): one audit_log row per row change; flag-only period updates and no-op updates are skipped */
  function logAudit(op, t, o, n) {
    if (!AUDITED.includes(t)) return;
    if (op === 'update') { const strip = x => { const c = {...x}; if (t === 'periods') { delete c.needs_reapproval; delete c.edited_by; delete c.edited_at; } return JSON.stringify(c); }; if (strip(o) === strip(n)) return; }
    const r = n || o; const key = t === 'salary_rates' ? `${r.table_id}:${r.role_id}` : (t === 'salaries' || t === 'approvals') ? `${r.period_id}:${r.owner_id}` : String(r.id);
    const me = myOwner();
    db.audit_log.push({id: ++seq.audit_log, at: new Date().toISOString(), actor: me ? me.id : null, action: op, table_name: t, row_key: key,
      period_id: t === 'periods' ? r.id : (r.period_id ?? null), owner_id: t === 'owners' ? r.id : (r.owner_id ?? null), old: o ? clone(o) : null, new: n ? clone(n) : null});
  }
  function afterCardChange(pid) {
    const had = db.approvals.some(a => a.period_id === pid);
    db.approvals.filter(a => a.period_id === pid).forEach(a => logAudit('delete', 'approvals', a, null));
    db.approvals = db.approvals.filter(a => a.period_id !== pid);
    const p = db.periods.find(x => x.id === pid); const me = myOwner();
    if (p) { if (had) p.needs_reapproval = true; p.edited_by = me ? me.id : null; p.edited_at = new Date().toISOString(); }
  }
  function afterApproval(pid) { if (periodFinal(pid)) { const p = db.periods.find(x => x.id === pid); if (p) p.needs_reapproval = false; } }

  /* ---- RLS (light): returns an error message or null ---- */
  function rlsCheck(table, op, row) {
    if (table === 'audit_log') return 'permission denied for table audit_log';   // only the triggers write
    if (service) return null;                                   // service-role key bypasses RLS
    if (!uid()) return 'not authenticated';
    if (MASTER.includes(table)) return isAdmin() ? null : 'new row violates row-level security policy for table "' + table + '"';
    if (table === 'entries' || table === 'salaries') { const me = myOwner(); const own = me && row.owner_id === me.id; return ((own || isAdmin()) && !periodFinal(row.period_id)) ? null : 'new row violates row-level security policy for table "' + table + '"'; }
    if (table === 'approvals') { const me = myOwner(); if (op === 'insert') return (me && row.owner_id === me.id) || isAdmin() ? null : 'new row violates row-level security policy for table "approvals"'; return (me && row.owner_id === me.id) || isAdmin() ? null : 'denied'; }
    return null;
  }

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.orderBy = null; this.payload = null; this.opts = {}; this.wantSingle = false; }
    select() { return this; }
    insert(rowsIn) { this.op = 'insert'; this.payload = Array.isArray(rowsIn) ? rowsIn : [rowsIn]; return this; }
    upsert(rowsIn, opts) { this.op = 'upsert'; this.payload = Array.isArray(rowsIn) ? rowsIn : [rowsIn]; this.opts = opts || {}; return this; }
    update(vals) { this.op = 'update'; this.payload = vals; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(k, v) { this.filters.push(r => same(r[k], v)); return this; }
    neq(k, v) { this.filters.push(r => !same(r[k], v)); return this; }
    in(k, arr) { const s = arr.map(String); this.filters.push(r => s.includes(String(r[k]))); return this; }
    match(obj) { Object.entries(obj).forEach(([k, v]) => this.eq(k, v)); return this; }
    order(k, o = {}) { this.orderBy = {k, asc: o.ascending !== false}; return this; }
    single() { this.wantSingle = true; return this; }
    limit() { return this; }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
    _pk(r) { return PK[this.table].map(k => String(r[k])).join('|'); }
    exec() {
      const t = this.table, rows = db[t]; if (!rows) return {data: null, error: {message: `relation "${t}" does not exist`, code: '42P01'}};
      if (sb.fail[t]) return {data: null, error: {...sb.fail[t]}};                        // simulated failure (missing table, RLS, column…)
      const matches = () => rows.filter(r => this.filters.every(f => f(r)));
      const fin = data => { if (this.wantSingle) return data.length === 1 ? {data: clone(data[0]), error: null} : {data: null, error: {message: 'JSON object requested, multiple (or no) rows returned'}}; return {data: clone(data), error: null}; };
      if (this.op === 'select') { let d = matches(); if (this.orderBy) { const {k, asc} = this.orderBy; d = [...d].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); } return fin(d); }
      if (this.op === 'insert' || this.op === 'upsert') {
        const out = [];
        for (const src of this.payload) {
          const row = {...src};
          if (SERIAL[t] && row[SERIAL[t]] == null) row[SERIAL[t]] = ++seq[t];
          const err = rlsCheck(t, 'insert', row); if (err) return {data: null, error: {message: err}};
          const existing = rows.find(r => this._pk(r) === this._pk(row));
          if (existing) { if (this.op === 'insert') return {data: null, error: {message: 'duplicate key value violates unique constraint', code: '23505'}}; const before = clone(existing); Object.assign(existing, row); out.push(existing); logAudit('update', t, before, existing); }
          else { if (t === 'salary_tables' && rows.some(r => r.effective_from === row.effective_from && r.id !== row.id)) { const ex = rows.find(r => r.effective_from === row.effective_from); if (this.op === 'upsert') { Object.assign(ex, row, {id: ex.id}); out.push(ex); continue; } return {data: null, error: {message: 'duplicate key value violates unique constraint "salary_tables_effective_from_key"'}}; }
            if (t === 'entries') { if (row.hours == null) row.hours = 0; if (row.created_at == null) row.created_at = new Date().toISOString(); }
            if (t === 'periods' && row.needs_reapproval == null) row.needs_reapproval = false;
            if (t === 'approvals') { if (row.approved_by == null) row.approved_by = (myOwner() && myOwner().id) || row.owner_id; if (row.approved_at == null) row.approved_at = new Date().toISOString(); }
            rows.push(row); out.push(row); logAudit('insert', t, null, row); }
          if (t === 'entries' || t === 'salaries') afterCardChange(row.period_id); if (t === 'approvals') afterApproval(row.period_id);
        }
        writes.push({table: t, op: this.op, rows: clone(out)}); if (rt.auto) setTimeout(() => rt.emit(t, {eventType: 'INSERT'}), 0);
        return fin(out);
      }
      if (this.op === 'update') {
        const ms = matches().filter(r => !rlsCheck(t, 'update', r)); ms.forEach(r => { const before = clone(r); Object.assign(r, this.payload); logAudit('update', t, before, r); });
        ms.forEach(r => { if (t === 'entries' || t === 'salaries') afterCardChange(r.period_id); });
        writes.push({table: t, op: 'update', rows: clone(ms), patch: clone(this.payload)}); if (rt.auto && ms.length) setTimeout(() => rt.emit(t, {eventType: 'UPDATE'}), 0);
        return fin(ms);
      }
      if (this.op === 'delete') {
        const ms = matches().filter(r => !rlsCheck(t, 'delete', r)); db[t] = rows.filter(r => !ms.includes(r)); ms.forEach(r => logAudit('delete', t, r, null));
        /* cascades (row triggers fire on the children too) */
        const cascade = (x, pred) => { db[x].filter(pred).forEach(r => logAudit('delete', x, r, null)); db[x] = db[x].filter(r => !pred(r)); };
        if (t === 'periods') ms.forEach(p => ['entries', 'salaries', 'approvals'].forEach(x => cascade(x, r => r.period_id === p.id)));
        if (t === 'owners') ms.forEach(o => ['entries', 'salaries', 'approvals'].forEach(x => cascade(x, r => r.owner_id === o.id)));
        if (t === 'roles') ms.forEach(o => { db.salary_rates = db.salary_rates.filter(r => r.role_id !== o.id); db.salaries.forEach(s => { if (s.role_id === o.id) s.role_id = null; }); });
        if (t === 'salary_tables') ms.forEach(o => db.salary_rates = db.salary_rates.filter(r => r.table_id !== o.id));
        if (t === 'tasks') ms.forEach(o => db.entries.forEach(e => { if (e.task_id === o.id) e.task_id = null; }));
        if (t === 'task_categories') ms.forEach(c => { const ts = db.tasks.filter(x => x.category_id === c.id).map(x => x.id); db.tasks = db.tasks.filter(x => x.category_id !== c.id); db.entries.forEach(e => { if (ts.includes(e.task_id)) e.task_id = null; }); });
        ms.forEach(r => { if (t === 'entries' || t === 'salaries') afterCardChange(r.period_id); });
        writes.push({table: t, op: 'delete', rows: clone(ms)}); if (rt.auto && ms.length) setTimeout(() => rt.emit(t, {eventType: 'DELETE'}), 0);
        return fin(ms);
      }
      return {data: null, error: {message: 'bad op'}};
    }
  }

  const sb = {
    db, writes, auth, realtime: rt, users, fail: {...fail},
    from(table) { return new Query(table); },
    async rpc(name) {
      if (name === 'list_auth_users') { if (!isAdmin()) return {data: null, error: {message: 'permission denied'}}; return {data: users.map(u => ({id: u.id, email: u.email})), error: null}; }
      if (name === 'my_owner_id') { const o = myOwner(); return {data: o ? o.id : null, error: null}; }
      if (name === 'is_admin') return {data: isAdmin(), error: null};
      return {data: null, error: {message: 'unknown rpc ' + name}};
    },
    channel(name) { const ch = {name, _handlers: [], status: null, _cb: null, on(type, filter, cb) { ch._handlers.push({table: filter.table || '*', cb}); return ch; }, subscribe(cb) { ch._cb = cb; ch.setStatus('SUBSCRIBED'); return ch; }, unsubscribe() { ch.status = 'CLOSED'; }, setStatus(s) { ch.status = s; if (ch._cb) ch._cb(s); } }; channels.push(ch); return ch; },
    async removeChannel(ch) { ch.unsubscribe(); const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); return 'ok'; },
    channels,
    /* helpers for tests */
    currentOwner: myOwner, isAdmin,
  };
  return sb;
}
