-- Pedidos da vitrine: reserva de estoque, andamento para o cliente e frete por região.
--
-- 1. Reserva (F21): pedido novo reserva as unidades. Não mexe em produtos.estoque_atual: a reserva é
--    calculada dos próprios pedidos abertos (vitrine_reservas). Libera sozinha quando o pedido vira
--    venda (a venda baixa o estoque), é descartado, ou, se ninguém mexeu, 48 horas depois.
--    Marcar como "separado" ou "saiu" segura a reserva até virar venda ou ser descartado.
--    A loja mostra o estoque já descontando as reservas (vitrine_dados) e registrar_pedido_vitrine
--    recusa o pedido que não cabe, com trava por loja para dois clientes não levarem a última unidade.
-- 2. Andamento (F22): coluna andamento (recebido, separado, saiu) além do status. Status continua
--    "novo / vendido / descartado" (a Nova venda a partir do pedido segue igual). O cliente acompanha
--    por um link com token (pedido_publico_vitrine), sem login e sem expor endereço.
-- 3. Frete por região (F23): tabela vitrine_regioes_frete. O cliente escolhe a região no pedido;
--    quem não escolhe uma da lista usa o frete fixo (ou "a combinar").

alter table vitrine_pedidos
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists andamento text not null default 'recebido' check (andamento in ('recebido', 'separado', 'saiu')),
  add column if not exists andamento_em timestamptz,
  add column if not exists regiao_frete text check (char_length(regiao_frete) <= 60);

create unique index if not exists vitrine_pedidos_token_idx on vitrine_pedidos (token);
create index if not exists vitrine_pedidos_codigo_idx on vitrine_pedidos (owner_id, codigo);

-- Regiões de frete -------------------------------------------------------------------------------
-- Só tem FK para auth.users (como vitrine_cupons), então não precisa do gatilho de posse.
create table if not exists vitrine_regioes_frete (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  valor numeric(10, 2) not null check (valor >= 0 and valor <= 9999),
  created_at timestamptz not null default now()
);

create unique index if not exists vitrine_regioes_frete_nome_idx on vitrine_regioes_frete (owner_id, lower(btrim(nome)));

alter table vitrine_regioes_frete enable row level security;

drop policy if exists "vitrine_regioes_select_own" on vitrine_regioes_frete;
create policy "vitrine_regioes_select_own" on vitrine_regioes_frete for select using (owner_id = auth.uid());
drop policy if exists "vitrine_regioes_insert_own" on vitrine_regioes_frete;
create policy "vitrine_regioes_insert_own" on vitrine_regioes_frete for insert with check (owner_id = auth.uid());
drop policy if exists "vitrine_regioes_update_own" on vitrine_regioes_frete;
create policy "vitrine_regioes_update_own" on vitrine_regioes_frete
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "vitrine_regioes_delete_own" on vitrine_regioes_frete;
create policy "vitrine_regioes_delete_own" on vitrine_regioes_frete for delete using (owner_id = auth.uid());

