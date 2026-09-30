-- Importação de dados de outros sistemas (relatórios do VendaMax em PDF).
--
-- Regras que valem para as três funções:
--  * tudo ou nada: cada chamada é uma transação;
--  * importar duas vezes não duplica: vendas e lançamentos guardam a referência
--    de origem (importado_ref), com índice único por dono;
--  * vendas importadas são HISTÓRICO: não mexem no estoque (o estoque atual vem
--    do relatório de produtos) e entram no caixa na data da venda;
--  * nada é atualizado ou apagado: produto que já existe (mesmo nome) é pulado.

alter table vendas add column importado_ref text;
create unique index vendas_importado_ref_uk on vendas (owner_id, importado_ref) where importado_ref is not null;

alter table lancamentos_caixa add column importado_ref text;
create unique index lancamentos_caixa_importado_ref_uk on lancamentos_caixa (owner_id, importado_ref) where importado_ref is not null;

-- ---------------------------------------------------------------------------
-- produtos: [{ nome, categoria, custo, preco_varejo, preco_atacado, estoque }]
-- ---------------------------------------------------------------------------
create or replace function importar_produtos(p_itens jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_item jsonb;
  v_nome text;
  v_categoria text;
  v_categoria_id uuid;
  v_produto_id uuid;
  v_custo numeric;
  v_estoque integer;
  v_criados integer := 0;
  v_ignorados integer := 0;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'Lista de produtos inválida.'; end if;
  if jsonb_array_length(p_itens) > 2000 then raise exception 'No máximo 2000 produtos por importação.'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome := left(btrim(coalesce(v_item->>'nome', '')), 200);
    if v_nome = '' then continue; end if;

    if exists (
      select 1 from produtos where owner_id = v_owner and lower(btrim(nome)) = lower(v_nome)
    ) then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    v_categoria := left(btrim(coalesce(v_item->>'categoria', '')), 100);
    v_categoria_id := null;
    if v_categoria <> '' then
      insert into categorias (owner_id, nome) values (v_owner, v_categoria)
        on conflict (owner_id, nome) do nothing;
      select id into v_categoria_id from categorias where owner_id = v_owner and nome = v_categoria;
    end if;

    v_custo := greatest(coalesce((v_item->>'custo')::numeric, 0), 0);
    v_estoque := greatest(coalesce((v_item->>'estoque')::integer, 0), 0);

    insert into produtos (
      owner_id, categoria_id, nome, custo, preco_varejo, preco_atacado, estoque_atual
    ) values (
      v_owner, v_categoria_id, v_nome, v_custo,
      greatest(coalesce((v_item->>'preco_varejo')::numeric, 0), 0),
      nullif(greatest(coalesce((v_item->>'preco_atacado')::numeric, 0), 0), 0),
      v_estoque
    ) returning id into v_produto_id;

    if v_estoque > 0 then
      insert into movimentos_estoque (
        owner_id, produto_id, produto_nome, tipo, quantidade, valor_unitario, observacoes
      ) values (
        v_owner, v_produto_id, v_nome, 'ajuste', v_estoque, v_custo, 'Saldo inicial (importação)'
      );
    end if;

    v_criados := v_criados + 1;
  end loop;

  return jsonb_build_object('criados', v_criados, 'ignorados', v_ignorados);
end;
$$;

-- ---------------------------------------------------------------------------
-- vendas: [{ ref, data, total, custo_total, forma_pagamento, canal, cliente_nome,
--            itens: [{ nome, nome_base, variacao, quantidade, preco_unitario, custo_unitario }] }]
-- ---------------------------------------------------------------------------
create or replace function importar_vendas(p_vendas jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_venda jsonb;
  v_item jsonb;
  v_ref text;
  v_venda_id uuid;
  v_cliente text;
  v_cliente_id uuid;
  v_canal text;
  v_canal_id uuid;
  v_forma text;
  v_forma_id uuid;
  v_total numeric;
  v_data date;
  v_nome text;
  v_base text;
  v_variacao text;
  v_produto_id uuid;
  v_variacao_id uuid;
  v_criadas integer := 0;
  v_ignoradas integer := 0;
  v_sem_produto integer := 0;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if jsonb_typeof(p_vendas) <> 'array' then raise exception 'Lista de vendas inválida.'; end if;
  if jsonb_array_length(p_vendas) > 5000 then raise exception 'No máximo 5000 vendas por importação.'; end if;

  for v_venda in select * from jsonb_array_elements(p_vendas) loop
    v_ref := btrim(coalesce(v_venda->>'ref', ''));
    if v_ref = '' then raise exception 'Venda sem identificação de origem.'; end if;
    v_ref := 'vendamax:' || v_ref;

    if exists (select 1 from vendas where owner_id = v_owner and importado_ref = v_ref) then
      v_ignoradas := v_ignoradas + 1;
      continue;
    end if;

    v_data := (v_venda->>'data')::date;
    v_total := coalesce((v_venda->>'total')::numeric, 0);
    if v_total < 0 then raise exception 'Venda com valor negativo (%).', v_ref; end if;
    if jsonb_typeof(v_venda->'itens') <> 'array' or jsonb_array_length(v_venda->'itens') = 0 then
      raise exception 'Venda sem itens (%).', v_ref;
    end if;

    -- cliente: usa o que já existe com o mesmo nome; senão cria
    v_cliente := left(btrim(coalesce(v_venda->>'cliente_nome', '')), 200);
    v_cliente_id := null;
    if v_cliente <> '' then
      select id into v_cliente_id from clientes
        where owner_id = v_owner and lower(btrim(nome)) = lower(v_cliente) limit 1;
      if v_cliente_id is null then
        insert into clientes (owner_id, nome) values (v_owner, v_cliente) returning id into v_cliente_id;
      end if;
    end if;

    v_canal := left(btrim(coalesce(v_venda->>'canal', '')), 100);
    v_canal_id := null;
    if v_canal <> '' then
      insert into canais_venda (owner_id, nome) values (v_owner, v_canal) on conflict (owner_id, nome) do nothing;
      select id into v_canal_id from canais_venda where owner_id = v_owner and nome = v_canal;
    end if;

    v_forma := left(btrim(coalesce(v_venda->>'forma_pagamento', '')), 100);
    v_forma_id := null;
    if v_forma <> '' then
      insert into formas_pagamento (owner_id, nome) values (v_owner, v_forma) on conflict (owner_id, nome) do nothing;
      select id into v_forma_id from formas_pagamento where owner_id = v_owner and nome = v_forma;
    end if;

    insert into vendas (
      owner_id, cliente_id, cliente_nome, data, canal, canal_id, forma_pagamento, forma_pagamento_id,
      tipo_pagamento, valor_total, desconto, custo_total, status, observacoes, importado_ref
    ) values (
      v_owner, v_cliente_id, nullif(v_cliente, ''), v_data, nullif(v_canal, ''), v_canal_id,
      nullif(v_forma, ''), v_forma_id, 'a_vista', v_total, 0,
      greatest(coalesce((v_venda->>'custo_total')::numeric, 0), 0), 'concluida', 'Importada do VendaMax', v_ref
    ) returning id into v_venda_id;

    for v_item in select * from jsonb_array_elements(v_venda->'itens') loop
      v_nome := left(btrim(coalesce(v_item->>'nome', '')), 200);
      v_base := left(btrim(coalesce(v_item->>'nome_base', '')), 200);
      v_variacao := left(btrim(coalesce(v_item->>'variacao', '')), 200);
      if v_nome = '' then raise exception 'Item sem nome (%).', v_ref; end if;
      if coalesce((v_item->>'quantidade')::integer, 0) <= 0 then raise exception 'Item com quantidade inválida (%).', v_ref; end if;

      -- vincula ao produto pelo nome completo; se não achar, pelo nome sem a "(variação)"
      v_produto_id := null;
      v_variacao_id := null;
      select id into v_produto_id from produtos
        where owner_id = v_owner and lower(btrim(nome)) = lower(v_nome) limit 1;
      if v_produto_id is null and v_base <> '' then
        select id into v_produto_id from produtos
          where owner_id = v_owner and lower(btrim(nome)) = lower(v_base) limit 1;
        if v_produto_id is not null and v_variacao <> '' then
          select id into v_variacao_id from produto_variacoes
            where owner_id = v_owner and produto_id = v_produto_id
              and lower(btrim(nome_combinacao)) = lower(v_variacao) limit 1;
        end if;
      end if;
      if v_produto_id is null then v_sem_produto := v_sem_produto + 1; end if;

      insert into venda_itens (
        owner_id, venda_id, produto_id, variacao_id, produto_nome, quantidade, preco_unitario, custo_unitario
      ) values (
        v_owner, v_venda_id, v_produto_id, v_variacao_id, v_nome,
        (v_item->>'quantidade')::integer,
        greatest(coalesce((v_item->>'preco_unitario')::numeric, 0), 0),
        greatest(coalesce((v_item->>'custo_unitario')::numeric, 0), 0)
      );
    end loop;

    if v_total > 0 then
      insert into lancamentos_caixa (
        owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
      ) values (
        v_owner, v_venda_id, 'entrada', 'manual', 'Venda',
        'Venda' || case when v_cliente <> '' then ' — ' || v_cliente else '' end,
        v_total, v_data, true, true
      );
    end if;

    v_criadas := v_criadas + 1;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'ignoradas', v_ignoradas, 'itens_sem_produto', v_sem_produto);
end;
$$;

-- ---------------------------------------------------------------------------
-- lançamentos de caixa (o que não é venda):
-- [{ ref, data, tipo, origem, categoria, descricao, valor, produto_nome }]
-- ---------------------------------------------------------------------------
create or replace function importar_lancamentos(p_itens jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_item jsonb;
  v_ref text;
  v_tipo text;
  v_origem text;
  v_valor numeric;
  v_produto text;
  v_produto_id uuid;
  v_linhas integer;
  v_criados integer := 0;
  v_ignorados integer := 0;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'Lista de lançamentos inválida.'; end if;
  if jsonb_array_length(p_itens) > 5000 then raise exception 'No máximo 5000 lançamentos por importação.'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ref := btrim(coalesce(v_item->>'ref', ''));
    if v_ref = '' then raise exception 'Lançamento sem identificação de origem.'; end if;

    v_tipo := v_item->>'tipo';
    if v_tipo not in ('entrada', 'saida') then raise exception 'Tipo de lançamento inválido.'; end if;
    v_origem := coalesce(v_item->>'origem', 'gasto');
    if v_origem not in ('compra', 'gasto', 'manual') then raise exception 'Origem de lançamento inválida.'; end if;
    v_valor := coalesce((v_item->>'valor')::numeric, 0);
    if v_valor <= 0 then continue; end if;

    v_produto_id := null;
    v_produto := left(btrim(coalesce(v_item->>'produto_nome', '')), 200);
    if v_produto <> '' then
      select id into v_produto_id from produtos
        where owner_id = v_owner and lower(btrim(nome)) = lower(v_produto) limit 1;
    end if;

    insert into lancamentos_caixa (
      owner_id, produto_id, tipo, origem, categoria, descricao, valor, data,
      afeta_lucro, afeta_caixa, importado_ref
    ) values (
      v_owner, v_produto_id, v_tipo::lancamento_tipo, v_origem::lancamento_origem,
      left(coalesce(nullif(btrim(v_item->>'categoria'), ''), 'Outros'), 100),
      left(btrim(coalesce(v_item->>'descricao', 'Importado')), 300),
      v_valor, (v_item->>'data')::date,
      -- compra de estoque não é despesa do mês: o custo entra no lucro quando o produto é vendido
      v_origem <> 'compra', true, 'vendamax:' || v_ref
    )
    on conflict (owner_id, importado_ref) where importado_ref is not null do nothing;

    get diagnostics v_linhas = row_count;
    if v_linhas = 1 then v_criados := v_criados + 1; else v_ignorados := v_ignorados + 1; end if;
  end loop;

  return jsonb_build_object('criados', v_criados, 'ignorados', v_ignorados);
end;
$$;
