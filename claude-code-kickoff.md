# Kickoff prompt for Claude Code

Paste this as the first message in Claude Code, opened in the repo root.

\---

You are refactoring a single-file HTML equity tracker into a small ES-module app backed by Supabase, deployed unchanged to GitHub Pages. Read `CLAUDE.md` first; it is authoritative. Inputs in the repo:

* `legacy/BridgeAID\_monthly\_ownership\_tracker.html` — the current working app (all logic, styles, tests-by-example in its behaviour). Preserve every feature and number exactly, except the removals listed below.
* `supabase/schema.sql` — the database (already applied to the Supabase project).
* `js/config.js` — Supabase URL + anon key (already filled in).

Do the work in this order, committing after each step, and keep `npm test` green from step 2 onward:

1. **Split the file** into the layout in CLAUDE.md. `js/calc.js` must be pure and export `calcCell`, `computeAll`, `ownerCumulative`, `tableFor`, `roleEur`. Move all CSS to `css/app.css`. Keep CDN scripts (html2canvas, jsPDF, @supabase/supabase-js v2 via jsdelivr ESM).
2. **Tests**: create `tests/` with jsdom (`npm i -D jsdom`), a Supabase mock, and port these checks from the legacy behaviour: columns newest→oldest then Incubation, IP; HB last everywhere; card arithmetic `Σ hours × avgW = Σ weighted`, `W − paid\_w = equity`; shares sum to 100.00; cumulative is chronological; salary table in force by month (Feb uses Dec table, Mar uses a March table); approval reset on edit; collapse/expand; CSV sections; PDF builds one section per period + graphs + master data. `npm test` runs them all.
3. **Auth (`js/auth.js`)**: Sign in modal (email + password), "Forgot password" (Supabase `resetPasswordForEmail` with redirect to the site URL; handle the recovery link on load and show a "set new password" form), "Change password", "Sign out". The Sign in button shows the owner name and an `admin` badge. Unauthenticated users see the login modal only.
4. **Data (`js/data.js`)**: load everything into the same in-memory `S` shape the legacy code used (owners, roles, salaryTables, catalog, rows/cells) so the UI code stays almost unchanged; each edit becomes a targeted upsert/delete (entries, salaries, approvals, master data). Subscribe to Realtime on periods/entries/salaries/approvals/owners/salary\_tables/salary\_rates/tasks and reload the affected slice; never overwrite the input the user is typing in. Show a small live/offline indicator next to the Sign in button.
5. **Roles in the UI**: non-admins see master data read-only and can edit only their own card; approval checkbox acts for the signed-in owner; admins get "Add month", "Reopen", remove-month, and an **Owners ↔ users** panel that links each owner to an auth user (dropdown of auth users' emails via an RPC you add to `schema.sql`, security definer, admin-only).
6. **Remove** Reset and Load example from the UI; add `scripts/seed-example.mjs` (service-role key from env, never committed) that seeds demo data, and `scripts/import-state.mjs --from state.json` that imports a legacy Save-JSON file once.
7. `README.md`: deploy steps (push → Pages), env for scripts, how to add a user.

Constraints: no framework, no bundler; keep the brand look; do not change any formula in `calc.js` — if a test forces you to, stop and ask. When done, run `npm test`, then list what you verified manually in a browser.

Note: the root `index.html` is the old cap-table dashboard (also copied to `legacy/cap-table-dashboard.html`); overwrite it with the new app.

