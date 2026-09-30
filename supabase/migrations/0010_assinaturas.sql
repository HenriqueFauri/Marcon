-- Assinaturas do próprio Marcon, cobradas pelo Asaas.
-- O Asaas é a fonte da verdade: esta tabela é só um espelho do estado, atualizado
-- pelo webhook (/api/asaas/webhook). O usuário lê a própria linha; ninguém escreve
-- pelo app, só o servidor com a chave de serviço (que ignora o RLS).
-- Sem linha = ainda não assinou; o período de teste é contado a partir do
-- created_at do usuário em auth.users.

create table assinaturas (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  asaas_customer_id text not null,
  asaas_subscription_id text unique,
  plano text not null,
  -- pendente: assinatura criada, primeira cobrança ainda não paga
  status text not null default 'pendente'
    check (status in ('pendente', 'ativa', 'atrasada', 'cancelada')),
  proximo_vencimento date,
  updated_at timestamptz not null default now()
);

alter table assinaturas enable row level security;

create policy "assinaturas_select_own" on assinaturas
  for select using (owner_id = auth.uid());

-- eventos já processados: o Asaas entrega "pelo menos uma vez", então o mesmo
-- evento pode chegar repetido. O id do evento impede processar duas vezes.
create table asaas_eventos (
  id text primary key,
  tipo text not null,
  recebido_em timestamptz not null default now()
);

alter table asaas_eventos enable row level security;
-- sem policies: só a chave de serviço acessa
