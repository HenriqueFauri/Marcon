-- 1. Outros gastos da venda (motoboy, embalagem, taxa...): dinheiro que o lojista gasta
--    para entregar aquela venda. Entram no custo da venda (então baixam o lucro em
--    todas as telas) e saem do caixa na data da venda. Ficam guardados à parte em
--    vendas.outros_gastos para a tela da venda mostrar de onde veio.
-- 2. Importação limpa: produtos e vendas importados não levam mais textos como
--    "Saldo inicial (importação)" e "Importada do VendaMax". Os que já foram
--    importados com esses textos são limpos aqui.

alter table vendas add column outros_gastos numeric(12, 2) not null default 0 check (outros_gastos >= 0);

drop function if exists registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid);

create or replace function registrar_venda(
  p_cliente_id uuid,
  p_cliente_nome text,
  p_itens jsonb,
  p_desconto numeric,
  p_tipo_pagamento venda_tipo_pagamento,
  p_forma_pagamento text,
  p_canal text,
  p_numero_parcelas integer default 1,
  p_primeiro_vencimento date default current_date,
  p_data date default current_date,
  p_canal_id uuid default null,
  p_forma_pagamento_id uuid default null,
  p_outros_gastos numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_produto produtos%rowtype;
  v_variacao produto_variacoes%rowtype;
  v_venda_id uuid;
  v_valor_total numeric := 0;
  v_custo_total numeric := 0;
  v_desconto numeric := coalesce(p_desconto, 0);
  v_outros numeric := coalesce(p_outros_gastos, 0);
  v_liquido numeric;
  v_qtd integer;
  v_preco numeric;
  v_produto_id uuid;
  v_variacao_id uuid;
  v_custo_item numeric;
  v_nome_item text;
  v_parcelas integer := greatest(coalesce(p_numero_parcelas, 1), 1);
  v_valor_parcela numeric;
  v_resto numeric;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'a venda precisa de pelo menos um item';
  end if;
  if v_desconto < 0 then
    raise exception 'o desconto não pode ser negativo';
  end if;
  if v_outros < 0 then
    raise exception 'os outros gastos não podem ser negativos';
  end if;
  if v_parcelas > 60 then
    raise exception 'no máximo 60 parcelas';
  end if;

  -- a venda nasce zerada e os totais são preenchidos no fim; como tudo roda
  -- numa transação só, qualquer exceção abaixo desfaz a venda inteira
  insert into vendas (
    owner_id, cliente_id, cliente_nome, data, canal, forma_pagamento, canal_id, forma_pagamento_id,
    tipo_pagamento, valor_total, desconto, custo_total, outros_gastos
  ) values (
    auth.uid(), p_cliente_id, p_cliente_nome, coalesce(p_data, current_date), p_canal, p_forma_pagamento,
    p_canal_id, p_forma_pagamento_id, p_tipo_pagamento, 0, v_desconto, 0, v_outros
  )
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::uuid;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_preco := (v_item ->> 'preco_unitario')::numeric;

    if v_qtd is null or v_qtd <= 0 then
      raise exception 'quantidade inválida';
    end if;
    if v_preco is null or v_preco < 0 then
      raise exception 'preço inválido';
    end if;

    select * into v_produto from produtos
      where id = v_produto_id and owner_id = auth.uid()
      for update;
    if not found then
      raise exception 'produto não encontrado';
    end if;

    if v_variacao_id is not null then
      select * into v_variacao from produto_variacoes
        where id = v_variacao_id and produto_id = v_produto_id and owner_id = auth.uid()
        for update;
      if not found then
        raise exception 'variação não encontrada para %', v_produto.nome;
      end if;
      if v_variacao.estoque < v_qtd then
        raise exception 'estoque insuficiente para % (%): tem %, pediu %',
          v_produto.nome, v_variacao.nome_combinacao, v_variacao.estoque, v_qtd;
      end if;
      v_custo_item := coalesce(v_variacao.custo, v_produto.custo);
      v_nome_item := v_produto.nome || ' — ' || v_variacao.nome_combinacao;

      update produto_variacoes set estoque = estoque - v_qtd
        where id = v_variacao_id and owner_id = auth.uid();
    else
      if v_produto.tem_variacoes then
        raise exception 'escolha a variação de %', v_produto.nome;
      end if;
      if v_produto.estoque_atual < v_qtd then
        raise exception 'estoque insuficiente para %: tem %, pediu %',
          v_produto.nome, v_produto.estoque_atual, v_qtd;
      end if;
      v_custo_item := v_produto.custo;
      v_nome_item := v_produto.nome;

      update produtos set estoque_atual = estoque_atual - v_qtd, updated_at = now()
        where id = v_produto_id and owner_id = auth.uid();
    end if;

    insert into venda_itens (
      owner_id, venda_id, produto_id, variacao_id, produto_nome, quantidade, preco_unitario, custo_unitario
    ) values (
      auth.uid(), v_venda_id, v_produto_id, v_variacao_id, v_nome_item, v_qtd, v_preco, v_custo_item
    );

    v_valor_total := v_valor_total + (v_qtd * v_preco);
    v_custo_total := v_custo_total + (v_qtd * v_custo_item);
  end loop;

  if v_desconto > v_valor_total then
    raise exception 'o desconto não pode ser maior que o total da venda';
  end if;
  v_liquido := v_valor_total - v_desconto;

  update vendas
    set valor_total = v_liquido, custo_total = v_custo_total + v_outros
    where id = v_venda_id;

  -- o gasto da entrega sai do caixa na data da venda, à vista ou a prazo;
  -- não afeta o lucro de novo porque já está no custo da venda
  if v_outros > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), v_venda_id, 'saida', 'gasto', 'Outros gastos da venda',
      'Gasto da venda' || case when p_cliente_nome is not null then ' — ' || p_cliente_nome else '' end,
      v_outros, coalesce(p_data, current_date), false, true
    );
  end if;

  if p_tipo_pagamento = 'a_vista' then
    if v_liquido > 0 then
      insert into lancamentos_caixa (
        owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
      ) values (
        auth.uid(), v_venda_id, 'entrada', 'manual', 'Venda',
        'Venda' || case when p_cliente_nome is not null then ' — ' || p_cliente_nome else '' end,
        v_liquido, coalesce(p_data, current_date), true, true
      );
    end if;
  else
    v_valor_parcela := trunc(v_liquido / v_parcelas, 2);
    v_resto := v_liquido - (v_valor_parcela * v_parcelas);
    for i in 1..v_parcelas loop
      insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status)
      values (
        auth.uid(), v_venda_id, i,
        v_valor_parcela + case when i = v_parcelas then v_resto else 0 end,
        -- mesmo dia nos meses seguintes (em vez de +30 dias, que escorrega a data)
        (coalesce(p_primeiro_vencimento, current_date) + ((i - 1) * interval '1 month'))::date,
        'pendente'
      );
    end loop;
  end if;

  return v_venda_id;
