-- Registro dos e-mails de ciclo de vida já enviados (aviso de fim do teste e da cortesia, cobrança que
-- falhou). A chave (dono, tipo, referência) impede mandar o mesmo aviso duas vezes, mesmo que a rotina
-- diária rode de novo ou o Asaas reenvie o evento. Só o servidor com a chave de serviço escreve.

create table emails_enviados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('teste_3d', 'teste_1d', 'cortesia_3d', 'cortesia_1d', 'cobranca_falhou')),
  -- o que o aviso cobre: a data do fim do teste ou da cortesia, ou o id da cobrança
  referencia text not null,
  enviado_em timestamptz not null default now(),
  unique (owner_id, tipo, referencia)
);

alter table emails_enviados enable row level security;
-- sem policies: ninguém lê nem escreve pelo app, só a chave de serviço (que ignora o RLS)
