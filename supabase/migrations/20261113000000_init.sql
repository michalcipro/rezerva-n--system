-- Rezervační systém – schéma pro ostrý provoz (Supabase / Postgres 15+).
--
-- Stav kliniky je uložený po částech (state_chunks) ve stejném rozdělení jako v testovací verzi
-- (meta, klienti po 200, rezervace po ISO týdnech, platby po měsících…). Pravidla počítá server
-- stejným enginem jako aplikace; databáze hlídá jen verzi stavu (žádné souběžné přepsání).
--
-- Bezpečnost: tabulky jsou ve schématu `app`, které není vystavené přes veřejné REST API, mají zapnutou
-- ochranu řádků bez jakýchkoli politik pro anon/authenticated a role anon/authenticated k nim nemají
-- práva. Data čte a zapisuje jen server (role service_role) přes funkce public.app_* níže.

create schema if not exists app;

create table app.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- verze stavu kliniky; zvyšuje se při každém zápisu
  version bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Personál kliniky (uživatelé Supabase Auth).
create table app.members (
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'reception', 'therapist')),
  -- u terapeuta jeho záznam v katalogu (Therapist.id)
  therapist_id text,
  display_name text not null default '',
  -- přihlašovací e-mail (jen pro přehled přístupů; přihlášení řeší Supabase Auth)
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index members_user_idx on app.members (user_id);

-- Klientský účet (uživatel Supabase Auth) ↔ klient v kartotéce kliniky (Client.id).
create table app.client_accounts (
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  user_id uuid not null,
  client_id text not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id),
  unique (clinic_id, client_id)
);
create index client_accounts_user_idx on app.client_accounts (user_id);

-- Stav kliniky po částech. data = null znamená smazanou část.
create table app.state_chunks (
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  key text not null,
  data jsonb,
  version bigint not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);
create index state_chunks_version_idx on app.state_chunks (clinic_id, version);

-- Provedené příkazy podle ID z prohlížeče: opakované odeslání (výpadek sítě) se neprovede dvakrát.
create table app.applied_commands (
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  command_id text not null,
  version bigint not null,
  at timestamptz not null default now(),
  primary key (clinic_id, command_id)
);
create index applied_commands_at_idx on app.applied_commands (at);

-- Kdo kdy jaký příkaz spustil (bez vstupních dat – žádné osobní údaje navíc).
create table app.command_log (
  id bigserial primary key,
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  at timestamptz not null default now(),
  user_id uuid,
  role text not null,
  command text not null,
  ok boolean not null,
  error text,
  version bigint
);
create index command_log_clinic_idx on app.command_log (clinic_id, at desc);

-- Ochrana řádků: zapnutá všude, žádné politiky pro anon/authenticated = žádný přístup.
alter table app.clinics enable row level security;
alter table app.members enable row level security;
alter table app.client_accounts enable row level security;
alter table app.state_chunks enable row level security;
alter table app.command_log enable row level security;
alter table app.applied_commands enable row level security;

revoke all on schema app from public;
revoke all on all tables in schema app from public;
revoke all on all sequences in schema app from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
    execute 'revoke all on all tables in schema app from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema app from authenticated';
    execute 'revoke all on all tables in schema app from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funkce pro server (jen service_role)
-- ---------------------------------------------------------------------------

-- Části stavu změněné po verzi p_since (0 = všechny) a aktuální verze.
create or replace function public.app_get_chunks(p_clinic uuid, p_since bigint default 0)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select jsonb_build_object(
    'version', (select c.version from app.clinics c where c.id = p_clinic),
    'chunks', coalesce(
      (select jsonb_agg(jsonb_build_object('key', s.key, 'data', s.data, 'version', s.version) order by s.key)
         from app.state_chunks s
        where s.clinic_id = p_clinic and s.version > p_since),
      '[]'::jsonb)
  );
$$;

-- Zapíše změněné části, jen když se stav mezitím nezměnil (porovnání a výměna verze).
-- p_changes = [{ "key": "bookings/2026-W46", "data": [...] | null }, ...]
-- p_command_id: ID příkazu z prohlížeče – stejný příkaz se zapíše nejvýš jednou.
create or replace function public.app_apply_changes(p_clinic uuid, p_expected bigint, p_changes jsonb, p_command_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_new bigint;
begin
  if p_command_id is not null and exists (
    select 1 from app.applied_commands where clinic_id = p_clinic and command_id = p_command_id
  ) then
    return jsonb_build_object('ok', false, 'duplicate', true, 'version', (select version from app.clinics where id = p_clinic));
  end if;
  update app.clinics set version = version + 1
   where id = p_clinic and version = p_expected
  returning version into v_new;
  if v_new is null then
    return jsonb_build_object('ok', false, 'version', (select version from app.clinics where id = p_clinic));
  end if;
  if p_command_id is not null then
    insert into app.applied_commands (clinic_id, command_id, version) values (p_clinic, p_command_id, v_new);
  end if;
  insert into app.state_chunks (clinic_id, key, data, version, updated_at)
  select p_clinic,
         c->>'key',
         case when jsonb_typeof(c->'data') = 'null' then null else c->'data' end,
         v_new,
         now()
    from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) as c
  on conflict (clinic_id, key) do update
     set data = excluded.data, version = excluded.version, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'version', v_new);
end;
$$;

