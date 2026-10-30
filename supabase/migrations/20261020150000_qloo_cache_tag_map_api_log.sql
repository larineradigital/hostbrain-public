-- Server-only Qloo tables: response cache, tag map and call log.
-- RLS is enabled with no policies, so only the service role can read or write them.

create table if not exists public.qloo_cache (
  key text primary key,
  endpoint text not null,
  response jsonb not null,            -- Qloo response with `akas` removed; never committed to git
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists qloo_cache_expires_at_idx on public.qloo_cache (expires_at);

create table if not exists public.qloo_tag_map (   -- our chip labels -> confirmed Qloo tag URNs
  label text primary key,                          -- stable slug, e.g. natural_wine, section_eat
  kind text not null check (kind in ('section', 'cuisine', 'vibe', 'dietary')),
  display text not null,                           -- chip text shown to guests
  urns text[] not null check (cardinality(urns) > 0),
  position int not null default 0
);

create table if not exists public.api_log (
  id bigserial primary key,
  guide_id uuid,
  provider text not null check (provider in ('qloo', 'anthropic', 'photon', 'open_meteo')),
  endpoint text not null,
  params jsonb,                                    -- sanitized: allow-listed params only, never keys
  status int,
  latency_ms int,
  cache_hit boolean not null default false,
  mode text,                                       -- qloo: live | mock | replay
  attempts int,                                    -- HTTP attempts including retries
  month_remaining int,                             -- x-month-ratelimit-remaining from Qloo
  error text,
  created_at timestamptz not null default now()
);

create index if not exists api_log_guide_id_idx on public.api_log (guide_id);
create index if not exists api_log_created_at_idx on public.api_log (created_at desc);

alter table public.qloo_cache enable row level security;
alter table public.qloo_tag_map enable row level security;
alter table public.api_log enable row level security;
