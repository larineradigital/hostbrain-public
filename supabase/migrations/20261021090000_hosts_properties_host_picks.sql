-- Hosts, properties, host picks.
-- RLS: a host reads and writes only their own rows. Guest routes never use these
-- policies; they go through server code with the service role after a token check.

create table if not exists public.hosts (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  business_name text,
  created_at timestamptz not null default now()
);

do $$ begin
  create type public.property_type as enum ('apartment', 'house', 'villa', 'hotel');
exception when duplicate_object then null;
end $$;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  type public.property_type not null default 'apartment',
  address text not null check (char_length(address) between 1 and 300),
  city text not null check (char_length(city) between 1 and 120),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  description text check (char_length(description) <= 2000),
  house_notes text check (char_length(house_notes) <= 2000),   -- wifi, check-out; guide footer
  photo_url text,
  self_serve_token text unique,                                -- hotels: QR entry /s/[token]
  self_serve_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists properties_host_id_idx on public.properties (host_id);

create table if not exists public.host_picks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties on delete cascade,
  qloo_entity_id text not null,
  name text not null,
  address text,                                                -- from Qloo, shown to confirm the venue
  note text check (char_length(note) <= 280),                 -- host's personal note
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (property_id, qloo_entity_id)
);

create index if not exists host_picks_property_idx on public.host_picks (property_id, position);

-- At most 10 picks per property.
create or replace function public.enforce_host_pick_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.host_picks where property_id = new.property_id) >= 10 then
    raise exception 'A property can have at most 10 host picks' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists host_picks_limit on public.host_picks;
create trigger host_picks_limit
  before insert on public.host_picks
  for each row execute function public.enforce_host_pick_limit();

-- Every new auth user gets a host profile row.
create or replace function public.handle_new_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hosts (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_host();

-- Row-level security
alter table public.hosts enable row level security;
alter table public.properties enable row level security;
alter table public.host_picks enable row level security;

drop policy if exists "hosts: own row" on public.hosts;
create policy "hosts: own row" on public.hosts
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "properties: own" on public.properties;
create policy "properties: own" on public.properties
  for all to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

drop policy if exists "host_picks: own property" on public.host_picks;
create policy "host_picks: own property" on public.host_picks
  for all to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = host_picks.property_id and p.host_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.properties p
    where p.id = host_picks.property_id and p.host_id = (select auth.uid())
  ));
