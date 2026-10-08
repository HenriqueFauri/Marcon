-- Lançar venda pelo WhatsApp (F2).
-- 1) whatsapp_acoes: rascunho da venda que espera o "SIM" do vendedor, e o registro do que aconteceu.
--    Só a chave de serviço (o webhook) lê e grava: sem política nenhuma.
-- 2) registrar_venda_como(): o webhook não tem usuário logado, e registrar_venda() usa auth.uid().
--    Esta função assume a identidade do dono, só dentro da transação, e chama a registrar_venda()
--    de sempre, então estoque, custo, parcelas, caixa e limites do plano valem igual ao app.

create table whatsapp_acoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  telefone text not null,
  tipo text not null check (tipo in ('venda')),
  payload jsonb not null,
  resumo text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'executada', 'cancelada', 'expirada', 'falhou')),
  venda_id uuid references vendas (id) on delete set null,
  erro text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  resolvida_em timestamptz
);

-- um rascunho aberto por número: um novo pedido cancela o anterior antes de nascer
create unique index whatsapp_acoes_uma_pendente on whatsapp_acoes (telefone) where status = 'pendente';
create index whatsapp_acoes_owner_idx on whatsapp_acoes (owner_id, criado_em desc);

alter table whatsapp_acoes enable row level security;

create or replace function registrar_venda_como(
  p_owner uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_itens jsonb,
  p_desconto numeric,
  p_tipo_pagamento venda_tipo_pagamento,
  p_forma_pagamento text,
  p_canal text,
  p_numero_parcelas integer,
  p_primeiro_vencimento date,
  p_data date,
  p_canal_id uuid,
  p_forma_pagamento_id uuid,
  p_outros_gastos numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda uuid;
begin
  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'conta não encontrada';
  end if;

  -- vale só nesta transação (terceiro argumento true): o auth.uid() da registrar_venda() passa a ser o dono
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  v_venda := registrar_venda(
    p_cliente_id, p_cliente_nome, p_itens, p_desconto, p_tipo_pagamento, p_forma_pagamento, p_canal,
    p_numero_parcelas, p_primeiro_vencimento, p_data, p_canal_id, p_forma_pagamento_id, p_outros_gastos
  );
  return v_venda;
end;
$$;

-- só o servidor (chave de serviço) chama: quem chama escolhe de quem é a venda
revoke execute on function registrar_venda_como(uuid, uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function registrar_venda_como(uuid, uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric) to service_role;
