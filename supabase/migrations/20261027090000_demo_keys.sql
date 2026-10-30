-- Demo data (lib/demo/personas.ts). `scripts/seed-demo.ts` labels the demo properties (P1–P3)
-- and guides (A–E) so reruns update them in place and /demo can find guests A and B.
-- Guide tokens stay random: a demo key is never part of a URL.

alter table public.properties
  add column if not exists demo_key text check (demo_key ~ '^[A-Z][A-Z0-9]{0,7}$');

alter table public.guides
  add column if not exists demo_key text check (demo_key ~ '^[A-Z][A-Z0-9]{0,7}$');

-- NULLs are distinct, so ordinary rows are unaffected.
do $$ begin
  alter table public.properties
    add constraint properties_host_demo_key_key unique (host_id, demo_key);
exception when duplicate_object or duplicate_table then null;
end $$;

do $$ begin
  alter table public.guides
    add constraint guides_property_demo_key_key unique (property_id, demo_key);
exception when duplicate_object or duplicate_table then null;
end $$;

-- The demo host is configured by email (DEMO_HOST_EMAIL). Only server code with the
-- service role may look it up; it returns an id, never the email list.
create or replace function public.demo_host_id(target_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(target_email) limit 1;
$$;

revoke all on function public.demo_host_id(text) from public, anon, authenticated;
grant execute on function public.demo_host_id(text) to service_role;
