-- Guides, quiz answers, generated sections and heatmaps.
-- RLS: a host reads and writes rows that belong to their own properties. Guests never use
-- these policies; guest routes check the guide token in server code and use the service role.

do $$ begin
  create type public.party_type as enum ('solo', 'couple', 'family', 'friends', 'business');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.guide_status as enum ('awaiting_quiz', 'generating', 'ready', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.section_kind as enum
    ('eat', 'drink', 'do', 'rainy', 'host_picks', 'playlist', 'films', 'shows');
exception when duplicate_object then null;
end $$;

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{21}$'),  -- nanoid(21): /g/[token]
  guest_first_name text check (char_length(guest_first_name) <= 60), -- never sent to Qloo or the LLM
  party_type public.party_type not null default 'couple',
  age_band text,                                                     -- Qloo bucket or null
  language text not null default 'en',
  check_in date,
  check_out date,
  source text not null default 'host' check (source in ('host', 'self_serve', 'demo')),
  status public.guide_status not null default 'awaiting_quiz',
  hero_line text check (char_length(hero_line) <= 120),             -- written by the LLM
  generation_started_at timestamptz,                                 -- claim for one run at a time
  generation_error text,
  viewed_at timestamptz,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  check (check_out is null or check_in is null or check_out >= check_in)
);

create index if not exists guides_property_created_idx
  on public.guides (property_id, created_at desc);

create table if not exists public.quiz_answers (
  guide_id uuid primary key references public.guides on delete cascade,
  artist_ids text[] not null default '{}',
  artist_names text[] not null default '{}',
  media_ids text[] not null default '{}',        -- movies + tv shows
  media_names text[] not null default '{}',
  tag_urns text[] not null default '{}',         -- cuisines, vibes
  tag_labels text[] not null default '{}',
  dietary text[] not null default '{}',          -- vegetarian, vegan, halal, gluten_free
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  check (cardinality(artist_ids) <= 5 and cardinality(media_ids) <= 5),
  check (cardinality(artist_ids) = cardinality(artist_names)),
  check (cardinality(media_ids) = cardinality(media_names)),
  check (cardinality(tag_urns) <= 30 and cardinality(dietary) <= 4)
);

create table if not exists public.guide_sections (
  guide_id uuid not null references public.guides on delete cascade,
  section public.section_kind not null,
  intro text,                    -- one line, written by Claude
  items jsonb not null,          -- GuideItem[] (lib/guide/types.ts)
  qloo_request jsonb,            -- params used (no key)
  generated_at timestamptz not null default now(),
  primary key (guide_id, section)
);

create table if not exists public.heatmaps (
  guide_id uuid primary key references public.guides on delete cascade,
  cells jsonb not null,          -- [{lat, lng, affinity}]
  generated_at timestamptz not null default now()
);

-- Row-level security
alter table public.guides enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.guide_sections enable row level security;
alter table public.heatmaps enable row level security;

drop policy if exists "guides: own property" on public.guides;
create policy "guides: own property" on public.guides
  for all to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ));

-- Child tables: the guide must belong to one of the host's properties.
create or replace function public.owns_guide(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.guides g
    join public.properties p on p.id = g.property_id
    where g.id = target and p.host_id = (select auth.uid())
  );
$$;

drop policy if exists "quiz_answers: own guide" on public.quiz_answers;
create policy "quiz_answers: own guide" on public.quiz_answers
  for all to authenticated
  using (public.owns_guide(guide_id))
  with check (public.owns_guide(guide_id));

drop policy if exists "guide_sections: own guide" on public.guide_sections;
create policy "guide_sections: own guide" on public.guide_sections
  for all to authenticated
  using (public.owns_guide(guide_id))
  with check (public.owns_guide(guide_id));

drop policy if exists "heatmaps: own guide" on public.heatmaps;
create policy "heatmaps: own guide" on public.heatmaps
  for all to authenticated
  using (public.owns_guide(guide_id))
  with check (public.owns_guide(guide_id));
