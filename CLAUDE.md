# BridgeAID Monthly Ownership Tracker — project guide for Claude Code

Static web app on GitHub Pages (https://jooati.github.io/BridgeAID-Cap-Table/), data + auth in Supabase.
No build step: plain ES modules, CDN libraries only. **Every change: `npm test` must stay green.**

## Layout
```
index.html            shell: header (logo, 4 tabs, Sign in, menu), 4 tab panels
css/app.css
js/config.js          SUPABASE_URL, SUPABASE_ANON_KEY (public by design; RLS is the guard)
js/calc.js            PURE: calcCell, computeAll, ownerCumulative — no DOM, no I/O
js/data.js            Supabase: load full state → S, targeted writes, realtime subscription
js/auth.js            sign in / out, forgot password, change password, current owner + admin flag
js/ui-tracker.js      period × owner card matrix, two share bars
js/ui-owners.js       salary-table matrix, roles, owners & baseline
js/ui-tasks.js        task catalog & weights
js/ui-report.js       work log & task report, audit log, CSV / PDF export
js/ui-diag.js         Connection diagnostics panel (click the status pill): one probe per table + RPCs
js/app.js             boot, tabs (#hash deep links), toast
tests/                jsdom tests (node), run with `npm test`
scripts/seed-example.mjs   dev-only demo data (never exposed in the UI)
supabase/schema.sql   source of truth for the DB
```

## Domain model (mirror of supabase/schema.sql)
- owners (baseline_pct, sort_last, is_admin, auth_uid) · roles · salary_tables(effective_from, fx) · salary_rates
- task_groups → task_categories → tasks(weight)
- periods: kind ip | incubation | month(ym). Stored chronologically; **displayed newest first**, then Incubation, then IP.
- entries(period, owner, task, hours, **weight_snapshot**) · salaries(period, owner, role, gross_eur) · approvals(period, owner)

## Calculation chain (calc.js) — do not change without updating tests
```
H = Σ hours            W = Σ hours × weight_snapshot        avgW = W / H
market  = gross_huf(role, salary table in force for period.ym) / fx
paid_h  = gross_eur / market × 160       (months only; 0 for ip/incubation)
paid_w  = min(paid_h, H) × avgW
equity  = W − paid_w                      (= W × (1 − paid_h/H))
share_this_period = equity / Σ_owners equity
cumulative = running Σ equity in chronological order (ip → incub → months); cum share = own / total
```
Salary table in force = latest table with effective_from ≤ period month (fallback: earliest).

## Invariants
- 7 default owners always exist; **HB is `sort_last` and appears last in every list**; others A–Z (hu collation).
- Months 2025-12 → 2026-09 always exist; admins add later months one at a time.
- Baseline: JAL/KÁ/KD/SZB 16.67, KB/VI 16.66, HB 0 → sums to 100.00.
- Weight snapshot: editing a task weight affects **new** entries only.
- Approval = whole period. DB trigger clears **all** approvals on any entries/salaries change. Final = every owner approved. Finalised periods are read-only until an admin reopens.
- Money: `€1,234,567.89`; percentages 2 decimals; hours 1 decimal.

## Permissions
- owner: read all; write own entries/salaries while period not final; own approval only.
- admin (is_admin): master data, periods (add/remove/reopen), link owners ↔ auth users.
- No Reset / Load example / Save JSON / Load JSON in the UI (the legacy JSON import lives in `scripts/import-state.mjs`).

## UI conventions
Brand: navy #222A35, gold #FFC000. Cards: tasks mini-table (name ×w · hours · × w = total) → Σ line → salary block → `W − paid_w = Equity hours` → share. Columns collapsible except the newest. Header single row: logo · tabs · live/offline pill · Sign in (owner name + admin badge) · menu (Export CSV, Export PDF).

## Testing
`npm test` runs tests/*.test.mjs with jsdom. Supabase is mocked in tests (tests/mock-supabase.mjs). Add a test for every behaviour change.
