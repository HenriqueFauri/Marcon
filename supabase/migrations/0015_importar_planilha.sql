-- Importação de planilhas (Excel/CSV), além dos relatórios do VendaMax.
--
-- importar_vendas passa a aceitar a origem de cada venda ('vendamax', o padrão, ou
-- 'planilha'). A origem entra na referência (importado_ref), então a mesma venda
-- importada de novo continua sem duplicar, e uma planilha nunca colide com um
-- relatório do VendaMax. O resto é igual à 0012.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendas' and column_name = 'importado_ref'
  ) then
    raise exception 'Aplique a migration 0012 (importação) antes da 0015.';
  end if;
end $$;

create or replace function importar_vendas(p_vendas jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_venda jsonb;
  v_item jsonb;
  v_origem text;
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
    v_origem := coalesce(nullif(btrim(v_venda->>'origem'), ''), 'vendamax');
    if v_origem not in ('vendamax', 'planilha') then raise exception 'Origem de venda inválida.'; end if;

    v_ref := btrim(coalesce(v_venda->>'ref', ''));
    if v_ref = '' then raise exception 'Venda sem identificação de origem.'; end if;
    v_ref := v_origem || ':' || v_ref;

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
      greatest(coalesce((v_venda->>'custo_total')::numeric, 0), 0), 'concluida',
      case v_origem when 'planilha' then 'Importada de planilha' else 'Importada do VendaMax' end,
      v_ref
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
