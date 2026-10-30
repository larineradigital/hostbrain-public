-- The "taste twins" line (Qloo call Q11 in lib/qloo/endpoints.ts): the age band that people with the guest's
-- picks skew towards, from Qloo's audience demographics averaged over the picks. Written by
-- the pipeline (service role) with the guide, so the guide page never calls Qloo on render.
-- Hosts have no insert or update grant on it (column grants in 20261028090000_harden_rls.sql).
alter table public.guides
  add column if not exists audience_age_band text
    check (audience_age_band is null or audience_age_band ~ '^[a-z0-9_]{1,24}$');
