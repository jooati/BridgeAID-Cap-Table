#!/usr/bin/env node
/* ============================================================================
   import-state.mjs — one-off import of a legacy "Save JSON" file into Supabase.

     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-state.mjs --from state.json

   Master data is merged (upsert by id), every period contained in the file is overwritten
   (entries, salaries, approvals) and the re-approval flags are copied. Runs with the
   service-role key, so approvals are restored exactly as in the file.
   ============================================================================ */
import fs from 'node:fs';
import { serviceClient, arg } from './lib.mjs';
import { importState } from '../js/import-state.js';

const from = arg('--from');
if (!from || from === true) { console.error('Usage: node scripts/import-state.mjs --from state.json'); process.exit(2); }
let payload;
try { payload = JSON.parse(fs.readFileSync(from, 'utf8')); } catch (e) { console.error('Cannot read', from, '-', e.message); process.exit(2); }

const sb = serviceClient();
try {
  const res = await importState(sb, payload, {restoreApprovals: true, log: s => console.log('  ' + s)});
  console.log(`Imported ${res.entries} entries, ${res.salaries} salaries and ${res.approvalsRestored} approvals over ${res.periods} periods.`);
} catch (e) { console.error('Import failed:', e.message || e); process.exit(1); }
