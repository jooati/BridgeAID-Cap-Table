/* Fixture DB rows for the mock (mirrors supabase/schema.sql seed + the legacy "Load example" data). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_YM, END_YM, incYm, ymLabel, periodIdFor } from '../js/calc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'catalog.json'), 'utf8'));

export const USERS = [
  {id: 'u-jal', email: 'jal@example.com', password: 'secret123'},   // admin, linked to JAL
  {id: 'u-ka', email: 'ka@example.com', password: 'secret123'},     // admin, linked to KÁ
  {id: 'u-kd', email: 'kd@example.com', password: 'secret123'},     // owner, linked to KD
  {id: 'u-new', email: 'new@example.com', password: 'secret123'},   // signed up, not linked to any owner
];

export function allTasksFlat() { const out = []; CATALOG.groups.forEach(g => g.categories.forEach(c => c.subs.forEach(s => out.push({...s, cat: c.id})))); return out; }

/** @param {{example?:boolean}} o  example=true adds the legacy demo entries/salaries/approvals */
export function makeDb({example = true} = {}) {
  const owners = [
    {id: 'jal', name: 'JAL', baseline_pct: 16.67, sort_last: false, is_admin: true, auth_uid: 'u-jal'},
    {id: 'ka', name: 'KÁ', baseline_pct: 16.67, sort_last: false, is_admin: true, auth_uid: 'u-ka'},
    {id: 'kd', name: 'KD', baseline_pct: 16.67, sort_last: false, is_admin: false, auth_uid: 'u-kd'},
    {id: 'kb', name: 'KB', baseline_pct: 16.66, sort_last: false, is_admin: false, auth_uid: null},
    {id: 'szb', name: 'SZB', baseline_pct: 16.67, sort_last: false, is_admin: false, auth_uid: null},
    {id: 'vi', name: 'VI', baseline_pct: 16.66, sort_last: false, is_admin: false, auth_uid: null},
    {id: 'hb', name: 'HB', baseline_pct: 0, sort_last: true, is_admin: false, auth_uid: null},
  ];
  const roles = [{id: 'ceo', name: 'CEO'}, {id: 'coo', name: 'COO'}, {id: 'cso', name: 'CSO'}, {id: 'civ', name: 'Civil engineer'}, {id: 'it', name: 'IT engineer'}];
  const salary_tables = [{id: 1, effective_from: '2025-12-01', fx_huf_eur: 400}];
  const huf = {ceo: 3000000, coo: 2500000, cso: 2500000, civ: 2000000, it: 2000000};
  const salary_rates = roles.map(r => ({table_id: 1, role_id: r.id, gross_huf: huf[r.id]}));
  const task_groups = CATALOG.groups.map(g => ({id: g.id, name: g.name}));
  const task_categories = [], tasks = [];
  CATALOG.groups.forEach(g => g.categories.forEach(c => { task_categories.push({id: c.id, group_id: g.id, code: c.id, name: c.name}); c.subs.forEach(s => tasks.push({id: s.id, category_id: c.id, name: s.name, weight: s.weight})); }));
  const periods = [{id: 'ip', kind: 'ip', ym: null, label: 'Intellectual property', needs_reapproval: false, edited_by: null, edited_at: null},
    {id: 'incub', kind: 'incubation', ym: null, label: 'Incubation programs', needs_reapproval: false, edited_by: null, edited_at: null}];
  let ym = START_YM; while (ym <= END_YM) { periods.push({id: periodIdFor(ym), kind: 'month', ym, label: ymLabel(ym), needs_reapproval: false, edited_by: null, edited_at: null}); ym = incYm(ym); }
  const entries = [], salaries = [], approvals = [];
  if (example) {
    const t = allTasksFlat(), pick = n => t.find(x => x.name.startsWith(n)) || t[0];
    let id = 0; const ent = (pid, oid, n, h) => { const x = pick(n); entries.push({id: ++id, period_id: pid, owner_id: oid, task_id: x.id, task_name: x.name, hours: h, weight_snapshot: x.weight, created_at: '2026-01-01T00:00:00Z'}); };
    ent('ip', 'jal', 'General B-WIM', 300); ent('ip', 'ka', 'RTS-DT', 200); ent('ip', 'kd', 'General FEM', 150); ent('ip', 'hb', 'Settling the BME-IP', 120);
    ent('incub', 'jal', 'Investor relationship', 80); ent('incub', 'szb', 'Assembling the pitch', 60); ent('incub', 'vi', 'Building and updating', 40); ent('incub', 'hb', 'Preparing the cap table', 30);
    const months = periods.filter(p => p.kind === 'month');
    months.forEach((p, i) => { const f = 1 + i * 0.05, sal = (oid, role, s) => salaries.push({period_id: p.id, owner_id: oid, role_id: role, gross_eur: s});
      ent(p.id, 'hb', 'Company leadership', 50 * f); ent(p.id, 'hb', 'Investor relationship', 30); sal('hb', 'ceo', 2500);
      ent(p.id, 'jal', 'New public-sector', 60 * f); ent(p.id, 'jal', 'Key-account', 20); sal('jal', 'coo', 1500);
      ent(p.id, 'ka', 'General B-WIM', 90 * f); sal('ka', 'it', 0);
      ent(p.id, 'kd', 'Building the bridge-specific FEM', 70); sal('kd', 'civ', null);
      ent(p.id, 'kb', 'Writing and winning domestic', 50); sal('kb', 'cso', 2000);
      ent(p.id, 'szb', 'Scientific publication', 30); sal('szb', 'civ', null);
      ent(p.id, 'vi', 'Finance / controlling', 45); sal('vi', 'it', 1000);
      if (i < months.length - 2) owners.forEach(o => approvals.push({period_id: p.id, owner_id: o.id, approved_at: '2026-01-01T00:00:00Z'})); });
    ['ip', 'incub'].forEach(pid => owners.forEach(o => approvals.push({period_id: pid, owner_id: o.id, approved_at: '2026-01-01T00:00:00Z'})));
  }
  return {owners, roles, salary_tables, salary_rates, task_groups, task_categories, tasks, periods, entries, salaries, approvals};
}
