# BridgeAID — Monthly Ownership Tracker

Static web app on **GitHub Pages**, data and sign-in in **Supabase**. No build step: plain ES modules and CDN libraries.

* Live: https://jooati.github.io/BridgeAID-Cap-Table/
* Project guide for contributors and Claude Code: [`CLAUDE.md`](CLAUDE.md)
* Database: [`supabase/schema.sql`](supabase/schema.sql) (source of truth)

## How it works

Every owner signs in with an email + password (Supabase Auth). The app loads the whole tracker into memory, every edit is a targeted
write to the database (row-level security decides who may change what), and Realtime pushes other people's changes into the page.

* **Owner** — sees everything, edits their own card while the period is not finalised, approves only for themselves.
* **Admin** (`owners.is_admin`) — also maintains master data (tasks & weights, roles, salary tables, owners), adds/removes/reopens
  months and links owners to sign-in accounts (Owners tab → *Sign-in account*).

The calculation (in `js/calc.js`) is unchanged from the single-file version — see the formula block in `CLAUDE.md`.

## Deploy

1. Push to `main`. GitHub Pages serves the repository root (Settings → Pages → *Deploy from a branch*, branch `main`, folder `/`).
2. `js/config.js` holds the Supabase URL and the **anon** key. They are public by design; RLS is the guard.
3. In Supabase → Authentication → URL Configuration add the site URL (`https://jooati.github.io/BridgeAID-Cap-Table/`) to
   **Redirect URLs** — the *Forgot password* email links back to it.

## Database setup

* Fresh project: run the whole `supabase/schema.sql` in the SQL Editor (it drops and recreates everything, then seeds the 7 owners,
  roles, salary table, task catalog and the periods).
* Project that already has the schema: paste only the **MIGRATION** block at the end of `schema.sql` (adds the
  `list_auth_users()` RPC used by the admin panel and refines the approval-reset trigger; keeps all data).

## Adding a user

1. Supabase → Authentication → Users → **Add user** (email + password, or *Send invitation*). Ask them to use *Forgot password?* on
   the sign-in screen if you did not hand over a password.
2. Sign in to the app as an admin → tab **1 Owners, roles & setup** → *Owners* → pick the new email in the *Sign-in account* dropdown of
   the owner. Tick *admin* if they should maintain master data.
   (SQL alternative: `update owners set auth_uid = (select id from auth.users where email = '…') where id = 'jal';`)
3. Until an account is linked to an owner, it can sign in but sees everything read-only.

## Scripts (dev only, never exposed in the UI)

Both need the **service-role** key. Copy `.env.example` to `.env` (git-ignored) and fill in:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

* `npm run seed -- --yes` — replaces every logged entry/salary/approval with the demo data (older periods finalised, the last
  two months pending). Without `--yes` it only prints what it would do.
* `npm run import -- --from state.json` — one-off import of a legacy **Save JSON** file: master data merged, every period in the
  file overwritten, approvals restored. (The admin *Load JSON* menu item does the same through the app, but cannot restore other
  people's approvals.)

## Development

```
npm install
npm test          # jsdom tests, Supabase mocked (tests/mock-supabase.mjs)
```

Open `index.html` through any static server (e.g. `npx serve .`) — modules do not load from `file://`.

Layout, domain model, invariants and the calculation chain are documented in `CLAUDE.md`. Add a test for every behaviour change.
