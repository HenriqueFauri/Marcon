-- Memória curta do assistente no WhatsApp: as últimas trocas de cada número, para "e a preta?" e
-- "e ontem?" continuarem o assunto. Só texto de pergunta e resposta, nunca o resultado das consultas.
-- Sem política nenhuma: só a chave de serviço (o webhook) lê e grava. O webhook apaga o que passa
-- de 24 horas a cada mensagem nova.

create table whatsapp_conversas (
  id bigint generated always as identity primary key,
  telefone text not null,
  papel text not null check (papel in ('user', 'assistant')),
  texto text not null,
  criado_em timestamptz not null default now()
);

create index whatsapp_conversas_telefone_idx on whatsapp_conversas (telefone, criado_em desc);

alter table whatsapp_conversas enable row level security;