-- Reservas -----------------------------------------------------------------------------------------
-- Unidades presas em pedidos abertos do dono, por produto (e variação).
create or replace function vitrine_reservas(p_owner uuid)
returns table (produto_id uuid, variacao_id uuid, quantidade bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (i->>'produto_id')::uuid,
    nullif(i->>'variacao_id', '')::uuid,
    sum((i->>'quantidade')::integer)::bigint
  from vitrine_pedidos p
  cross join lateral jsonb_array_elements(p.itens) i
  where p.owner_id = p_owner
    and p.status = 'novo'
    and (p.andamento <> 'recebido' or p.created_at > now() - interval '48 hours')
  group by 1, 2;
$$;

revoke execute on function vitrine_reservas(uuid) from public, anon, authenticated;

-- Dados da loja ---------------------------------------------------------------------------------------
-- O corpo é o da 0043. Mudou: estoque descontando as reservas (esgotado e últimas unidades) e a lista
-- de regiões de frete.
create or replace function vitrine_dados(p_owner uuid) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with res as materialized (select * from vitrine_reservas(p_owner))
  select jsonb_build_object(
    'loja', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'logo_path', case when caminho_do_dono(u.raw_user_meta_data->>'empresa_logo_path', u.id) then u.raw_user_meta_data->>'empresa_logo_path' end,
      'whatsapp', vt.whatsapp,
      'cor', vt.cor,
      'tema', vt.tema,
      'cor_botao', vt.cor_botao,
      'cor_fundo', vt.cor_fundo,
      'cor_texto', vt.cor_texto,
      'cor_faixa', vt.cor_faixa,
      'boas_vindas', vt.boas_vindas,
      'anuncio', vt.anuncio,
      'entrega', vt.entrega,
      'frete_fixo', vt.frete_fixo,
      'regioes_frete', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'valor', r.valor) order by lower(r.nome))
        from vitrine_regioes_frete r where r.owner_id = vt.owner_id
      ), '[]'::jsonb),
      'instagram', vt.instagram,
      'endereco', case when vt.mostrar_endereco then nullif(u.raw_user_meta_data->>'empresa_endereco', '') end,
      'formas_pagamento', coalesce((
        select jsonb_agg(fp.nome order by fp.nome) from formas_pagamento fp where fp.owner_id = vt.owner_id
      ), '[]'::jsonb),
      'ref', (select a.codigo from afiliados a where a.owner_id = vt.owner_id)
    ),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', coalesce(nullif(btrim(p.vitrine_titulo), ''), p.nome),
        'marca', p.marca,
        'descricao', coalesce(nullif(btrim(p.vitrine_descricao), ''), p.descricao),
        'categoria', c.nome,
        'preco', p.preco_varejo,
        'destaque', p.destaque,
        'tem_variacoes', p.tem_variacoes,
        'esgotado', case
          when p.tem_variacoes then not exists (
            select 1 from produto_variacoes v
            where v.produto_id = p.id and v.owner_id = p.owner_id
              and v.estoque - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id = v.id), 0) > 0
          )
          else p.estoque_atual - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id is null), 0) <= 0
        end,
        'ultimas', case
          when vt.ultimas_unidades and not p.tem_variacoes
            and p.estoque_atual - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id is null), 0) between 1 and 5
          then p.estoque_atual - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id is null), 0)
        end,
        'variacoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'nome', v.nome_combinacao,
            'preco', coalesce(v.preco_venda, p.preco_varejo),
            'esgotado', v.estoque - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id = v.id), 0) <= 0,
            'ultimas', case
              when vt.ultimas_unidades
                and v.estoque - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id = v.id), 0) between 1 and 5
              then v.estoque - coalesce((select r.quantidade from res r where r.produto_id = p.id and r.variacao_id = v.id), 0)
            end
          ) order by v.created_at)
          from produto_variacoes v where v.produto_id = p.id and v.owner_id = p.owner_id
        ), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(jsonb_build_object('path', f.path, 'variacao_id', f.variacao_id) order by (f.id = p.vitrine_capa_id) desc nulls last, f.ordem, f.created_at)
          from produto_fotos f
          where f.produto_id = p.id and f.owner_id = p.owner_id and f.na_vitrine and caminho_do_dono(f.path, p.owner_id)
        ), '[]'::jsonb)
      ) order by p.created_at desc)
      from produtos p
      left join categorias c on c.id = p.categoria_id
      where p.owner_id = vt.owner_id and p.na_vitrine and p.status = 'ativo'
    ), '[]'::jsonb)
  )
  from vitrines vt
  join auth.users u on u.id = vt.owner_id
  where vt.owner_id = p_owner;
$$;

revoke execute on function vitrine_dados(uuid) from public, anon, authenticated;

-- Registrar pedido -----------------------------------------------------------------------------------
-- Antes devolvia void e descartava em silêncio o que não cabia. Agora devolve jsonb:
--   {ok: true, token}                               pedido gravado; {ok: true, token, repetido: true} se o código já existia
--   {ok: false, motivo: 'estoque', itens: [{produto_id, variacao_id, disponivel}]}   algum item não cabe
--   {ok: false, motivo: 'indisponivel'}             loja fora do ar, plano vencido, pedido vazio ou inválido
-- Mudou o tipo de retorno, então é drop + create: repete o revoke (a função nova nasce executável por anon).
-- p_dados ganhou regiao_id (região de frete escolhida).
drop function if exists registrar_pedido_vitrine(text, text, jsonb, jsonb, uuid);

