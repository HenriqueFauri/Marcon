-- 1. IA nos anúncios: cada geração fica registrada (para contar o limite do mês e
--    acompanhar o custo em tokens). O limite é imposto aqui, como os outros do plano.
-- 2. Recibo: cada venda ganha um código secreto para o link público do recibo
--    (/r/<código>), que o lojista manda ao cliente. Quem tem o código vê só o
--    recibo; trocar o código invalida o link antigo.

-- ---------------------------------------------------------------------------
-- 1. IA
-- ---------------------------------------------------------------------------
create table ia_geracoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  produto_id uuid references produtos (id) on delete set null,
  canal text,
  modelo text,
  tokens_entrada integer,
  tokens_saida integer,
  created_at timestamptz not null default now()
);

create index ia_geracoes_owner_created_idx on ia_geracoes (owner_id, created_at);

alter table ia_geracoes enable row level security;

create policy "ia_geracoes_select_own" on ia_geracoes
  for select using (owner_id = auth.uid());
create policy "ia_geracoes_insert_own" on ia_geracoes
  for insert with check (owner_id = auth.uid());
create policy "ia_geracoes_update_own" on ia_geracoes
  for update using (owner_id = auth.uid());
-- apagar só para devolver a cota quando a geração falha
create policy "ia_geracoes_delete_own" on ia_geracoes
  for delete using (owner_id = auth.uid());

create or replace function limites_do_plano(p_plano text) returns jsonb
language sql
immutable
as $$
  select case
    when p_plano = 'gratis' then
      jsonb_build_object('vendas_mes', 30, 'produtos', 50, 'fotos_por_item', 3, 'importa_historico', false, 'ia_mes', 10)
    else
      jsonb_build_object('vendas_mes', null, 'produtos', null, 'fotos_por_item', 10, 'importa_historico', true, 'ia_mes', 100)
  end;
$$;

-- gerações de IA neste mês (fuso de Brasília)
create or replace function ia_do_mes(p_owner uuid) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from ia_geracoes
  where owner_id = p_owner
    and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;

revoke execute on function ia_do_mes(uuid) from public, anon, authenticated;

create or replace function aplicar_limites_ia() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plano text := plano_do_usuario(new.owner_id);
  v_max integer := (limites_do_plano(v_plano)->>'ia_mes')::integer;
begin
  if v_max is not null and ia_do_mes(new.owner_id) >= v_max then
    if v_plano = 'gratis' then
      raise exception 'Você usou as % escritas com IA do mês no plano grátis. Assine o plano Marcon para ter mais.', v_max;
    end if;
    raise exception 'Você usou as % escritas com IA deste mês. A cota renova no dia 1º.', v_max;
  end if;
  return new;
end;
$$;

create trigger ia_geracoes_limites_do_plano
  before insert on ia_geracoes
  for each row execute function aplicar_limites_ia();

create or replace function uso_do_plano() returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid := auth.uid();
  v_plano text;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  v_plano := plano_do_usuario(v_owner);
  return jsonb_build_object(
    'plano', v_plano,
    'vendas_mes', vendas_do_mes(v_owner),
    'produtos', (select count(*) from produtos where owner_id = v_owner),
    'ia_mes', ia_do_mes(v_owner),
    'limites', limites_do_plano(v_plano)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Recibo
-- ---------------------------------------------------------------------------
-- o default volátil gera um código diferente para cada venda que já existe
alter table vendas add column recibo_token uuid not null default gen_random_uuid();
create unique index vendas_recibo_token_idx on vendas (recibo_token);

-- troca o código: o link enviado antes para de funcionar
create or replace function novo_link_recibo(p_venda_id uuid) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token uuid;
begin
  update vendas set recibo_token = gen_random_uuid()
    where id = p_venda_id and owner_id = auth.uid()
    returning recibo_token into v_token;
  if v_token is null then raise exception 'Venda não encontrada.'; end if;
  return v_token;
end;
$$;

-- Dados do recibo para quem tem o código, sem login. Devolve só o que o cliente
-- deve ver: nada de custo, lucro, observações internas ou dados de outros clientes.
create or replace function recibo_publico(p_token uuid) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'empresa', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'telefone', u.raw_user_meta_data->>'empresa_telefone',
      'email', u.raw_user_meta_data->>'empresa_email',
      'endereco', u.raw_user_meta_data->>'empresa_endereco',
      'documento', u.raw_user_meta_data->>'empresa_documento',
      'logo_path', u.raw_user_meta_data->>'empresa_logo_path'
    ),
    'venda', jsonb_build_object(
      'data', v.data,
      'cliente_nome', v.cliente_nome,
      'tipo_pagamento', v.tipo_pagamento,
      'forma_pagamento', v.forma_pagamento,
      'valor_total', v.valor_total,
      'desconto', v.desconto,
      'status', v.status
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.produto_nome, 'quantidade', i.quantidade, 'preco_unitario', i.preco_unitario
      ) order by i.produto_nome)
      from venda_itens i where i.venda_id = v.id
    ), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero_parcela,
        'vencimento', p.vencimento,
        'valor', p.valor,
        'status', case when p.status = 'pendente' and p.vencimento < current_date then 'atrasado' else p.status::text end,
        'data_pagamento', p.data_pagamento
      ) order by p.numero_parcela)
      from parcelas p where p.venda_id = v.id
    ), '[]'::jsonb)
  )
  from vendas v
  join auth.users u on u.id = v.owner_id
  where v.recibo_token = p_token;
$$;

revoke execute on function recibo_publico(uuid) from public;
grant execute on function recibo_publico(uuid) to anon, authenticated;
