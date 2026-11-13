/* ============================================================================
   i18n.js — language switcher (English / Hungarian). No DOM access at import time.
   • tr('English source', {vars})  → the English text itself, or its Hungarian translation (HU)
   • N_('English source')          → marks a string that is translated later with tr(variable)
   • trs(['A', 'B'])               → array of translated strings (CSV headers)
   • static markup: data-i18n="key" (HU_HTML, innerHTML) · data-i18n (empty: the element's own
     English text is the key, HU) · data-i18n-title (same for the title attribute)
   • tn(name)  → Hungarian name of a seed task / category / group / role while the stored name is
     still the English seed text (DB content stays canonical English; renamed items show as stored)
   • pl(row)   → period label, ymL('2026-03') → month label, whenL(iso) → date-time
   Numbers keep one format in both languages (money €1,234,567.89 · % 2 decimals · hours 1 decimal).
   tests/i18n.test.mjs fails when a string used in the code or the markup has no Hungarian entry.
   ============================================================================ */

export const LANGS = ['en', 'hu'];
export const LANG_KEY = 'bridgeaid:lang';
export let lang = 'en';

export const HU = {
  /* ---- header, tabs, status ---- */
  'Owners, roles & setup': 'Tulajdonosok, szerepkörök',
  'Task division — weights': 'Feladatok — súlyok',
  'Monthly ownership tracker': 'Havi tulajdonrész-követő',
  'Work log & task report': 'Munkanapló, jelentés',
  'BridgeAID — Monthly Ownership Tracker': 'BridgeAID — Havi tulajdonrész-követő',
  'Live': 'Élő', 'Offline': 'Offline', 'Load failed': 'Betöltési hiba',
  'Connection to the shared database — click for diagnostics': 'Kapcsolat a közös adatbázissal — kattintson a diagnosztikához',
  'Signed in as': 'Bejelentkezve:',
  'Sign out': 'Kijelentkezés',
  'Menu': 'Menü',
  'Export CSV (all data)': 'CSV-export (minden adat)',
  'Export PDF (monthly pages)': 'PDF-export (havi oldalak)',
  'Sign in first.': 'Előbb jelentkezzen be.',
  'Could not load the Supabase client — check your connection and reload.': 'Nem sikerült betölteni a Supabase klienst — ellenőrizze a kapcsolatot, és töltse újra az oldalt.',
  'Could not load the data: {msg}': 'Nem sikerült betölteni az adatokat: {msg}',
  'Some data could not be loaded ({tables}) — the tracker may be incomplete. Click the status pill for diagnostics.': 'Néhány adatot nem sikerült betölteni ({tables}) — a követő hiányos lehet. A diagnosztikához kattintson az állapotjelzőre.',
  'Your account ({email}) is not linked to an owner yet — ask an admin (Owners tab). Everything is read-only.': 'A fiókja ({email}) még nincs tulajdonoshoz rendelve — kérjen meg egy admint (Tulajdonosok fül). Minden csak olvasható.',

  /* ---- sign in ---- */
  'Sign in': 'Bejelentkezés',
  'BridgeAID Monthly Ownership Tracker — owners only.': 'BridgeAID havi tulajdonrész-követő — csak tulajdonosoknak.',
  'Forgot password?': 'Elfelejtett jelszó?',
  'Reset password': 'Jelszó visszaállítása',
  'We email you a link; open it and choose a new password.': 'E-mailben küldünk egy hivatkozást; nyissa meg, és adjon meg új jelszót.',
  'Send reset link': 'Visszaállító link küldése',
  'Back to sign in': 'Vissza a bejelentkezéshez',
  'Set new password': 'Új jelszó beállítása',
  'Choose a new password for your account (at least 8 characters).': 'Adjon meg új jelszót a fiókjához (legalább 8 karakter).',
  'Save password': 'Jelszó mentése',
  'Change password': 'Jelszó módosítása',
  'Choose a new password (at least 8 characters).': 'Adjon meg új jelszót (legalább 8 karakter).',
  'Reset link sent to {email} — check your inbox.': 'A visszaállító linket elküldtük ide: {email} — nézze meg a postafiókját.',
  'The password must be at least 8 characters.': 'A jelszónak legalább 8 karakterből kell állnia.',
  'The two passwords differ.': 'A két jelszó nem egyezik.',
  'Password saved.': 'Jelszó elmentve.',
  'Signed in': 'Bejelentkezve',
  'not linked to an owner': 'nincs tulajdonoshoz rendelve',
  'Invalid login credentials': 'Hibás e-mail-cím vagy jelszó.',
  'Email': 'E-mail', 'Password': 'Jelszó', 'Repeat new password': 'Új jelszó még egyszer', 'Cancel': 'Mégse',

  /* ---- tracker ---- */
  'Owner': 'Tulajdonos',
  'Cumulative share': 'Halmozott részesedés',
  'Expand': 'Kinyitás',
  'Finalised — every owner approved': 'Lezárva — minden tulajdonos jóváhagyta',
  'Current month': 'Aktuális hónap', 'Month': 'Hónap', 'Special period': 'Különleges időszak',
  'Remove this month': 'Hónap eltávolítása',
  'Collapse column': 'Oszlop összecsukása',
  'Equity hours in period': 'Tulajdonrész-órák az időszakban',
  'edited by {name} · {when}': 'szerkesztette: {name} · {when}',
  'Reopen': 'Újranyitás',
  '{h} h cumulative': '{h} ó halmozva',
  '(removed task)': '(törölt feladat)',
  'weight': 'súly',
  'Remove': 'Eltávolítás',
  '— role —': '— szerepkör —',
  'Equity hours in this period': 'Tulajdonrész-órák ebben az időszakban',
  'Tasks & hours': 'Feladatok és órák', 'Tasks & points': 'Feladatok és pontok',
  'No entries': 'Nincs bejegyzés',
  '+ type a task from the Task division menu': '+ gépeljen be egy feladatot a Feladatok menüből',
  'Σ hours × avg. weight = Σ weighted': 'Σ óra × átl. súly = Σ súlyozott',
  'Σ hours': 'Σ óra', 'Σ points': 'Σ pont', '× avg. weight': '× átl. súly', 'Σ weighted': 'Σ súlyozott',
  'Salary this month': 'Fizetés ebben a hónapban',
  '€ gross': '€ bruttó',
  'Gross salary received for this role, EUR': 'A szerepkörért kapott bruttó fizetés, EUR',
  '{sal} ÷ {market} market (salary table from {from}) × 160 h = paid hours; × average task weight = weighted deduction': '{sal} ÷ {market} piaci bér ({from} kezdetű bértábla) × 160 ó = kifizetett órák; × átlagos feladatsúly = súlyozott levonás',
  'Paid hours': 'Kifizetett órák',
  ' (exceeds logged)': ' (több a rögzítettnél)',
  'Paid hours are removed at your average task weight ({avgW} = Σ weighted ÷ Σ hours)': 'A kifizetett órák az átlagos feladatsúllyal kerülnek levonásra ({avgW} = Σ súlyozott ÷ Σ óra)',
  'Equity hours': 'Tulajdonrész-órák',
  'Equity in this month': 'Részesedés ebben a hónapban', 'Equity in this period': 'Részesedés ebben az időszakban',
  'Approve this month': 'Hónap jóváhagyása', 'Approve this period': 'Időszak jóváhagyása',
  'Not yet approved': 'Még nincs jóváhagyva', 'Sign in to approve': 'A jóváhagyáshoz jelentkezzen be',
  'Baseline ownership': 'Kiinduló tulajdoni arány',
  'Current cumulative equity share': 'Jelenlegi halmozott tulajdonrész',
  'no data': 'nincs adat',
  'Baseline sums to {pct}% — edit on the Owners tab': 'A kiinduló arányok összege {pct}% — javítsa a Tulajdonosok fülön',
  'This period is finalised — an admin must reopen it first.': 'Ez az időszak le van zárva — előbb egy adminnak újra kell nyitnia.',
  'You can only edit your own card.': 'Csak a saját kártyáját szerkesztheti.',
  'Sign in to edit.': 'A szerkesztéshez jelentkezzen be.',
  'You can only approve as yourself.': 'Csak a saját nevében hagyhat jóvá.',
  'Sign in to approve.': 'A jóváhagyáshoz jelentkezzen be.',
  'Approved.': 'Jóváhagyva.', 'Approval withdrawn.': 'Jóváhagyás visszavonva.',
  'Reopen this finalised period? All approvals will be cleared.': 'Újranyitja ezt a lezárt időszakot? Minden jóváhagyás törlődik.',
  'Remove {label}? Its entries will be deleted.': 'Eltávolítja ezt: {label}? A bejegyzései törlődnek.',
  'Added {label}.': 'Hozzáadva: {label}.',
  'h': 'ó', 'pts': 'pont',
  'Finalised': 'Lezárva', 'Re-approval needed': 'Újra jóvá kell hagyni', 'Approved {n}/{N}': 'Jóváhagyva {n}/{N}', 'Pending': 'Függőben',
  'Approved': 'Jóváhagyva', 'Approved by {name}': 'Jóváhagyta: {name}',
  '+ Add month': '+ Hónap hozzáadása',
  'Collapse all but current': 'Mind összecsukása az aktuális kivételével',
  'Expand all': 'Mind kinyitása',
  '◀ collapses a column · ▶ expands it': '◀ összecsukja az oszlopot · ▶ kinyitja',

  /* ---- owners, roles & setup ---- */
  'Role': 'Szerepkör',
  'monthly gross, 160 h': 'havi bruttó, 160 ó',
  'in force now': 'jelenleg érvényes',
  'until {month}': 'eddig: {month}',
  'Newest table': 'Legújabb tábla', 'Salary table': 'Bértábla',
  'from': 'ettől:',
  'Remove this table': 'Tábla eltávolítása', 'Collapse': 'Összecsukás',
  'role': 'szerepkör',
  'Remove role': 'Szerepkör eltávolítása', '× remove': '× eltávolítás',
  'Monthly gross (HUF)': 'Havi bruttó (HUF)',
  '≈ EUR / month': '≈ EUR / hó', 'EUR / hour': 'EUR / óra',
  'New salary table from {month} — copied from the previous one; adjust the values and the month.': 'Új bértábla {month} kezdettel — az előző másolata; igazítsa az értékeket és a hónapot.',
  'Remove this salary table? Months it covered will fall back to the previous table.': 'Eltávolítja ezt a bértáblát? Az általa lefedett hónapok az előző táblára esnek vissza.',
  'Role name:': 'Szerepkör neve:',
  'This role is used on some cards (their paid hours will become 0). Delete anyway?': 'Ez a szerepkör néhány kártyán használatban van (a kifizetett óráik 0-ra változnak). Mégis törli?',
  'linked to a sign-in account': 'bejelentkezési fiókhoz kapcsolva', 'not linked': 'nincs hozzárendelve',
  'Sign-in account (auth user) for this owner': 'A tulajdonos bejelentkezési fiókja (auth felhasználó)',
  '— not linked —': '— nincs hozzárendelve —',
  '(unknown user {id}…)': '(ismeretlen felhasználó {id}…)',
  'Admins maintain master data, periods and user links': 'Az adminok kezelik a törzsadatokat, az időszakokat és a fiók-hozzárendeléseket',
  'admin': 'admin',
  'Name': 'Név', 'Baseline %': 'Kiinduló %', 'id': 'azonosító', 'Sign-in account': 'Bejelentkezési fiók',
  ' · admin': ' · admin',
  'No owners yet.': 'Még nincs tulajdonos.',
  'Loading sign-in accounts…': 'Bejelentkezési fiókok betöltése…',
  'No sign-in accounts yet — create the users in Supabase → Authentication → Users, then link them here.': 'Még nincs bejelentkezési fiók — hozza létre a felhasználókat itt: Supabase → Authentication → Users, majd rendelje hozzá őket itt.',
  'Could not list sign-in accounts: {msg}': 'Nem sikerült lekérni a bejelentkezési fiókokat: {msg}',
  'Owner name:': 'Tulajdonos neve:',
  'Remove {name}? Their entries and approvals will be deleted from every period.': 'Eltávolítja őt: {name}? A bejegyzései és jóváhagyásai minden időszakból törlődnek.',
  'That account is already linked to {name} — unlink it there first.': 'Ez a fiók már hozzá van rendelve: {name} — előbb ott válassza le.',
  'Account linked.': 'Fiók hozzárendelve.', 'Account unlinked.': 'Fiók leválasztva.',
  'Remove your own admin rights? You will not be able to undo this yourself.': 'Megvonja a saját admin jogát? Ezt egyedül nem tudja visszacsinálni.',
  'Master data is maintained by the admins — shown read-only.': 'A törzsadatokat az adminok kezelik — csak olvasható.',
  'Role market salaries (monthly gross, 160 h) — versioned by month': 'Szerepkörök piaci bére (havi bruttó, 160 óra) — havonta verziózva',
  '+ New salary table': '+ Új bértábla', '+ Add role': '+ Szerepkör hozzáadása',
  'Owners': 'Tulajdonosok',
  '— baseline, and (admins) the link to the sign-in account': '— kiinduló arány, és (adminoknak) a bejelentkezési fiók hozzárendelése',
  '+ Add owner': '+ Tulajdonos hozzáadása',

  /* ---- tasks ---- */
  'Task weights are maintained by the admins — shown read-only.': 'A feladatsúlyokat az adminok kezelik — csak olvasható.',
  'Projects': 'Projektek', 'Operations': 'Működés',
  '+ Add task': '+ Feladat hozzáadása', '+ Add category': '+ Kategória hozzáadása',
  'This task has logged entries (weight snapshots are kept). Delete anyway?': 'Ehhez a feladathoz vannak rögzített bejegyzések (az eltárolt súlyok megmaradnak). Mégis törli?',

  /* ---- report ---- */
  'By task': 'Feladatonként', 'By person': 'Személyenként', 'Payments': 'Kifizetések',
  'Export work log CSV': 'Munkanapló CSV-exportja', 'Export audit CSV': 'Változásnapló CSV-exportja',
  'All periods': 'Minden időszak', 'All owners': 'Minden tulajdonos',
  'Total logged': 'Összes rögzített', 'weighted': 'súlyozott', '{n} tasks': '{n} feladat',
  'Task': 'Feladat', 'Category': 'Kategória', 'Hours': 'Órák', '% of total': 'az összes %-a', 'Weighted': 'Súlyozott', 'Periods': 'Időszakok',
  'Who worked on it': 'Ki dolgozott rajta', 'Time share': 'Időarány',
  'No logged work for this selection.': 'Ehhez a szűréshez nincs rögzített munka.',
  '{h} h logged · weighted {w} · avg. weight {a}': '{h} ó rögzítve · súlyozott {w} · átl. súly {a}',
  '% of own': 'a sajátja %-a',
  'No logged work.': 'Nincs rögzített munka.',
  'Month total': 'Havi összesen',
  '{role} · {h} h paid': '{role} · {h} ó kifizetve',
  'Total': 'Összesen',
  '{a} of {b} h paid': '{b} órából {a} kifizetve',
  /* CSV */
  'Period': 'Időszak', 'Group': 'Csoport', 'Weight': 'Súly',
  '# BRIDGEAID MONTHLY OWNERSHIP TRACKER — FULL EXPORT': '# BRIDGEAID HAVI TULAJDONRÉSZ-KÖVETŐ — TELJES EXPORT',
  '# OWNERS': '# TULAJDONOSOK', 'Id': 'Azonosító', 'Cumulative equity hours': 'Halmozott tulajdonrész-órák', 'Cumulative share %': 'Halmozott részesedés %',
  '# SALARY TABLES (monthly gross, 160 h) — versioned': '# BÉRTÁBLÁK (havi bruttó, 160 ó) — verziózva',
  'Effective from': 'Érvényes ettől', 'Role id': 'Szerepkör-azonosító', 'Monthly gross HUF': 'Havi bruttó HUF',
  '# TASK CATALOG': '# FELADATKATALÓGUS', 'Category id': 'Kategóriaazonosító', 'Task id': 'Feladatazonosító',
  '# PERIOD SUMMARY (per owner)': '# IDŐSZAKI ÖSSZESÍTŐ (tulajdonosonként)',
  'Kind': 'Típus', 'Logged': 'Rögzített', 'Avg weight': 'Átl. súly', 'Salary EUR': 'Fizetés EUR', 'Paid weighted': 'Kifizetett súlyozott', 'Unpaid hours': 'Ki nem fizetett órák',
  'Share this period %': 'Részesedés az időszakban %', 'Column status': 'Oszlop állapota', 'Approval': 'Jóváhagyás',
  'finalised': 'lezárva', 're-approval needed': 'újra jóvá kell hagyni', 'approved {n}/{N}': 'jóváhagyva {n}/{N}', 'not approved': 'nincs jóváhagyva',
  '# WORK LOG (every entry)': '# MUNKANAPLÓ (minden bejegyzés)', 'Weight (snapshot)': 'Súly (eltárolt)',
  '# PAYMENTS': '# KIFIZETÉSEK', 'Role market EUR': 'Szerepkör piaci bére EUR', 'Logged hours': 'Rögzített órák',
  'month': 'hónap', 'ip': 'IP', 'incubation': 'inkubáció',
  /* PDF */
  'w': 'súly', 'no entries': 'nincs bejegyzés',
  'Σ {H} {unit} × avg. weight {avgW}': 'Σ {H} {unit} × átl. súly {avgW}',
  'Salary': 'Fizetés', 'Share': 'Részesedés',
  'Exported {when}': 'Exportálva: {when}',
  'Ownership': 'Tulajdoni arány',
  'cumulative total after this period': 'halmozott összeg az időszak után',
  'Share this period': 'Részesedés az időszakban', 'Cumulative hours': 'Halmozott órák',
  'Master data': 'Törzsadatok',
  'Role market salaries — effective from {month} · HUF→EUR {fx}': 'Szerepkörök piaci bére — érvényes ettől: {month} · HUF→EUR {fx}',
  'HUF / month': 'HUF / hó', 'EUR / month': 'EUR / hó',
  'Task catalog & weights': 'Feladatkatalógus és súlyok',
  'PDF export needs html2canvas + jsPDF (offline/blocked). CSV still works.': 'A PDF-exporthoz html2canvas + jsPDF kell (offline/blokkolva). A CSV-export működik.',
  'PDF export failed: {msg}': 'A PDF-export nem sikerült: {msg}',

  /* ---- audit log ---- */
  'Audit log': 'Változásnapló',
  'Entries': 'Bejegyzések', 'Salaries': 'Fizetések', 'Approvals': 'Jóváhagyások', 'Roles': 'Szerepkörök', 'Salary tables': 'Bértáblák', 'Salary rates': 'Bértételek',
  'Tasks': 'Feladatok', 'Task categories': 'Feladatkategóriák', 'Task groups': 'Feladatcsoportok',
  'system': 'rendszer', 'a period': 'egy időszak', 'task': 'feladat',
  'When': 'Mikor', 'Who': 'Ki', 'Action': 'Művelet', 'What': 'Mi', 'raw': 'nyers',
  'added': 'hozzáadva', 'removed': 'törölve', 'changed': 'módosítva',
  '{n} of {total} changes': '{total} változásból {n}',
  'No changes recorded for this selection.': 'Ehhez a szűréshez nincs rögzített változás.',
  'All tables': 'Minden tábla',
  'Audit log unavailable — run the MIGRATION block at the end of {file} in the Supabase SQL editor.': 'A változásnapló nem érhető el — futtassa a {file} végén lévő MIGRATION blokkot a Supabase SQL-szerkesztőjében.',
  'Table': 'Tábla', 'Key': 'Kulcs', 'Old': 'Régi', 'New': 'Új',
  '{o}: logged {t} in {p}': '{o}: rögzítette: {t} — {p}',
  '{o}: removed {t} ({h} h) from {p}': '{o}: törölte: {t} ({h} ó) — {p}',
  '{o}: hours {a} → {b} on {t} in {p}': '{o}: órák {a} → {b}, {t} — {p}',
  '{o}: changed {t} in {p}': '{o}: módosította: {t} — {p}',
  '{o}: salary removed from {p}': '{o}: fizetés törölve — {p}',
  'role {r}': 'szerepkör: {r}', 'salary {s}': 'fizetés: {s}',
  'role {a} → {b}': 'szerepkör {a} → {b}', 'salary {a} → {b}': 'fizetés {a} → {b}',
  'salary changed': 'fizetés módosult',
  '{o}: {parts} in {p}': '{o}: {parts} — {p}',
  '{by} approved on behalf of {o} — {p}': '{by} jóváhagyta {o} nevében — {p}',
  '{o} approved {p}': '{o} jóváhagyta: {p}',
  "{o}'s approval of {p} withdrawn": '{o} jóváhagyása visszavonva — {p}',
  "{o}'s approval of {p} changed": '{o} jóváhagyása módosult — {p}',
  '{who} added {label}': '{who} hozzáadta: {label}',
  '{who} removed {label}': '{who} eltávolította: {label}',
  '{who} changed {label}': '{who} módosította: {label}',
  '{who} added owner {name}': '{who} új tulajdonost vett fel: {name}',
  '{who} removed owner {name}': '{who} eltávolította a tulajdonost: {name}',
  'name {a} → {b}': 'név {a} → {b}',
  'baseline {a} → {b}%': 'kiinduló arány {a} → {b}%',
  'unlinked from the sign-in account': 'leválasztva a bejelentkezési fiókról',
  'made admin': 'admin lett', 'admin rights removed': 'admin jog megvonva',
  '{who}: {name} {parts}': '{who}: {name} — {parts}',
  '{who} added role {name}': '{who} új szerepkört vett fel: {name}',
  '{who} removed role {name}': '{who} eltávolította a szerepkört: {name}',
  '{who} renamed role {a} → {b}': '{who} átnevezte a szerepkört: {a} → {b}',
  '{who} added a salary table from {from} (HUF→EUR {fx})': '{who} új bértáblát vett fel {from} kezdettel (HUF→EUR {fx})',
  '{who} removed the salary table from {from}': '{who} eltávolította a(z) {from} kezdetű bértáblát',
  'effective from {a} → {b}': 'érvényesség kezdete {a} → {b}',
  'HUF→EUR {a} → {b}': 'HUF→EUR {a} → {b}',
  'the salary table': 'a bértáblát',
  '{who} changed {parts} in the table from {from}': '{who} módosította: {parts} — {from} kezdetű bértábla',
  'the table from {from}': '{from} kezdetű tábla', 'table #{id}': '#{id} tábla',
  '{who} removed the {role} base salary from {tb}': '{who} törölte a(z) {role} alapbérét ({tb})',
  '{who} set {role} base salary {v} HUF in {tb}': '{who} beállította a(z) {role} alapbérét: {v} HUF ({tb})',
  '{who} changed {role} base salary {a} → {b} HUF in {tb}': '{who} módosította a(z) {role} alapbérét: {a} → {b} HUF ({tb})',
  "{who} added task '{name}' (weight {w})": "{who} új feladatot vett fel: '{name}' (súly {w})",
  "{who} removed task '{name}'": "{who} törölte a feladatot: '{name}'",
  "renamed '{a}' → '{b}'": "átnevezte: '{a}' → '{b}'",
  "'{name}' weight {a} → {b}": "'{name}' súlya {a} → {b}",
  'changed a task': 'módosított egy feladatot',
  '{who}: {parts}': '{who}: {parts}',
  "{who} added group '{name}'": "{who} új csoportot vett fel: '{name}'",
  "{who} removed group '{name}'": "{who} törölte a csoportot: '{name}'",
  "{who} renamed group '{a}' → '{b}'": "{who} átnevezte a csoportot: '{a}' → '{b}'",
  "{who} added category '{name}'": "{who} új kategóriát vett fel: '{name}'",
  "{who} removed category '{name}'": "{who} törölte a kategóriát: '{name}'",
  "{who} renamed category '{a}' → '{b}'": "{who} átnevezte a kategóriát: '{a}' → '{b}'",

  /* ---- diagnostics ---- */
  'Connection diagnostics': 'Kapcsolatdiagnosztika',
  'Probe': 'Próba', 'Result': 'Eredmény', 'Details': 'Részletek', 'Run again': 'Újrafuttatás', 'Close': 'Bezárás',
  'One probe per table and RPC against the Supabase project.': 'Táblánként és RPC-nként egy próba a Supabase projekt felé.',
  'Probing…': 'Próbák futnak…', 'OK': 'OK', 'ERROR': 'HIBA', 'Last load:': 'Utolsó betöltés:',
  '{failed} of {n} probes failed. A missing table means the MIGRATION block at the end of supabase/schema.sql has not been run; "permission denied" means a row-level-security policy.': '{n} próbából {failed} sikertelen. A hiányzó tábla azt jelenti, hogy a supabase/schema.sql végén lévő MIGRATION blokk még nem futott le; a „permission denied” sorszintű biztonsági (RLS) szabályra utal.',
  'All {n} probes OK.': 'Mind a(z) {n} próba rendben.',

  /* ---- data layer (error toasts: "<operation>: <reason>") ---- */
  'Save': 'Mentés', 'Add entry': 'Bejegyzés hozzáadása', 'Remove entry': 'Bejegyzés törlése', 'Save salary': 'Fizetés mentése',
  'Approve': 'Jóváhagyás', 'Withdraw approval': 'Jóváhagyás visszavonása', 'Reopen period': 'Időszak újranyitása',
  'Add month': 'Hónap hozzáadása', 'Remove month': 'Hónap eltávolítása', 'Add category': 'Kategória hozzáadása', 'Add task': 'Feladat hozzáadása', 'Delete task': 'Feladat törlése',
  'Update owner': 'Tulajdonos módosítása', 'Add owner': 'Tulajdonos hozzáadása', 'Remove owner': 'Tulajdonos eltávolítása',
  'Add role': 'Szerepkör hozzáadása', 'Delete role': 'Szerepkör törlése',
  'New salary table': 'Új bértábla', 'Remove salary table': 'Bértábla eltávolítása', 'Update salary table': 'Bértábla módosítása', 'Save rate': 'Bértétel mentése',
  'nothing was saved (no permission, or the row no longer exists)': 'semmi sem lett elmentve (nincs jogosultság, vagy a sor már nem létezik)',
  'Could not load {table}: {msg}': 'Nem sikerült betölteni: {table} — {msg}',
  'There is already a table starting that month.': 'Már van olyan tábla, amely abban a hónapban kezdődik.',
};