create function registrar_pedido_vitrine(p_slug text, p_codigo text, p_itens jsonb, p_dados jsonb, p_ignorar uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vt vitrines%rowtype;
  v_linhas jsonb;
  v_itens jsonb;
  v_falta jsonb;
  v_subtotal numeric(12, 2);
  v_desconto numeric(12, 2) := 0;
  v_cupom vitrine_cupons%rowtype;
  v_entrega text;
  v_frete numeric(10, 2);
  v_regiao text;
  v_regiao_id uuid;
  v_token uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_vt from vitrines where slug = lower(p_slug) and ativa;
  if v_vt.owner_id is null or plano_do_usuario(v_vt.owner_id) not in ('pago', 'teste') then
    return jsonb_build_object('ok', false, 'motivo', 'indisponivel');
  end if;
  if p_codigo !~ '^[A-Z0-9]{4,8}$' or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 50 then
    return jsonb_build_object('ok', false, 'motivo', 'indisponivel');
  end if;

  -- um pedido por vez por loja: dois clientes pedindo a última unidade passam em fila
  perform pg_advisory_xact_lock(hashtextextended('vitrine_pedido:' || v_vt.owner_id::text, 0));

  -- mesmo código já gravado: devolve o mesmo pedido, sem reservar de novo nem contar de novo
  select token into v_token from vitrine_pedidos where owner_id = v_vt.owner_id and codigo = p_codigo limit 1;
  if v_token is not null then
    return jsonb_build_object('ok', true, 'token', v_token, 'repetido', true);
  end if;

  -- cada item pedido com o que há de fato livre (estoque menos o reservado em outros pedidos); preço e nome do banco
  with pedidos as (
    select
      (e->>'produto_id')::uuid as produto_id,
      nullif(e->>'variacao_id', '')::uuid as variacao_id,
      least(sum(least(greatest((e->>'quantidade')::integer, 1), 99)), 99)::integer as quantidade,
      min(ordem) as ordem
    from jsonb_array_elements(p_itens) with ordinality as x(e, ordem)
    where (e->>'produto_id') ~* '^[0-9a-f-]{36}$'
      and coalesce(e->>'variacao_id', '') ~* '^([0-9a-f-]{36})?$'
      and (e->>'quantidade') ~ '^[0-9]{1,2}$'
    group by 1, 2
  ),
  res as (select * from vitrine_reservas(v_vt.owner_id))
  select coalesce(jsonb_agg(jsonb_build_object(
    'produto_id', i.produto_id,
    'variacao_id', i.variacao_id,
    'nome', p.nome,
    'variacao', v.nome_combinacao,
    'preco', coalesce(v.preco_venda, p.preco_varejo),
    'quantidade', i.quantidade,
    'disponivel', greatest(
      case
        when p.id is null then 0
        when i.variacao_id is null and not p.tem_variacoes then p.estoque_atual
        when i.variacao_id is not null and v.id is not null then v.estoque
        else 0
      end - coalesce(r.quantidade, 0),
      0
    )
  ) order by i.ordem), '[]'::jsonb)
  into v_linhas
  from pedidos i
  left join produtos p on p.id = i.produto_id and p.owner_id = v_vt.owner_id and p.na_vitrine and p.status = 'ativo'
  left join produto_variacoes v on v.id = i.variacao_id and v.produto_id = p.id and v.owner_id = p.owner_id
  left join res r on r.produto_id = i.produto_id and r.variacao_id is not distinct from i.variacao_id;

  if jsonb_array_length(v_linhas) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'indisponivel');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'produto_id', e->>'produto_id', 'variacao_id', e->'variacao_id', 'disponivel', (e->>'disponivel')::integer
  )), '[]'::jsonb)
  into v_falta
  from jsonb_array_elements(v_linhas) e
  where (e->>'disponivel')::integer < (e->>'quantidade')::integer;

  if jsonb_array_length(v_falta) > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'estoque', 'itens', v_falta);
  end if;

  select
    jsonb_agg(e - 'disponivel' order by ord),
    coalesce(sum((e->>'preco')::numeric * (e->>'quantidade')::integer), 0)
  into v_itens, v_subtotal
  from jsonb_array_elements(v_linhas) with ordinality as t(e, ord);

  -- cupom: mesmas regras de validar_cupom_vitrine e de descontoDoCupom (src/lib/vitrine.ts)
  if coalesce(p_dados->>'cupom', '') <> '' then
    select * into v_cupom from vitrine_cupons c
    where c.owner_id = v_vt.owner_id
      and c.codigo = upper(btrim(p_dados->>'cupom'))
      and c.ativo
      and (c.validade is null or c.validade >= v_dia);
    if v_cupom.id is not null and (v_cupom.minimo is null or v_subtotal >= v_cupom.minimo) then
      v_desconto := round(least(
        case when v_cupom.tipo = 'percentual' then v_subtotal * v_cupom.valor / 100 else v_cupom.valor end,
        v_subtotal
      ), 2);
    end if;
  end if;

  -- entrega só do jeito que a loja aceita; na entrega, o frete é o da região escolhida ou o fixo da loja
  v_entrega := case
    when v_vt.entrega = 'ambos' and p_dados->>'entrega' in ('entrega', 'retirada') then p_dados->>'entrega'
    when v_vt.entrega = 'ambos' then 'entrega'
    else v_vt.entrega
  end;
  if v_entrega = 'entrega' then
    v_frete := v_vt.frete_fixo;
    if coalesce(p_dados->>'regiao_id', '') ~* '^[0-9a-f-]{36}$' then
      v_regiao_id := (p_dados->>'regiao_id')::uuid;
      select r.nome, r.valor into v_regiao, v_frete
      from vitrine_regioes_frete r where r.id = v_regiao_id and r.owner_id = v_vt.owner_id;
      if v_regiao is null then
        v_frete := v_vt.frete_fixo;
      end if;
    end if;
  end if;

  insert into vitrine_pedidos (owner_id, codigo, itens, subtotal, desconto, cupom, frete, regiao_frete, total, cliente_nome, entrega, endereco, pagamento)
  values (
    v_vt.owner_id,
    p_codigo,
    v_itens,
    v_subtotal,
    v_desconto,
    case when v_desconto > 0 then v_cupom.codigo end,
    v_frete,
    v_regiao,
    v_subtotal - v_desconto + coalesce(v_frete, 0),
    nullif(left(btrim(p_dados->>'cliente_nome'), 80), ''),
    v_entrega,
    case when v_entrega = 'entrega' then nullif(left(btrim(p_dados->>'endereco'), 300), '') end,
    nullif(left(btrim(p_dados->>'pagamento'), 60), '')
  )
  returning token into v_token;

  if v_vt.owner_id is distinct from p_ignorar then
    insert into vitrine_metricas (owner_id, dia, pedidos) values (v_vt.owner_id, v_dia, 1)
    on conflict (owner_id, dia) do update set pedidos = vitrine_metricas.pedidos + 1;
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke execute on function registrar_pedido_vitrine(text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function registrar_pedido_vitrine(text, text, jsonb, jsonb, uuid) to service_role;

-- Acompanhar o pedido ------------------------------------------------------------------------------------
-- Só SELECT, para o cliente sem login. Quem tem o token (um uuid sem como adivinhar) vê o andamento,
-- os itens e o total. Não devolve endereço nem o nome completo.
create or replace function pedido_publico_vitrine(p_slug text, p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'codigo', p.codigo,
    'status', p.status,
    'andamento', p.andamento,
    'andamento_em', p.andamento_em,
    'entrega', p.entrega,
    'total', p.total,
    'frete', p.frete,
    'regiao_frete', p.regiao_frete,
    'primeiro_nome', nullif(split_part(btrim(coalesce(p.cliente_nome, '')), ' ', 1), ''),
    'created_at', p.created_at,
    'whatsapp', vt.whatsapp,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('nome', i->>'nome', 'variacao', i->>'variacao', 'quantidade', (i->>'quantidade')::integer))
      from jsonb_array_elements(p.itens) i
    ), '[]'::jsonb)
  )
  from vitrine_pedidos p
  join vitrines vt on vt.owner_id = p.owner_id
  where p.token = p_token and vt.slug = lower(p_slug);
$$;

revoke execute on function pedido_publico_vitrine(text, uuid) from public;
grant execute on function pedido_publico_vitrine(text, uuid) to anon, authenticated, service_role;
