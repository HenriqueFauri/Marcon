-- Por que a pessoa cancelou a assinatura (pergunta opcional, feita depois do cancelamento).
-- Uma resposta por assinatura do Asaas: responder de novo sobrescreve. Só o servidor com a chave
-- de serviço lê e escreve (a ação confere o dono; o admin lê no painel).

create table cancelamento_motivos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  assinatura_id text not null,
  motivo text not null check (motivo in ('preco', 'cartao', 'faltou_funcao', 'vendo_pouco', 'rotina', 'outro')),
  comentario text check (char_length(comentario) <= 500),
  ciclo text check (ciclo in ('mensal', 'anual')),
  criado_em timestamptz not null default now(),
  unique (owner_id, assinatura_id)
);

create index cancelamento_motivos_criado_idx on cancelamento_motivos (criado_em desc);

alter table cancelamento_motivos enable row level security;
-- sem policies de propósito
revoke all on table cancelamento_motivos from anon, authenticated;