/* static markup with inline tags (index.html, data-i18n="key") */
export const HU_HTML = {
  'intro.p1': '<b>Cél.</b> Ez a táblázat azt követi, hogyan változik a tulajdonrész az idő múlásával. A fizetés <b>nélkül</b> végzett munka beleszámít a tulajdonrészbe; a kifizetett munka nem. Például a fizetés nélkül végzett COO-tevékenység beleszámít; és egy alacsony értékű projekten a fizetés nélkül végzett mérnöki munka is.',
  'intro.p2': '<b>1. előkészület — feladatok és súlyok.</b> A második menüpont két fő csoportban sorolja fel a feladatokat — <i>működés</i> és <i>projektek</i> —, mindegyiket egy súllyal. A feladatokról és a súlyokról a tulajdonosoknak kell megegyezniük; szükség esetén továbbiak is felvehetők.',
  'intro.p3': '<b>2. előkészület — kiinduló arány és fizetések.</b> A kiinduló tulajdoni arány már rögzített. A szerepkörök alapbéréről meg kell egyezni; ezek iparági sztenderdnek számítanak, és 160 órára vetített havi bruttó bért jelentenek.',
  'intro.p4': '<b>Grafikon.</b> A kiinduló tulajdoni arány és a jelenlegi halmozott tulajdonrész összevetése.',
  'intro.p5': '<b>Táblázat.</b> A sorok a tulajdonosok; az oszlopok az időszakok, a legújabbal kezdve, a végén az inkubátorprogramokkal és az IP-hozzájárulással — ez a két időszak a cégalapítás előtti.',
  'intro.each': '<b>Minden hónapban minden tulajdonos:</b>',
  'intro.li1': 'rögzíti, mely feladatokon dolgozott és hány órát — kezdje el gépelni a feladat nevét a második menüpontból; a rögzített feladatok átlagos súlya automatikusan számolódik;',
  'intro.li2': 'kiválasztja a szerepkörét, és rögzíti az adott hónapban kapott bruttó fizetését — a kifizetett órák a szerepkör alapbéréből (160 óra) számolódnak, és ugyanazzal az átlagos feladatsúllyal szorzódnak, így mindkét oldal azonos súlyokkal számol;',
  'intro.li3': 'a tulajdonrészbe beszámító órák = feladatórák − kifizetett órák (mindkettő súlyozva);',
  'intro.li4': 'ez az érték az oszlop összes tulajdonosáéval kerül összevetésre, és ez mozdítja el a tulajdoni arányt;',
  'intro.li5': 'jóváhagyja a hónapot, amint az adatok teljesek — minden tulajdonos az egész hónapot hagyja jóvá (mindenki kártyáját), így a tulajdoni arány mindig jóváhagyott, tényleges munkán alapul, előrejelzés nélkül.',
  'tasks.lead': 'Minden feladat relatív súlya. A súly a bejegyzés rögzítésekor eltárolódik: az itteni módosítás csak az új bejegyzésekre hat.',
  'report.lead': 'Mire megy el az idő. A rögzített munka személyenként vagy feladatonként, valamint a kifizetések személyenként — hogy látszódjanak a legtöbb órát felemésztő, automatizálásra érdemes feladatok.',
  'audit.lead': 'A közös adatok minden módosítása, a legújabbal kezdve — ki, mit és mikor változtatott.',
  'owners.lead': 'A tulajdonosok A–Z sorrendben jelennek meg. A szerepkörök piaci bére <b>160 órára</b> vetített havi bruttó; forintban adható meg, és az alábbi árfolyammal számolódik át.',
  'owners.tablesNote': 'Minden tábla a saját hónapjától a következő tábla kezdetéig érvényes. Egy hónap kártyái mindig az adott hónapban érvényes táblát használják, így az inflációs korrekció vagy az új EUR-árfolyam a kiválasztott hónaptól érvényesül, a korábbi időszakok érintése nélkül.',
  'owners.paidNote': 'Egy kártya kifizetett órái = fizetés (EUR) ÷ a szerepkör piaci bére (EUR, az érvényes táblából) × 160. Ezek az órák nem érnek tulajdonrészt.',
};

