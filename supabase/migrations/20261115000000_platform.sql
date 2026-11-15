-- Univerzální platforma: více provozoven v jedné instalaci, licence, adresy a tajné údaje provozoven.
--
-- Provozovna (klinika, studio, salon…) = řádek v app.clinics. Klienti a personál vidí jen svou provozovnu;
-- server ji pozná podle adresy (/<slug>, vlastní doména). Licence (plán, platnost, stav) hlídá server.

-- Krátký identifikátor do adresy (např. /fyzio-centrum). Starší řádky dostanou náhodný.
alter table app.clinics add column slug text;
update app.clinics set slug = 'p-' || substr(md5(id::text || random()::text), 1, 10) where slug is null;
alter table app.clinics alter column slug set default ('p-' || substr(md5(random()::text), 1, 10));
alter table app.clinics alter column slug set not null;
alter table app.clinics add constraint clinics_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
create unique index clinics_slug_idx on app.clinics (slug);

-- Licence: plán, stav a platnost (null = bez omezení, např. doživotní licence).
alter table app.clinics add column license_plan text not null default 'trial'
  check (license_plan in ('trial', 'monthly', 'yearly', 'lifetime'));
alter table app.clinics add column license_status text not null default 'active'
  check (license_status in ('active', 'suspended', 'cancelled'));
alter table app.clinics add column license_valid_until date;
alter table app.clinics add column license_note text not null default '';

-- Vlastní domény provozoven (rezervace.klinika.cz → provozovna).
create table app.clinic_domains (
  domain text primary key check (domain ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index clinic_domains_clinic_idx on app.clinic_domains (clinic_id);

-- Tajné údaje provozovny (např. token Fio). Šifruje je server (AES-GCM, klíč mimo databázi) –
-- v databázi je jen šifrovaný text.
create table app.clinic_secrets (
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

alter table app.clinic_domains enable row level security;
alter table app.clinic_secrets enable row level security;
revoke all on all tables in schema app from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema app from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema app from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funkce pro server (jen service_role)
-- ---------------------------------------------------------------------------

-- Veřejné údaje provozovny pro server (bez osobních údajů).
create or replace function app.clinic_json(c app.clinics)
returns jsonb
language sql
stable
set search_path = app, public
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name,
    'version', c.version,
    'createdAt', c.created_at,
    'license', jsonb_build_object(
      'plan', c.license_plan,
      'status', c.license_status,
      'validUntil', c.license_valid_until,
      'note', c.license_note
    ),
    'domains', coalesce((select jsonb_agg(d.domain order by d.domain) from app.clinic_domains d where d.clinic_id = c.id), '[]'::jsonb)
  );
$$;

-- Provozovna podle adresy: krátkého identifikátoru nebo vlastní domény (null = nenalezena).
create or replace function public.app_resolve_tenant(p_slug text, p_domain text)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select app.clinic_json(c)
    from app.clinics c
   where (p_slug is not null and c.slug = lower(p_slug))
      or (p_domain is not null and c.id = (select d.clinic_id from app.clinic_domains d where d.domain = lower(p_domain)))
   order by (p_slug is not null and c.slug = lower(p_slug)) desc
   limit 1;
$$;

create or replace function public.app_clinic_info(p_clinic uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select app.clinic_json(c) from app.clinics c where c.id = p_clinic;
$$;

-- Přehled provozoven pro vlastníka platformy: licence, počet lidí v týmu, poslední změna dat.
create or replace function public.app_platform_clinics()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(app.clinic_json(c) || jsonb_build_object(
      'members', (select count(*) from app.members m where m.clinic_id = c.id),
      'clientAccounts', (select count(*) from app.client_accounts a where a.clinic_id = c.id),
      'lastChangeAt', (select max(s.updated_at) from app.state_chunks s where s.clinic_id = c.id),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.display_name))
                            from app.members m where m.clinic_id = c.id and m.role = 'owner'), '[]'::jsonb)
    ) order by c.created_at), '[]'::jsonb)
    from app.clinics c;