-- Verze, ve které se příkaz zapsal (null = zatím neproběhl). Pro opakované odeslání po výpadku sítě.
create or replace function public.app_command_applied(p_clinic uuid, p_command_id text)
returns bigint
language sql
stable
security definer
set search_path = app, public
as $$
  select version from app.applied_commands where clinic_id = p_clinic and command_id = p_command_id;
$$;

-- Údržba: zapomene ID příkazů starší 30 dnů a log příkazů starší 13 měsíců.
create or replace function public.app_maintenance()
returns void
language sql
security definer
set search_path = app, public
as $$
  delete from app.applied_commands where at < now() - interval '30 days';
  delete from app.command_log where at < now() - interval '13 months';
$$;

-- Role přihlášeného uživatele: členství v personálu a klientské účty.
create or replace function public.app_whoami(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'clinicId', m.clinic_id, 'role', m.role, 'therapistId', m.therapist_id, 'displayName', m.display_name))
      from app.members m where m.user_id = p_user), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('clinicId', a.clinic_id, 'clientId', a.client_id))
      from app.client_accounts a where a.user_id = p_user), '[]'::jsonb)
  );
$$;

-- Založí kliniku s prvním stavem a majitelem (spouští se jednou při zprovoznění).
create or replace function public.app_create_clinic(p_name text, p_owner uuid, p_owner_name text, p_chunks jsonb, p_owner_email text default '')
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id uuid;
begin
  insert into app.clinics (name, version) values (p_name, 1) returning id into v_id;
  insert into app.members (clinic_id, user_id, role, display_name, email)
  values (v_id, p_owner, 'owner', coalesce(p_owner_name, ''), lower(coalesce(p_owner_email, '')));
  insert into app.state_chunks (clinic_id, key, data, version)
  select v_id, c->>'key', c->'data', 1 from jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb)) as c;
  return v_id;
end;
$$;

-- Přidá nebo upraví člena personálu.
create or replace function public.app_upsert_member(p_clinic uuid, p_user uuid, p_role text, p_therapist text, p_name text, p_email text default '')
returns void
language sql
security definer
set search_path = app, public
as $$
  insert into app.members (clinic_id, user_id, role, therapist_id, display_name, email)
  values (p_clinic, p_user, p_role, p_therapist, coalesce(p_name, ''), lower(coalesce(p_email, '')))
  on conflict (clinic_id, user_id) do update
     set role = excluded.role, therapist_id = excluded.therapist_id, display_name = excluded.display_name,
         email = case when excluded.email = '' then app.members.email else excluded.email end;
$$;

create or replace function public.app_remove_member(p_clinic uuid, p_user uuid)
returns void
language sql
security definer
set search_path = app, public
as $$
  delete from app.members where clinic_id = p_clinic and user_id = p_user;
$$;

-- Seznam personálu kliniky (pro správu přístupů).
create or replace function public.app_list_members(p_clinic uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', m.user_id, 'role', m.role, 'therapistId', m.therapist_id, 'displayName', m.display_name, 'email', m.email)
      order by m.created_at), '[]'::jsonb)
    from app.members m where m.clinic_id = p_clinic;
$$;

-- Seznam klinik (zprovoznění a noční automatika).
create or replace function public.app_list_clinics()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'version', c.version) order by c.created_at), '[]'::jsonb)
    from app.clinics c;
$$;

-- ID uživatele Supabase Auth podle e-mailu (přidání personálu bez pozvánek).
-- plpgsql: tělo se ověřuje až při volání, takže migrace projde i bez schématu auth (lokální testy).
create or replace function public.app_user_id_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(p_email) order by u.created_at limit 1;
  return v_id;
end;
$$;

-- Propojí klientský účet s klientem v kartotéce.
create or replace function public.app_link_client(p_clinic uuid, p_user uuid, p_client text)
returns void
language sql
security definer
set search_path = app, public
as $$
  insert into app.client_accounts (clinic_id, user_id, client_id) values (p_clinic, p_user, p_client)
  on conflict (clinic_id, user_id) do update set client_id = excluded.client_id;
$$;

-- Zruší propojení účtu s klientem (výmaz / anonymizace klienta).
create or replace function public.app_unlink_client(p_clinic uuid, p_client text)
returns void
language sql
security definer
set search_path = app, public
as $$
  delete from app.client_accounts where clinic_id = p_clinic and client_id = p_client;
$$;

-- Záznam o spuštěném příkazu.
create or replace function public.app_log_command(
  p_clinic uuid, p_user uuid, p_role text, p_command text, p_ok boolean, p_error text, p_version bigint)
returns void
language sql
security definer
set search_path = app, public
as $$
  insert into app.command_log (clinic_id, user_id, role, command, ok, error, version)
  values (p_clinic, p_user, p_role, p_command, p_ok, left(p_error, 500), p_version);
$$;

-- Funkce smí spouštět jen server.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_get_chunks(uuid, bigint)',
    'public.app_apply_changes(uuid, bigint, jsonb, text)',
    'public.app_command_applied(uuid, text)',
    'public.app_maintenance()',
    'public.app_whoami(uuid)',
    'public.app_create_clinic(text, uuid, text, jsonb, text)',
    'public.app_upsert_member(uuid, uuid, text, text, text, text)',
    'public.app_remove_member(uuid, uuid)',
    'public.app_list_members(uuid)',
    'public.app_list_clinics()',
    'public.app_user_id_by_email(text)',
    'public.app_link_client(uuid, uuid, text)',
    'public.app_unlink_client(uuid, text)',
    'public.app_log_command(uuid, uuid, text, text, boolean, text, bigint)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
