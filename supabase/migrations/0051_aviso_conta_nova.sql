-- Aviso ao admin quando uma conta nova entra. O app grava aqui, na primeira vez que a conta abre o app,
-- que contas já foram avisadas; a linha é o que impede avisar duas vezes (insert ... on conflict do nothing).
-- Sem política: só a chave de serviço lê e escreve.
--
-- As contas que já existem entram como avisadas, para o deploy não mandar um aviso de cada uma.

create table if not exists contas_avisadas (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  avisada_em timestamptz not null default now()
);
alter table contas_avisadas enable row level security;
revoke all on table contas_avisadas from anon, authenticated;

insert into contas_avisadas (owner_id)
select id from auth.users
on conflict do nothing;