$$;

-- Založí provozovnu s identifikátorem a licencí (vlastník platformy).
create or replace function public.app_platform_create_clinic(
  p_name text, p_slug text, p_owner uuid, p_owner_name text, p_owner_email text, p_chunks jsonb,
  p_plan text, p_valid_until date)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id uuid;
begin
  insert into app.clinics (name, slug, version, license_plan, license_valid_until)
  values (p_name, lower(p_slug), 1, p_plan, p_valid_until)
  returning id into v_id;
  insert into app.members (clinic_id, user_id, role, display_name, email)
  values (v_id, p_owner, 'owner', coalesce(p_owner_name, ''), lower(coalesce(p_owner_email, '')));
  insert into app.state_chunks (clinic_id, key, data, version)
  select v_id, c->>'key', c->'data', 1 from jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb)) as c;
  return v_id;
end;
$$;

-- Úprava provozovny vlastníkem platformy (null = beze změny; p_clear_valid_until = platnost bez omezení).
create or replace function public.app_platform_update_clinic(
  p_clinic uuid, p_name text, p_slug text, p_plan text, p_status text, p_valid_until date,
  p_clear_valid_until boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  c app.clinics;
begin
  update app.clinics set
    name = coalesce(p_name, name),
    slug = coalesce(lower(p_slug), slug),
    license_plan = coalesce(p_plan, license_plan),
    license_status = coalesce(p_status, license_status),
    license_valid_until = case when p_clear_valid_until then null else coalesce(p_valid_until, license_valid_until) end,
    license_note = coalesce(p_note, license_note)
  where id = p_clinic
  returning * into c;
  if c.id is null then
    return null;
  end if;
  return app.clinic_json(c);
end;
$$;

-- Nastaví vlastní domény provozovny (nahradí dosavadní seznam).
create or replace function public.app_platform_set_domains(p_clinic uuid, p_domains text[])
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from app.clinic_domains where clinic_id = p_clinic;
  insert into app.clinic_domains (domain, clinic_id)
  select distinct lower(trim(d)), p_clinic from unnest(coalesce(p_domains, array[]::text[])) as d where trim(d) <> '';
end;
$$;

-- Tajný údaj provozovny (šifrovaný serverem); p_value null = smazat.
create or replace function public.app_set_clinic_secret(p_clinic uuid, p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if p_value is null then
    delete from app.clinic_secrets where clinic_id = p_clinic and key = p_key;
  else
    insert into app.clinic_secrets (clinic_id, key, value) values (p_clinic, p_key, p_value)
    on conflict (clinic_id, key) do update set value = excluded.value, updated_at = now();
  end if;
end;
$$;

create or replace function public.app_get_clinic_secrets(p_clinic uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) from app.clinic_secrets s where s.clinic_id = p_clinic;
$$;

-- Které tajné údaje provozovna má (bez hodnot) – pro konzoli vlastníka platformy.
create or replace function public.app_clinic_secret_keys(p_clinic uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'updatedAt', s.updated_at) order by s.key), '[]'::jsonb)
    from app.clinic_secrets s where s.clinic_id = p_clinic;
$$;

-- Funkce smí spouštět jen server.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_resolve_tenant(text, text)',
    'public.app_clinic_info(uuid)',
    'public.app_platform_clinics()',
    'public.app_platform_create_clinic(text, text, uuid, text, text, jsonb, text, date)',
    'public.app_platform_update_clinic(uuid, text, text, text, text, date, boolean, text)',
    'public.app_platform_set_domains(uuid, text[])',
    'public.app_set_clinic_secret(uuid, text, text)',
    'public.app_get_clinic_secrets(uuid)',
    'public.app_clinic_secret_keys(uuid)'
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

revoke all on function app.clinic_json(app.clinics) from public;
