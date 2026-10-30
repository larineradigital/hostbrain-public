-- The AI-alone comparison per guide, and hotel self-serve. Guests never read these tables
-- directly: guest routes check the token in server code and use the service role.

create table if not exists public.comparisons (
  guide_id uuid primary key references public.guides on delete cascade,
  -- [{name, status: 'verified' | 'not_found', entity_id, qloo_name, distance_m}]: names are
  -- what the model said with no Qloo data; entity_id is only the Qloo /search match, if any.
  ai_alone jsonb not null,
  summary jsonb not null,            -- metrics at generation time (lib/guide/compare.ts)
  -- What the model was told about the guest: party type, age band, taste picks. No name.
  guest_description text not null check (char_length(guest_description) <= 1000),
  model text,
  generated_at timestamptz not null default now()
);

alter table public.comparisons enable row level security;

drop policy if exists "comparisons: own guide" on public.comparisons;
create policy "comparisons: own guide" on public.comparisons
  for all to authenticated
  using (public.owns_guide(guide_id))
  with check (public.owns_guide(guide_id));

-- Self-serve tokens are nanoid(21) like guide tokens: /s/[token].
do $$ begin
  alter table public.properties
    add constraint properties_self_serve_token_format
    check (self_serve_token is null or self_serve_token ~ '^[A-Za-z0-9_-]{21}$');
exception when duplicate_object then null;
end $$;

-- The self-serve rate limit counts a property's recent self-serve guides.
create index if not exists guides_property_source_created_idx
  on public.guides (property_id, source, created_at desc);
