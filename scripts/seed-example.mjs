#!/usr/bin/env node
/* ============================================================================
   seed-example.mjs — DEV ONLY. Replaces every logged entry / salary / approval with the
   demo data the legacy "Load example" produced (older periods finalised, last two months pending).
   Master data (owners, roles, tables, tasks, periods) is left as it is in the database.

     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-example.mjs --yes

   Without --yes it only prints what it would do.
   ============================================================================ */
import { serviceClient, arg, must } from './lib.mjs';

const sb = serviceClient();
const yes = arg('--yes') === true;

const periods = await must(sb.from('periods').select('*'), 'read periods');
const owners = await must(sb.from('owners').select('id'), 'read owners');
const tasks = await must(sb.from('tasks').select('id,name,weight'), 'read tasks');
const chrono = [...periods.filter(p => p.kind === 'ip'), ...periods.filter(p => p.kind === 'incubation'), ...periods.filter(p => p.kind === 'month').sort((a, b) => a.ym.localeCompare(b.ym))];
const ownerIds = new Set(owners.map(o => o.id));
const pick = n => { const x = tasks.find(t => t.name.startsWith(n)) || tasks[0]; if (!x) throw new Error('No tasks in the database — run supabase/schema.sql first.'); return x; };

const entries = [], salaries = [], approvals = [];
const ent = (pid, oid, n, h) => { if (!ownerIds.has(oid)) return; const x = pick(n); entries.push({period_id: pid, owner_id: oid, task_id: x.id, task_name: x.name, hours: h, weight_snapshot: x.weight}); };
const sal = (pid, oid, role, s) => { if (ownerIds.has(oid)) salaries.push({period_id: pid, owner_id: oid, role_id: role, gross_eur: s}); };
const ip = chrono.find(p => p.kind === 'ip'), inc = chrono.find(p => p.kind === 'incubation'), months = chrono.filter(p => p.kind === 'month');
if (ip) { ent(ip.id, 'jal', 'General B-WIM', 300); ent(ip.id, 'ka', 'RTS-DT', 200); ent(ip.id, 'kd', 'General FEM', 150); ent(ip.id, 'hb', 'Settling the BME-IP', 120); }
if (inc) { ent(inc.id, 'jal', 'Investor relationship', 80); ent(inc.id, 'szb', 'Assembling the pitch', 60); ent(inc.id, 'vi', 'Building and updating', 40); ent(inc.id, 'hb', 'Preparing the cap table', 30); }
months.forEach((p, i) => { const f = 1 + i * 0.05;
  ent(p.id, 'hb', 'Company leadership', 50 * f); ent(p.id, 'hb', 'Investor relationship', 30); sal(p.id, 'hb', 'ceo', 2500);
  ent(p.id, 'jal', 'New public-sector', 60 * f); ent(p.id, 'jal', 'Key-account', 20); sal(p.id, 'jal', 'coo', 1500);
  ent(p.id, 'ka', 'General B-WIM', 90 * f); sal(p.id, 'ka', 'it', 0);
  ent(p.id, 'kd', 'Building the bridge-specific FEM', 70); sal(p.id, 'kd', 'civ', null);
  ent(p.id, 'kb', 'Writing and winning domestic', 50); sal(p.id, 'kb', 'cso', 2000);
  ent(p.id, 'szb', 'Scientific publication', 30); sal(p.id, 'szb', 'civ', null);
  ent(p.id, 'vi', 'Finance / controlling', 45); sal(p.id, 'vi', 'it', 1000);
  if (i < months.length - 2) owners.forEach(o => approvals.push({period_id: p.id, owner_id: o.id})); });
[ip, inc].filter(Boolean).forEach(p => owners.forEach(o => approvals.push({period_id: p.id, owner_id: o.id})));

console.log(`Would replace all logged work with: ${entries.length} entries, ${salaries.length} salaries, ${approvals.length} approvals across ${chrono.length} periods.`);
if (!yes) { console.log('Dry run — add --yes to write.'); process.exit(0); }

const pids = chrono.map(p => p.id);
await must(sb.from('approvals').delete().in('period_id', pids), 'clear approvals');
await must(sb.from('entries').delete().in('period_id', pids), 'clear entries');
await must(sb.from('salaries').delete().in('period_id', pids), 'clear salaries');
await must(sb.from('entries').insert(entries), 'insert entries');
await must(sb.from('salaries').insert(salaries), 'insert salaries');
await must(sb.from('approvals').insert(approvals), 'insert approvals');       // after entries: the trigger would wipe them otherwise
await must(sb.from('periods').update({needs_reapproval: false, edited_by: null, edited_at: null}).in('id', pids), 'reset flags');
console.log('Example data seeded — older periods finalised, last two months pending.');
