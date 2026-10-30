-- The LLM moved from Anthropic to OpenAI. api_log keeps 'anthropic' so
-- rows logged before the switch stay valid; new LLM calls log provider 'openai'.
alter table public.api_log drop constraint if exists api_log_provider_check;
alter table public.api_log
  add constraint api_log_provider_check
  check (provider in ('qloo', 'openai', 'anthropic', 'photon', 'open_meteo'));
