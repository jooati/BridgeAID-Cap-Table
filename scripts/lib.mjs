/* Shared helpers for the dev-only scripts: .env loading + a service-role Supabase client. NEVER commit .env. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) { try { process.loadEnvFile(p); } catch (e) { fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }); } }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or the environment). See .env.example.'); process.exit(2); }
  return {url, key};
}
export function serviceClient() { const {url, key} = loadEnv(); return createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}}); }
export function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : null; }
export async function must(p, what) { const {data, error} = await p; if (error) { console.error(`${what} failed:`, error.message || error); process.exit(1); } return data; }
