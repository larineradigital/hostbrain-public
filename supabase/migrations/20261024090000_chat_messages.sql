-- The concierge's conversation per guide.
-- Guests never read this table directly: the chat route checks the guide token in server
-- code and uses the service role. Hosts may read their own guides' chats (through
-- guides → properties.host_id), e.g. for the "questions asked" count.

create table if not exists public.chat_messages (
  id bigserial primary key,
  guide_id uuid not null references public.guides on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- user: {text}; assistant: {text, cards, seen} where cards hold validated Qloo entities
  -- only and seen lists entity IDs the tools returned (lib/ai/concierge.ts).
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_guide_created_idx
  on public.chat_messages (guide_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages: own guide" on public.chat_messages;
create policy "chat_messages: own guide" on public.chat_messages
  for all to authenticated
  using (public.owns_guide(guide_id))
  with check (public.owns_guide(guide_id));
