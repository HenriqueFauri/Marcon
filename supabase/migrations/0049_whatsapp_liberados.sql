-- Quem pode usar o assistente no WhatsApp passa a ser decidido no painel /admin, conta por conta,
-- e não mais em listas de e-mail na Vercel (WHATSAPP_EMAILS, WHATSAPP_EMAILS_ESCRITA, WHATSAPP_ESCRITA
-- e WHATSAPP_LANCAMENTOS deixam de existir). Liberar alguém não pede mais Redeploy.
--
-- Linha na tabela = a conta pode usar o assistente. lancar = também pode lançar pelo WhatsApp (venda,
-- produto, estoque e caixa, sempre com o resumo antes). Sem linha = nada, o padrão de todo mundo.
-- O admin do Marcon (dois fatores, migration 0048) tem tudo liberado sem precisar de linha.
-- Sem política: só a chave de serviço lê e escreve. Quem liga e desliga fica no admin_registro.

create table if not exists whatsapp_liberados (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  lancar boolean not null default false,
  liberado_por uuid references auth.users (id) on delete set null,
  liberado_em timestamptz not null default now()
);
alter table whatsapp_liberados enable row level security;
revoke all on table whatsapp_liberados from anon, authenticated;