/* seed content stored in the database in English: task groups, categories, tasks, roles, special periods */
export const NAMES = {
  'Intellectual property': 'Szellemi tulajdon', 'Incubation programs': 'Inkubációs programok',
  'Civil engineer': 'Építőmérnök', 'IT engineer': 'Informatikai mérnök',
  'New task': 'Új feladat', 'New category': 'Új kategória',
  'Business-as-usual operations': 'Folyamatos működés (üzletmenet)',
  'Projects': 'Projektek',
  'Sales / business development / acquisition (B2G + B2B + international)': 'Értékesítés / üzletfejlesztés / ügyfélszerzés (B2G + B2B + nemzetközi)',
  'Grants / non-dilutive funding': 'Pályázatok / nem hígító finanszírozás',
  'Investor preparation / fundraising': 'Befektetői felkészülés / tőkebevonás',
  'Core technology / IP development (product core, not project-specific)': 'Alaptechnológia / IP-fejlesztés (termékmag, nem projektspecifikus)',
  'Operations / management / compliance': 'Működés / vezetés / megfelelés',
  'Marketing / brand / scientific reach': 'Marketing / márka / tudományos jelenlét',
  'BME-IP & legal foundations (investment readiness)': 'BME-IP és jogi alapok (befektetésre való felkészültség)',
  'Project preparation & site': 'Projekt-előkészítés és helyszín',
  'Installation & data collection': 'Telepítés és adatgyűjtés',
  'Data & modeling (project-specific)': 'Adat és modellezés (projektspecifikus)',
  'Delivery & client': 'Átadás és ügyfél',
  'Operations (recurring)': 'Üzemeltetés (ismétlődő)',
  'New public-sector client acquisition (road/bridge authority, e.g. Magyar Közút, MÁV) — signed framework/contract': 'Új közszférabeli ügyfél megszerzése (út-/hídkezelő, pl. Magyar Közút, MÁV) — aláírt keretmegállapodás/szerződés',
  'Winning the first client in a new international market (foreign bridge-management authority)': 'Első ügyfél megszerzése új nemzetközi piacon (külföldi hídkezelő hatóság)',
  'B2B partner agreement (engineering firm, contractor, sensor manufacturer) — sales channel': 'B2B partnermegállapodás (mérnökiroda, kivitelező, szenzorgyártó) — értékesítési csatorna',
  'Converting a pilot/PoC into a paid engagement': 'Pilot/PoC átfordítása fizetős megbízássá',
  'Securing a framework agreement / DPS / public-procurement qualification': 'Keretmegállapodás / DBR / közbeszerzési minősítés megszerzése',
  'Key-account relationship management, upsell (multiple bridges at the same operator)': 'Kiemelt ügyfelek kapcsolattartása, upsell (több híd ugyanannál az üzemeltetőnél)',
  'Tendering / bid writing for public procurement (technical + price)': 'Tenderezés / ajánlatírás közbeszerzésre (műszaki + ár)',
  'Channeling the industry / professional network (referrals)': 'Az iparági / szakmai kapcsolatháló becsatornázása (ajánlások)',
  'Writing and winning domestic R&D grants (NKFIH, KFI, GINOP-successor)': 'Hazai K+F pályázatok megírása és elnyerése (NKFIH, KFI, GINOP-utód)',
  'Writing and winning EU grants (Horizon Europe, EIC Accelerator)': 'EU-s pályázatok megírása és elnyerése (Horizon Europe, EIC Accelerator)',
  'Organizing consortium partners for a grant (BME, industry partner)': 'Konzorciumi partnerek szervezése pályázathoz (BME, ipari partner)',
  'Managing grant accounting, reporting and audit compliance': 'Pályázati elszámolás, beszámolás és auditmegfelelés kezelése',
  'Coordinating grant writers / consultants, building the grant pipeline': 'Pályázatírók / tanácsadók koordinálása, pályázati pipeline építése',
  'Assembling the pitch deck and equity story': 'A pitch deck és az equity story összeállítása',
  'Building and updating the financial model / business plan': 'A pénzügyi modell / üzleti terv felépítése és frissítése',
  'Compiling data-room / due-diligence materials (IP, legal, financial)': 'Adatszoba / átvilágítási anyagok összeállítása (IP, jogi, pénzügyi)',
  'Preparing the cap table and valuation, negotiating the term sheet': 'A cap table és az értékelés előkészítése, a term sheet tárgyalása',
  'Investor relationship building, roadshow, bringing an investor on board': 'Befektetői kapcsolatépítés, roadshow, befektető bevonása',
  'Investor-side reporting, board materials': 'Befektetői riportolás, igazgatósági anyagok',
  'General B-WIM algorithm development, accuracy optimization (product level)': 'Általános B-WIM algoritmusfejlesztés, pontosságoptimalizálás (termékszint)',
  'RTS-DT digital-twin platform / architecture development': 'RTS-DT digitális iker platform / architektúra fejlesztése',
  'General FEM / structural model library, validation framework': 'Általános végeselemes (FEM) / szerkezeti modellkönyvtár, validációs keretrendszer',
  'AI/ML model family, retraining pipeline (product level)': 'AI/ML modellcsalád, újratanítási pipeline (termékszint)',
  'Sensor / measurement hardware development, specification (patentable element)': 'Szenzor / mérőhardver fejlesztése, specifikációja (szabadalmaztatható elem)',
  'Software platform / web application / database infrastructure (core)': 'Szoftverplatform / webalkalmazás / adatbázis-infrastruktúra (mag)',
  'Scalable data pipeline and data-quality system': 'Skálázható adatfeldolgozó lánc és adatminőségi rendszer',
  'Product roadmap, architecture decisions, technical vision': 'Termék-roadmap, architekturális döntések, műszaki jövőkép',
  'Company leadership, executive duties, team coordination': 'Cégvezetés, ügyvezetői feladatok, csapatkoordináció',
  'Finance / controlling / cash-flow management': 'Pénzügy / kontrolling / cash-flow menedzsment',
  'SOPs, quality system, delivery processes': 'Szabványos működési eljárások (SOP), minőségirányítás, szállítási folyamatok',
  'GDPR / data handling / information security (critical-infrastructure data)': 'GDPR / adatkezelés / információbiztonság (kritikus infrastruktúra adatai)',
  'Public-procurement and contractual compliance, legal coordination': 'Közbeszerzési és szerződéses megfelelés, jogi koordináció',
  'HR / recruitment / hiring key staff (e.g. formalizing sales)': 'HR / toborzás / kulcsemberek felvétele (pl. az értékesítés formalizálása)',
  'Supplier and asset management (sensors, hardware procurement)': 'Beszállító- és eszközgazdálkodás (szenzorok, hardverbeszerzés)',
  'Scientific publication, conference presentation (credibility, lead generation)': 'Tudományos publikáció, konferencia-előadás (hitelesség, leadgenerálás)',
  'Industry / regulatory relationship building, organizing professional events': 'Iparági / szabályozói kapcsolatépítés, szakmai események szervezése',
  'Website, case studies, reference materials': 'Weboldal, esettanulmányok, referenciaanyagok',
  'PR, press, social media, brand building': 'PR, sajtó, közösségi média, márkaépítés',
  'Maintaining the BME / university relationship as a reputation and talent channel': 'A BME / egyetemi kapcsolat ápolása mint reputációs és tehetségcsatorna',
  'Settling the BME-IP chain (assignment / exclusive license / spin-off) — signed agreement': 'A BME-IP lánc rendezése (átruházás / kizárólagos licenc / spin-off) — aláírt megállapodás',
  'Delineating background vs. foreground IP, copyright assignment from members': 'A háttér- és az előtér-IP elhatárolása, szerzői jogok átruházása a tagoktól',
  'Trade-secret / know-how protection system (for the core algorithm)': 'Üzletititok- / know-how-védelmi rendszer (a magalgoritmushoz)',
  'Patenting the sensor/hardware element (where infringement is detectable)': 'A szenzor-/hardverelem szabadalmaztatása (ahol a bitorlás kimutatható)',
  'Preparing the articles of association + syndicate agreement (milestones)': 'A társasági szerződés + szindikátusi szerződés előkészítése (mérföldkövek)',
  'Site survey, bridge condition assessment, measurement plan': 'Helyszíni bejárás, hídállapot-felmérés, mérési terv',
  'Bridge preparation: sensor placement plan, installation concept': 'Híd-előkészítés: szenzorelhelyezési terv, telepítési koncepció',
  'Permitting, bridge-operator coordination, traffic management for installation': 'Engedélyeztetés, egyeztetés a hídkezelővel, forgalomtechnika a telepítéshez',
  'Physical installation and commissioning of sensors on the bridge': 'A szenzorok fizikai telepítése és üzembe helyezése a hídon',
  'Calibration measurement campaign (reference vehicle, load testing)': 'Kalibrációs mérési kampány (referenciajármű, próbaterhelés)',
  'Setting up continuous data collection, remote data link': 'Folyamatos adatgyűjtés és távoli adatkapcsolat kiépítése',
  'Building the bridge-specific database (historical + live data)': 'A hídspecifikus adatbázis felépítése (történeti + élő adatok)',
  'Building the bridge-specific FEM / structural model': 'A hídspecifikus végeselemes (FEM) / szerkezeti modell felépítése',
  'Setting up the RTS-DT digital twin for the given bridge, integration': 'Az RTS-DT digitális iker beállítása az adott hídra, integráció',
  'Training and calibrating the AI / B-WIM model on the bridge data': 'Az AI / B-WIM modell tanítása és kalibrálása a híd adatain',
  'Model validation, accuracy verification in front of the client': 'Modellvalidáció, pontosságigazolás az ügyfél előtt',
  'Software integration, client-dashboard customization': 'Szoftverintegráció, az ügyfél-dashboard testreszabása',
  'Structural evaluation report / expert opinion for the client': 'Szerkezetértékelési jelentés / szakvélemény az ügyfélnek',
  'Handover, client-side training': 'Átadás, ügyféloldali oktatás',
  'Project management, client relationship during the project': 'Projektmenedzsment, ügyfélkapcsolat a projekt alatt',
  'Continuous monitoring, alert handling, SLA fulfillment': 'Folyamatos monitoring, riasztáskezelés, SLA-teljesítés',
  'Maintenance, sensor replacement, model recalibration': 'Karbantartás, szenzorcsere, a modell újrakalibrálása',
  'Periodic reporting, client review, contract-renewal preparation': 'Időszakos riportolás, ügyféllel közös áttekintés, szerződéshosszabbítás előkészítése',
};

