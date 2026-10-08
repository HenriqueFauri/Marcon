-- Assistente no WhatsApp (teste): o vendedor vincula o número da conta mandando um código para o
-- número do Marcon e depois consulta estoque, preço e vendas por mensagem.
-- Quem escreve nestas tabelas é o servidor (webhook com a chave de serviço); o dono só lê o próprio
-- vínculo, gera códigos e desvincula.

create table whatsapp_vinculos (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  telefone text not null unique, -- só dígitos, como o WhatsApp entrega (ex.: 5551999998888)
  criado_em timestamptz not null default now()
);

alter table whatsapp_vinculos enable row level security;

create policy "whatsapp_vinculos_select_own" on whatsapp_vinculos
  for select using (owner_id = auth.uid());
create policy "whatsapp_vinculos_delete_own" on whatsapp_vinculos
  for delete using (owner_id = auth.uid());
-- sem política de insert/update: o vínculo só nasce no webhook, depois de o código chegar pelo WhatsApp

create table whatsapp_codigos (
  codigo text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create index whatsapp_codigos_owner_idx on whatsapp_codigos (owner_id);

alter table whatsapp_codigos enable row level security;

create policy "whatsapp_codigos_select_own" on whatsapp_codigos
  for select using (owner_id = auth.uid());
create policy "whatsapp_codigos_insert_own" on whatsapp_codigos
  for insert with check (owner_id = auth.uid() and expira_em <= now() + interval '30 minutes');
create policy "whatsapp_codigos_delete_own" on whatsapp_codigos
  for delete using (owner_id = auth.uid());
