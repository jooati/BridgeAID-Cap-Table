-- ============================================================================
-- BridgeAID Monthly Ownership Tracker — Supabase schema, RLS, triggers, seed
-- Run once in the Supabase SQL Editor (safe to re-run: drops and recreates).
-- ============================================================================

-- ---------- reset (dev-friendly; comment out after go-live) ----------
-- drop table if exists approvals, salaries, entries, periods, tasks, task_categories, task_groups,
                     salary_rates, salary_tables, roles, owners cascade;
-- drop function if exists is_admin() cascade;
-- drop function if exists my_owner_id() cascade;
-- drop function if exists reset_period_approvals() cascade;
-- drop function if exists period_is_final(text) cascade;

-- ---------- master data ----------
create table owners (
  id            text primary key,                 -- 'hb','jal',...
  name          text not null,
  baseline_pct  numeric(6,2) not null default 0,
  sort_last     boolean not null default false,   -- HB pinned to the end of every list
  auth_uid      uuid unique references auth.users(id) on delete set null,
  is_admin      boolean not null default false
);

create table roles (
  id   text primary key,   -- 'ceo','coo',...
  name text not null
);

create table salary_tables (
  id             bigserial primary key,
  effective_from date not null unique,            -- always the 1st of a month
  fx_huf_eur     numeric(8,2) not null check (fx_huf_eur > 0)
);

create table salary_rates (
  table_id  bigint references salary_tables(id) on delete cascade,
  role_id   text   references roles(id) on delete cascade,
  gross_huf numeric(12,0) not null default 0,
  primary key (table_id, role_id)
);

create table task_groups (
  id   text primary key,   -- 'biz','proj'
  name text not null
);
create table task_categories (
  id       text primary key,
  group_id text not null references task_groups(id) on delete cascade,
  code     text not null,
  name     text not null
);
create table tasks (
  id          text primary key,
  category_id text not null references task_categories(id) on delete cascade,
  name        text not null,
  weight      numeric(6,2) not null default 1
);

-- ---------- periods & logged work ----------
create table periods (
  id               text primary key,             -- 'ip','incub','m202512',...
  kind             text not null check (kind in ('ip','incubation','month')),
  ym               text unique,                  -- 'YYYY-MM' for months, null otherwise
  label            text not null,
  needs_reapproval boolean not null default false,
  edited_by        text references owners(id),
  edited_at        timestamptz
);

create table entries (
  id              bigserial primary key,
  period_id       text not null references periods(id) on delete cascade,
  owner_id        text not null references owners(id) on delete cascade,
  task_id         text references tasks(id) on delete set null,
  task_name       text,                           -- kept so a deleted task still reads
  hours           numeric(8,2) not null default 0 check (hours >= 0),
  weight_snapshot numeric(6,2) not null,          -- LEDGER: weight at logging time
  created_at      timestamptz not null default now()
);
create index on entries(period_id, owner_id);

create table salaries (
  period_id text references periods(id) on delete cascade,
  owner_id  text references owners(id) on delete cascade,
  role_id   text references roles(id) on delete set null,
  gross_eur numeric(12,2) check (gross_eur is null or gross_eur >= 0),
  primary key (period_id, owner_id)
);