end;
$$;

-- cancelar a venda desfaz tudo: devolve o que o cliente pagou e também o gasto da entrega
create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_item venda_itens%rowtype;
  v_recebido numeric;
begin
  select * into v_venda from vendas
    where id = p_venda_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'venda não encontrada';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'essa venda já está cancelada';
  end if;

  -- devolve o estoque (se o produto/variação ainda existir)
  for v_item in select * from venda_itens where venda_id = p_venda_id and owner_id = auth.uid()
  loop
    if v_item.variacao_id is not null then
      update produto_variacoes set estoque = estoque + v_item.quantidade
        where id = v_item.variacao_id and owner_id = auth.uid();
    elsif v_item.produto_id is not null then
      update produtos set estoque_atual = estoque_atual + v_item.quantidade, updated_at = now()
        where id = v_item.produto_id and owner_id = auth.uid();
    end if;
  end loop;

  -- estorna o que já entrou no caixa por essa venda (à vista ou parcelas pagas)
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0) into v_recebido
    from lancamentos_caixa
    where venda_id = p_venda_id and owner_id = auth.uid()
      and origem <> 'gasto'; -- o gasto da entrega é estornado à parte, logo abaixo

  if v_recebido > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_venda_id, 'saida', 'ajuste', 'Estorno',
      'Estorno de venda cancelada' || case when v_venda.cliente_nome is not null then ' — ' || v_venda.cliente_nome else '' end,
      v_recebido, current_date, true, true
    );
  end if;

  -- o gasto da entrega (motoboy etc.) também volta para o caixa
  if coalesce(v_venda.outros_gastos, 0) > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_venda_id, 'entrada', 'ajuste', 'Estorno',
      'Estorno do gasto de venda cancelada' || case when v_venda.cliente_nome is not null then ' — ' || v_venda.cliente_nome else '' end,
      v_venda.outros_gastos, current_date, false, true
    );
  end if;

  delete from parcelas
    where venda_id = p_venda_id and owner_id = auth.uid() and status <> 'pago';

  update vendas set status = 'cancelada' where id = p_venda_id and owner_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- importação sem textos de origem
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
        v_owner, v_produto_id, v_nome, 'ajuste', v_estoque, v_custo, null
      );
    end if;

    v_criados := v_criados + 1;
  end loop;

  return jsonb_build_object('criados', v_criados, 'ignorados', v_ignorados);
end;
$$;

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
      greatest(coalesce((v_venda->>'custo_total')::numeric, 0), 0), 'concluida', null, v_ref
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

update movimentos_estoque set observacoes = null where observacoes = 'Saldo inicial (importação)';
update vendas set observacoes = null where observacoes = 'Importada do VendaMax';