const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

/* ---------- translate ---------- */
const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
export function tr(s, vars) { return fill(lang === 'hu' && HU[s] != null ? HU[s] : s, vars); }
export const N_ = s => s;
export function trs(list) { return list.map(s => tr(s)); }
export function tn(name) { if (name == null) return ''; return lang === 'hu' && NAMES[name] != null ? NAMES[name] : name; }
export function locale() { return lang === 'hu' ? 'hu-HU' : 'en-GB'; }
export function ymL(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (lang === 'hu') return `${y}. ${HU_MONTHS[m - 1]}`;
  return new Date(y, m - 1, 1).toLocaleString('en-US', {month: 'long', year: 'numeric'});
}
/* period label: English = the label stored in the database; Hungarian = built from kind / month */
export function pl(row) {
  if (!row) return '';
  if (lang !== 'hu') return row.label;
  if (row.kind === 'month' && row.ym) return ymL(row.ym);
  return tn(row.label);
}
export function whenL(iso, withYear) {
  if (!iso) return '';
  const o = {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}; if (withYear) o.year = 'numeric';
  return new Date(iso).toLocaleString(locale(), o);
}

/* ---------- language state ---------- */
export function detectLang(saved, navLang) { if (LANGS.includes(saved)) return saved; return /^hu\b/i.test(String(navLang || '')) ? 'hu' : 'en'; }
/* read the saved choice (or the browser language) — call at boot */
export function initLang() {
  let saved = null, nav = '';
  try { saved = window.localStorage.getItem(LANG_KEY); } catch (e) { /* ignore */ }
  try { nav = window.navigator.language; } catch (e) { /* ignore */ }
  lang = detectLang(saved, nav);
  return lang;
}
export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'en';
  try { window.localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
  return lang;
}

/* ---------- static markup ---------- */
const src = new WeakMap();   // element → {html, text, title} as authored (English)
export function applyStatic(doc) {
  const hu = lang === 'hu';
  doc.querySelectorAll('[data-i18n]').forEach(el => {
    let s = src.get(el); if (!s) { s = {}; src.set(el, s); }
    const key = el.getAttribute('data-i18n');
    if (key) { if (s.html == null) s.html = el.innerHTML; el.innerHTML = hu && HU_HTML[key] != null ? HU_HTML[key] : s.html; }
    else { if (s.text == null) s.text = el.textContent; el.textContent = hu && HU[s.text] != null ? HU[s.text] : s.text; }
  });
  doc.querySelectorAll('[data-i18n-title]').forEach(el => {
    let s = src.get(el); if (!s) { s = {}; src.set(el, s); }
    if (s.title == null) s.title = el.getAttribute('title') || '';
    el.setAttribute('title', hu && HU[s.title] != null ? HU[s.title] : s.title);
  });
  doc.documentElement.setAttribute('lang', lang);
  doc.title = tr('BridgeAID — Monthly Ownership Tracker');
  doc.querySelectorAll('[data-lang]').forEach(b => { const on = b.getAttribute('data-lang') === lang; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}