create table approvals (
  period_id   text references periods(id) on delete cascade,
  owner_id    text references owners(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by text references owners(id),           -- who ticked: the owner, or an admin on their behalf
  primary key (period_id, owner_id)
);

-- ---------- helpers ----------
create function my_owner_id() returns text language sql stable security definer as
$$ select id from owners where auth_uid = auth.uid() $$;

create function is_admin() returns boolean language sql stable security definer as
$$ select coalesce((select is_admin from owners where auth_uid = auth.uid()), false) $$;

create function period_is_final(p text) returns boolean language sql stable security definer as
$$ select (select count(*) from approvals where period_id = p) = (select count(*) from owners) $$;

-- Any change to a period's data wipes every approval on that period (nobody's tick
-- survives a change they didn't see) and flags it for re-approval.
create function reset_period_approvals() returns trigger language plpgsql security definer as $$
declare pid text; had boolean;
begin
  pid := coalesce(new.period_id, old.period_id);
  had := exists (select 1 from approvals where period_id = pid);
  delete from approvals where period_id = pid;
  update periods set needs_reapproval = (needs_reapproval or had), edited_by = my_owner_id(), edited_at = now() where id = pid;
  return coalesce(new, old);
end $$;
create trigger entries_reset  after insert or update or delete on entries  for each row execute function reset_period_approvals();
create trigger salaries_reset after insert or update or delete on salaries for each row execute function reset_period_approvals();

-- When the last owner approves, clear the flag.
create function clear_reapproval_when_complete() returns trigger language plpgsql security definer as $$
begin
  if period_is_final(new.period_id) then update periods set needs_reapproval = false where id = new.period_id; end if;
  return new;
end $$;
create trigger approvals_complete after insert on approvals for each row execute function clear_reapproval_when_complete();

-- ---------- RLS ----------
alter table owners enable row level security;         alter table roles enable row level security;
alter table salary_tables enable row level security;  alter table salary_rates enable row level security;
alter table task_groups enable row level security;    alter table task_categories enable row level security;
alter table tasks enable row level security;          alter table periods enable row level security;
alter table entries enable row level security;        alter table salaries enable row level security;
alter table approvals enable row level security;

-- everyone signed in can read everything
do $$ declare t text; begin
  foreach t in array array['owners','roles','salary_tables','salary_rates','task_groups','task_categories','tasks','periods','entries','salaries','approvals'] loop
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
  end loop; end $$;

-- master data + periods: admins only
do $$ declare t text; begin
  foreach t in array array['owners','roles','salary_tables','salary_rates','task_groups','task_categories','tasks','periods'] loop
    execute format('create policy %I_admin_write on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop; end $$;

-- own card only, and only while the period is not finalised (admins may also edit)
create policy entries_own  on entries  for all to authenticated
  using      ((owner_id = my_owner_id() or is_admin()) and not period_is_final(period_id))
  with check ((owner_id = my_owner_id() or is_admin()) and not period_is_final(period_id));
create policy salaries_own on salaries for all to authenticated
  using      ((owner_id = my_owner_id() or is_admin()) and not period_is_final(period_id))
  with check ((owner_id = my_owner_id() or is_admin()) and not period_is_final(period_id));

-- approvals: your own tick, or an admin on anybody's behalf; admins may clear any (reopen)
create policy approvals_own_ins on approvals for insert to authenticated with check (owner_id = my_owner_id() or is_admin());
create function default_approved_by() returns trigger language plpgsql security definer as $$
begin if new.approved_by is null then new.approved_by := coalesce(my_owner_id(), new.owner_id); end if; return new; end $$;
create trigger approvals_by before insert on approvals for each row execute function default_approved_by();
create policy approvals_own_del on approvals for delete to authenticated using (owner_id = my_owner_id() or is_admin());

-- ---------- RPC: auth users for the admin "Owners ↔ users" panel (admin-only, security definer) ----------
create or replace function list_auth_users() returns table(id uuid, email text)
language sql stable security definer set search_path = public as
$$ select u.id, u.email::text from auth.users u where is_admin() order by u.email $$;
revoke all on function list_auth_users() from public;
grant execute on function list_auth_users() to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table periods, entries, salaries, approvals, owners, salary_tables, salary_rates, tasks;

-- ============================================================================
-- SEED
-- ============================================================================
insert into owners(id,name,baseline_pct,sort_last,is_admin) values
 ('jal','JAL',16.67,false,true),   -- Attila (admin)
 ('ka','KÁ',16.67,false,true),     -- Kenéz Ági (admin)
 ('kd','KD',16.67,false,false),
 ('kb','KB',16.66,false,false),
 ('szb','SZB',16.67,false,false),
 ('vi','VI',16.66,false,false),
 ('hb','HB',0,true,false);

insert into roles(id,name) values ('ceo','CEO'),('coo','COO'),('cso','CSO'),('civ','Civil engineer'),('it','IT engineer');
insert into salary_tables(effective_from,fx_huf_eur) values ('2025-12-01',400);
insert into salary_rates(table_id,role_id,gross_huf)
  select id, r.role_id, r.huf from salary_tables, (values ('ceo',3000000),('coo',2500000),('cso',2500000),('civ',2000000),('it',2000000)) as r(role_id,huf);

insert into periods(id,kind,ym,label) values ('ip','ip',null,'Intellectual property'),('incub','incubation',null,'Incubation programs');
insert into periods(id,kind,ym,label)
  select 'm'||to_char(d,'YYYYMM'),'month',to_char(d,'YYYY-MM'),to_char(d,'FMMonth YYYY')
  from generate_series('2025-12-01'::date,'2026-09-01'::date,'1 month') d;

-- task catalog (2 groups, 12 categories, 62 tasks, total weight 356)
insert into task_groups(id,name) values ('biz','Business-as-usual operations');
insert into task_categories(id,group_id,code,name) values ('B1','biz','B1','Sales / business development / acquisition (B2G + B2B + international)');
insert into tasks(id,category_id,name,weight) values ('B1s1','B1','New public-sector client acquisition (road/bridge authority, e.g. Magyar Közút, MÁV) — signed framework/contract',10);
insert into tasks(id,category_id,name,weight) values ('B1s2','B1','Winning the first client in a new international market (foreign bridge-management authority)',10);
insert into tasks(id,category_id,name,weight) values ('B1s3','B1','B2B partner agreement (engineering firm, contractor, sensor manufacturer) — sales channel',6);
insert into tasks(id,category_id,name,weight) values ('B1s4','B1','Converting a pilot/PoC into a paid engagement',7);
insert into tasks(id,category_id,name,weight) values ('B1s5','B1','Securing a framework agreement / DPS / public-procurement qualification',6);
insert into tasks(id,category_id,name,weight) values ('B1s6','B1','Key-account relationship management, upsell (multiple bridges at the same operator)',5);
insert into tasks(id,category_id,name,weight) values ('B1s7','B1','Tendering / bid writing for public procurement (technical + price)',5);
insert into tasks(id,category_id,name,weight) values ('B1s8','B1','Channeling the industry / professional network (referrals)',4);
insert into task_categories(id,group_id,code,name) values ('B2','biz','B2','Grants / non-dilutive funding');
insert into tasks(id,category_id,name,weight) values ('B2s1','B2','Writing and winning domestic R&D grants (NKFIH, KFI, GINOP-successor)',8);
insert into tasks(id,category_id,name,weight) values ('B2s2','B2','Writing and winning EU grants (Horizon Europe, EIC Accelerator)',9);
insert into tasks(id,category_id,name,weight) values ('B2s3','B2','Organizing consortium partners for a grant (BME, industry partner)',5);
insert into tasks(id,category_id,name,weight) values ('B2s4','B2','Managing grant accounting, reporting and audit compliance',4);
insert into tasks(id,category_id,name,weight) values ('B2s5','B2','Coordinating grant writers / consultants, building the grant pipeline',3);
insert into task_categories(id,group_id,code,name) values ('B3','biz','B3','Investor preparation / fundraising');
insert into tasks(id,category_id,name,weight) values ('B3s1','B3','Assembling the pitch deck and equity story',6);
insert into tasks(id,category_id,name,weight) values ('B3s2','B3','Building and updating the financial model / business plan',6);
insert into tasks(id,category_id,name,weight) values ('B3s3','B3','Compiling data-room / due-diligence materials (IP, legal, financial)',6);
insert into tasks(id,category_id,name,weight) values ('B3s4','B3','Preparing the cap table and valuation, negotiating the term sheet',7);
insert into tasks(id,category_id,name,weight) values ('B3s5','B3','Investor relationship building, roadshow, bringing an investor on board',9);
insert into tasks(id,category_id,name,weight) values ('B3s6','B3','Investor-side reporting, board materials',4);
insert into task_categories(id,group_id,code,name) values ('B4','biz','B4','Core technology / IP development (product core, not project-specific)');
insert into tasks(id,category_id,name,weight) values ('B4s1','B4','General B-WIM algorithm development, accuracy optimization (product level)',9);
insert into tasks(id,category_id,name,weight) values ('B4s2','B4','RTS-DT digital-twin platform / architecture development',9);
insert into tasks(id,category_id,name,weight) values ('B4s3','B4','General FEM / structural model library, validation framework',7);
insert into tasks(id,category_id,name,weight) values ('B4s4','B4','AI/ML model family, retraining pipeline (product level)',8);
insert into tasks(id,category_id,name,weight) values ('B4s5','B4','Sensor / measurement hardware development, specification (patentable element)',7);
insert into tasks(id,category_id,name,weight) values ('B4s6','B4','Software platform / web application / database infrastructure (core)',7);
insert into tasks(id,category_id,name,weight) values ('B4s7','B4','Scalable data pipeline and data-quality system',6);
insert into tasks(id,category_id,name,weight) values ('B4s8','B4','Product roadmap, architecture decisions, technical vision',5);
insert into task_categories(id,group_id,code,name) values ('B5','biz','B5','Operations / management / compliance');
insert into tasks(id,category_id,name,weight) values ('B5s1','B5','Company leadership, executive duties, team coordination',6);
insert into tasks(id,category_id,name,weight) values ('B5s2','B5','Finance / controlling / cash-flow management',5);
insert into tasks(id,category_id,name,weight) values ('B5s3','B5','SOPs, quality system, delivery processes',3);
insert into tasks(id,category_id,name,weight) values ('B5s4','B5','GDPR / data handling / information security (critical-infrastructure data)',4);
insert into tasks(id,category_id,name,weight) values ('B5s5','B5','Public-procurement and contractual compliance, legal coordination',4);
insert into tasks(id,category_id,name,weight) values ('B5s6','B5','HR / recruitment / hiring key staff (e.g. formalizing sales)',4);
insert into tasks(id,category_id,name,weight) values ('B5s7','B5','Supplier and asset management (sensors, hardware procurement)',3);
insert into task_categories(id,group_id,code,name) values ('B6','biz','B6','Marketing / brand / scientific reach');
insert into tasks(id,category_id,name,weight) values ('B6s1','B6','Scientific publication, conference presentation (credibility, lead generation)',4);
insert into tasks(id,category_id,name,weight) values ('B6s2','B6','Industry / regulatory relationship building, organizing professional events',4);
insert into tasks(id,category_id,name,weight) values ('B6s3','B6','Website, case studies, reference materials',3);
insert into tasks(id,category_id,name,weight) values ('B6s4','B6','PR, press, social media, brand building',2);
insert into tasks(id,category_id,name,weight) values ('B6s5','B6','Maintaining the BME / university relationship as a reputation and talent channel',3);
insert into task_categories(id,group_id,code,name) values ('B7','biz','B7','BME-IP & legal foundations (investment readiness)');
insert into tasks(id,category_id,name,weight) values ('B7s1','B7','Settling the BME-IP chain (assignment / exclusive license / spin-off) — signed agreement',9);
insert into tasks(id,category_id,name,weight) values ('B7s2','B7','Delineating background vs. foreground IP, copyright assignment from members',6);
insert into tasks(id,category_id,name,weight) values ('B7s3','B7','Trade-secret / know-how protection system (for the core algorithm)',5);
insert into tasks(id,category_id,name,weight) values ('B7s4','B7','Patenting the sensor/hardware element (where infringement is detectable)',5);
insert into tasks(id,category_id,name,weight) values ('B7s5','B7','Preparing the articles of association + syndicate agreement (milestones)',6);
insert into task_groups(id,name) values ('proj','Projects');
insert into task_categories(id,group_id,code,name) values ('P1','proj','P1','Project preparation & site');
insert into tasks(id,category_id,name,weight) values ('P1s1','P1','Site survey, bridge condition assessment, measurement plan',6);
insert into tasks(id,category_id,name,weight) values ('P1s2','P1','Bridge preparation: sensor placement plan, installation concept',6);
insert into tasks(id,category_id,name,weight) values ('P1s3','P1','Permitting, bridge-operator coordination, traffic management for installation',4);
insert into task_categories(id,group_id,code,name) values ('P2','proj','P2','Installation & data collection');
insert into tasks(id,category_id,name,weight) values ('P2s1','P2','Physical installation and commissioning of sensors on the bridge',7);
insert into tasks(id,category_id,name,weight) values ('P2s2','P2','Calibration measurement campaign (reference vehicle, load testing)',6);
insert into tasks(id,category_id,name,weight) values ('P2s3','P2','Setting up continuous data collection, remote data link',4);
insert into task_categories(id,group_id,code,name) values ('P3','proj','P3','Data & modeling (project-specific)');
insert into tasks(id,category_id,name,weight) values ('P3s1','P3','Building the bridge-specific database (historical + live data)',6);
insert into tasks(id,category_id,name,weight) values ('P3s2','P3','Building the bridge-specific FEM / structural model',8);
insert into tasks(id,category_id,name,weight) values ('P3s3','P3','Setting up the RTS-DT digital twin for the given bridge, integration',8);
insert into tasks(id,category_id,name,weight) values ('P3s4','P3','Training and calibrating the AI / B-WIM model on the bridge data',8);
insert into tasks(id,category_id,name,weight) values ('P3s5','P3','Model validation, accuracy verification in front of the client',6);
insert into task_categories(id,group_id,code,name) values ('P4','proj','P4','Delivery & client');
insert into tasks(id,category_id,name,weight) values ('P4s1','P4','Software integration, client-dashboard customization',5);
insert into tasks(id,category_id,name,weight) values ('P4s2','P4','Structural evaluation report / expert opinion for the client',6);
insert into tasks(id,category_id,name,weight) values ('P4s3','P4','Handover, client-side training',4);
insert into tasks(id,category_id,name,weight) values ('P4s4','P4','Project management, client relationship during the project',5);
insert into task_categories(id,group_id,code,name) values ('P5','proj','P5','Operations (recurring)');
insert into tasks(id,category_id,name,weight) values ('P5s1','P5','Continuous monitoring, alert handling, SLA fulfillment',5);
insert into tasks(id,category_id,name,weight) values ('P5s2','P5','Maintenance, sensor replacement, model recalibration',4);
insert into tasks(id,category_id,name,weight) values ('P5s3','P5','Periodic reporting, client review, contract-renewal preparation',4);
-- ---------- after creating the 7 users in Auth → Users, link them: ----------
-- update owners set auth_uid = (select id from auth.users where email='...') where id='jal';
-- (repeat per owner; the kickoff prompt makes Claude Code add an admin UI for this too)

-- ============================================================================
-- MIGRATION for a project where the schema above was already applied (safe to
-- re-run, keeps all data). Paste just this block into the SQL Editor:
--   1. the approval-reset trigger only flags "re-approval needed" when approvals existed
--   2. list_auth_users() — used by the admin "Owners ↔ users" panel
-- ============================================================================
create or replace function reset_period_approvals() returns trigger language plpgsql security definer as $$
declare pid text; had boolean;
begin
  pid := coalesce(new.period_id, old.period_id);
  had := exists (select 1 from approvals where period_id = pid);
  delete from approvals where period_id = pid;
  update periods set needs_reapproval = (needs_reapproval or had), edited_by = my_owner_id(), edited_at = now() where id = pid;
  return coalesce(new, old);
end $$;
create or replace function list_auth_users() returns table(id uuid, email text)
language sql stable security definer set search_path = public as
$$ select u.id, u.email::text from auth.users u where is_admin() order by u.email $$;
revoke all on function list_auth_users() from public;
grant execute on function list_auth_users() to authenticated;

-- ---- approvals on behalf (admin) ----
alter table approvals add column if not exists approved_by text references owners(id);
update approvals set approved_by = owner_id where approved_by is null;
create or replace function default_approved_by() returns trigger language plpgsql security definer as $$
begin if new.approved_by is null then new.approved_by := coalesce(my_owner_id(), new.owner_id); end if; return new; end $$;
drop trigger if exists approvals_by on approvals;
create trigger approvals_by before insert on approvals for each row execute function default_approved_by();
drop policy if exists approvals_own_ins on approvals;
create policy approvals_own_ins on approvals for insert to authenticated with check (owner_id = my_owner_id() or is_admin());
