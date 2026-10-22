-- Vitrine sem reserva de estoque (a pedido do dono, 2026-10-22). Desfaz só a parte de reserva da 0054:
-- o pedido da loja nunca é recusado por falta de estoque nem prende unidades. O cliente pode pedir mesmo
-- com estoque zero ou já pedido por outro; o vendedor resolve ao ver o pedido, e a Nova venda a partir
-- do pedido já avisa os itens sem estoque. A loja volta a mostrar o estoque real (estoque_atual).
-- Fica da 0054: andamento do pedido, link "Seu pedido", regiões de frete e o mesmo código devolver o
-- mesmo pedido (agora com trava só por código, não por loja).
-- Recriar função mantém os privilégios quando a assinatura não muda, mas o revoke/grant é repetido.

-- Dados da loja: o corpo da 0054 sem descontar reservas (mantém as regiões de frete).
create or replace function vitrine_dados(p_owner uuid) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
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
              and v.estoque > 0
          )
          else p.estoque_atual <= 0
        end,
        'ultimas', case
          when vt.ultimas_unidades and not p.tem_variacoes
            and p.estoque_atual between 1 and 5
          then p.estoque_atual
        end,
        'variacoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'nome', v.nome_combinacao,
            'preco', coalesce(v.preco_venda, p.preco_varejo),
            'esgotado', v.estoque <= 0,
            'ultimas', case
              when vt.ultimas_unidades
                and v.estoque between 1 and 5
              then v.estoque
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

-- Registrar pedido: o da 0054 sem a trava por loja, sem a recusa por estoque e sem o campo disponivel.
-- Item que não existe na loja (produto fora da vitrine, variação errada) segue sendo descartado.
-- Retorno: {ok: true, token[, repetido: true]} ou {ok: false, motivo: 'indisponivel'}.
create or replace function registrar_pedido_vitrine(p_slug text, p_codigo text, p_itens jsonb, p_dados jsonb, p_ignorar uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vt vitrines%rowtype;
  v_linhas jsonb;
  v_itens jsonb;
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

  -- trava só por código: o mesmo pedido enviado duas vezes ao mesmo tempo grava uma vez só
  perform pg_advisory_xact_lock(hashtextextended('vitrine_pedido:' || v_vt.owner_id::text || ':' || p_codigo, 0));

  -- mesmo código já gravado: devolve o mesmo pedido, sem gravar de novo nem contar de novo
  select token into v_token from vitrine_pedidos where owner_id = v_vt.owner_id and codigo = p_codigo limit 1;
  if v_token is not null then
    return jsonb_build_object('ok', true, 'token', v_token, 'repetido', true);
  end if;

  -- cada item pedido, sem checar estoque; preço e nome vêm do banco
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
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'produto_id', i.produto_id,
    'variacao_id', i.variacao_id,
    'nome', p.nome,
    'variacao', v.nome_combinacao,
    'preco', coalesce(v.preco_venda, p.preco_varejo),
    'quantidade', i.quantidade
  ) order by i.ordem), '[]'::jsonb)
  into v_linhas
  from pedidos i
  left join produtos p on p.id = i.produto_id and p.owner_id = v_vt.owner_id and p.na_vitrine and p.status = 'ativo'
  left join produto_variacoes v on v.id = i.variacao_id and v.produto_id = p.id and v.owner_id = p.owner_id
  where p.id is not null
    and ((i.variacao_id is null and not p.tem_variacoes) or (i.variacao_id is not null and v.id is not null));

  if jsonb_array_length(v_linhas) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'indisponivel');
  end if;

  select
    jsonb_agg(e order by ord),
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

-- Reservas: nada mais usa.
drop function if exists vitrine_reservas(uuid);

-- pedido_publico_vitrine não muda (é a da 0054); repete o acesso do link "Seu pedido".
revoke execute on function pedido_publico_vitrine(text, uuid) from public;
grant execute on function pedido_publico_vitrine(text, uuid) to anon, authenticated, service_role;
