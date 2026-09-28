-- Fase 3c: assinaturas de push notification (PWA). Um usuário pode ter mais
-- de uma assinatura (celular + desktop, por exemplo), por isso não é
-- unique por owner_id — só por endpoint, que identifica o dispositivo/navegador.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_owner_idx on push_subscriptions (owner_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on push_subscriptions
  for select using (owner_id = auth.uid());
create policy "push_subscriptions_insert_own" on push_subscriptions
  for insert with check (owner_id = auth.uid());
create policy "push_subscriptions_delete_own" on push_subscriptions
  for delete using (owner_id = auth.uid());
