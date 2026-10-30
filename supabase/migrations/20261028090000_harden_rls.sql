-- Security review: tighten what a signed-in host may write with their own session.
--
-- 1. Generated rows (sections, heatmaps, quiz answers, chats, comparisons) are written only by
--    server code with the service role, after its own checks. Hosts may read them, nothing more,
--    so a host can't put a non-Qloo item into a guide through the REST API.
-- 2. Hosts can't delete their host row, properties or guides (no UI does; a host-row delete
--    would cascade). Guide columns that server code owns (status, demo_key, generation fields)
--    and properties.demo_key aren't writable by hosts.
-- 3. DEMO_MODE lets anyone sign in as the shared demo host, so the seeded demo rows (demo_key
--    set) and their host picks are read-only for hosts. Self-serve can still be switched on the
--    demo hotel; new properties, picks and guides work as usual. scripts/seed-demo.ts uses the
--    service role and is unaffected.

-- 1. Read-only child tables
do $$
declare
  t text;
begin
  foreach t in array array['quiz_answers', 'guide_sections', 'heatmaps', 'chat_messages', 'comparisons'] loop
    execute format('drop policy if exists "%1$s: own guide" on public.%1$I', t);
    execute format(
      'create policy "%1$s: own guide" on public.%1$I for select to authenticated using (public.owns_guide(guide_id))',
      t
    );
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 2a. hosts: read and rename your own row; the sign-up trigger creates it.
drop policy if exists "hosts: own row" on public.hosts;
create policy "hosts: own row" on public.hosts
  for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "hosts: update own row" on public.hosts;
create policy "hosts: update own row" on public.hosts
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke insert, delete on public.hosts from anon, authenticated;
revoke update on public.hosts from anon, authenticated;
grant update (display_name, business_name) on public.hosts to authenticated;

-- 2b. properties: no deletes, no demo_key.
drop policy if exists "properties: own" on public.properties;
create policy "properties: own" on public.properties
  for select to authenticated
  using (host_id = (select auth.uid()));
drop policy if exists "properties: insert own" on public.properties;
create policy "properties: insert own" on public.properties
  for insert to authenticated
  with check (host_id = (select auth.uid()));
drop policy if exists "properties: update own" on public.properties;
create policy "properties: update own" on public.properties
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));
revoke insert, update, delete on public.properties from anon, authenticated;
grant insert (host_id, name, type, address, city, country_code, lat, lng, description, house_notes,
              photo_url, self_serve_token, self_serve_enabled)
  on public.properties to authenticated;
grant update (name, type, address, city, country_code, lat, lng, description, house_notes,
              photo_url, self_serve_token, self_serve_enabled)
  on public.properties to authenticated;

-- 2c. guides: hosts create guides and edit the stay; the pipeline owns the rest.
drop policy if exists "guides: own property" on public.guides;
create policy "guides: own property" on public.guides
  for select to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ));
drop policy if exists "guides: insert own property" on public.guides;
create policy "guides: insert own property" on public.guides
  for insert to authenticated
  with check (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ));
drop policy if exists "guides: update own property" on public.guides;
create policy "guides: update own property" on public.guides
  for update to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.properties p
    where p.id = guides.property_id and p.host_id = (select auth.uid())
  ));
revoke insert, update, delete on public.guides from anon, authenticated;
grant insert (property_id, token, guest_first_name, party_type, age_band, language, check_in,
              check_out, source)
  on public.guides to authenticated;
grant update (guest_first_name, party_type, age_band, language, check_in, check_out)
  on public.guides to authenticated;

-- 3. Seeded demo rows are read-only for hosts (the shared demo login).
create or replace function public.protect_demo_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  demo boolean;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'properties' then
    -- Switching self-serve on the demo hotel is part of the judge flow; content isn't.
    demo := old.demo_key is not null
      and (to_jsonb(new) - array['self_serve_enabled', 'self_serve_token'])
        is distinct from (to_jsonb(old) - array['self_serve_enabled', 'self_serve_token']);
  elsif tg_table_name = 'guides' then
    demo := old.demo_key is not null;
  else -- host_picks: check the property before and after the change
    select bool_or(p.demo_key is not null) into demo
    from public.properties p
    where p.id in (
      case when tg_op = 'INSERT' then null else old.property_id end,
      case when tg_op = 'DELETE' then null else new.property_id end
    );
  end if;

  if coalesce(demo, false) then
    raise exception 'The demo data is read-only. Create your own property to try editing.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists protect_demo_rows on public.properties;
create trigger protect_demo_rows
  before update on public.properties
  for each row execute function public.protect_demo_rows();

drop trigger if exists protect_demo_rows on public.guides;
create trigger protect_demo_rows
  before update on public.guides
  for each row execute function public.protect_demo_rows();

drop trigger if exists protect_demo_rows on public.host_picks;
create trigger protect_demo_rows
  before insert or update or delete on public.host_picks
  for each row execute function public.protect_demo_rows();
