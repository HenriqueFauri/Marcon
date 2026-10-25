-- Encomenda: vender produto sem estoque (ou além do estoque), com confirmação na Nova venda.
-- registrar_venda e registrar_venda_com_entrada ganham p_encomenda (default false). Só com
-- p_encomenda = true a venda passa do estoque, que fica negativo; sem ele (assistente do
-- WhatsApp via registrar_venda_como, e qualquer outra chamada) segue recusando como antes.
-- O resto é igual às versões anteriores (registrar_venda da 0018, com_entrada da 0052):
-- security definer com auth.uid() e set search_path = public, posse conferida no select de
-- produto e variação (owner_id = auth.uid()), gatilhos de posse (0031) e de limite do plano
-- (0013, 0032, 0063) na tabela vendas seguem valendo.
-- Idempotente: derruba a assinatura antiga (13 argumentos) se existir e recria com 14.
-- As chamadas posicionais com 13 argumentos (registrar_venda_como, com_entrada antiga)
-- continuam resolvendo para a nova, com p_encomenda = false.

drop function if exists registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric);

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
  p_outros_gastos numeric default 0,
  p_encomenda boolean default false
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
      -- encomenda: a pessoa confirmou vender além do estoque, que fica negativo
      if v_variacao.estoque < v_qtd and not coalesce(p_encomenda, false) then
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
      if v_produto.estoque_atual < v_qtd and not coalesce(p_encomenda, false) then
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

revoke execute on function registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric, boolean) from public, anon;
grant execute on function registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric, boolean) to authenticated, service_role;

drop function if exists registrar_venda_com_entrada(uuid, text, jsonb, numeric, text, text, numeric, integer, date, date, uuid, uuid, numeric);

create or replace function registrar_venda_com_entrada(
  p_cliente_id uuid,
  p_cliente_nome text,
  p_itens jsonb,
  p_desconto numeric,
  p_forma_pagamento text,
  p_canal text,
  p_entrada numeric,
  p_numero_parcelas integer default 1,
  p_primeiro_vencimento date default hoje_br(),
  p_data date default hoje_br(),
  p_canal_id uuid default null,
  p_forma_pagamento_id uuid default null,
  p_outros_gastos numeric default 0,
  p_encomenda boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_liquido numeric(12, 2);
  v_entrada numeric(12, 2) := round(coalesce(p_entrada, 0), 2);
  v_resto numeric(12, 2);
  v_parcelas integer := greatest(coalesce(p_numero_parcelas, 1), 1);
  v_valor_parcela numeric(12, 2);
  v_sobra numeric(12, 2);
  v_data date := coalesce(p_data, hoje_br());
  v_parcela_id uuid;
  v_lancamento_id uuid;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if v_entrada <= 0 then
    raise exception 'a entrada precisa ser maior que zero';
  end if;
  if v_parcelas > 60 then
    raise exception 'no máximo 60 parcelas';
  end if;
  if nullif(btrim(coalesce(p_cliente_nome, '')), '') is null and p_cliente_id is null then
    raise exception 'venda a prazo precisa de um cliente, pra saber de quem cobrar';
  end if;

  v_venda_id := registrar_venda(
    p_cliente_id, p_cliente_nome, p_itens, p_desconto, 'a_prazo', p_forma_pagamento, p_canal,
    v_parcelas, coalesce(p_primeiro_vencimento, v_data), v_data, p_canal_id, p_forma_pagamento_id, p_outros_gastos,
    coalesce(p_encomenda, false)
  );

  select valor_total into v_liquido from vendas where id = v_venda_id and owner_id = auth.uid();
  if v_entrada >= v_liquido then
    raise exception 'a entrada precisa ser menor que o total da venda; se foi tudo pago, registre à vista';
  end if;
  v_resto := v_liquido - v_entrada;

  -- as parcelas que a registrar_venda acabou de criar (ainda sem pagamento) dão lugar às novas
  delete from parcelas where venda_id = v_venda_id and owner_id = auth.uid();

  insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status, data_pagamento, entrada)
  values (auth.uid(), v_venda_id, 1, v_entrada, v_data, 'pago', v_data, true)
  returning id into v_parcela_id;

  insert into lancamentos_caixa (
    owner_id, venda_id, parcela_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
  ) values (
    auth.uid(), v_venda_id, v_parcela_id, 'entrada', 'manual', 'Venda',
    'Entrada da venda' || coalesce(' · ' || nullif(btrim(coalesce(p_cliente_nome, '')), ''), ''),
    v_entrada, v_data, true, true
  )
  returning id into v_lancamento_id;

  update parcelas set lancamento_caixa_id = v_lancamento_id where id = v_parcela_id and owner_id = auth.uid();

  v_valor_parcela := trunc(v_resto / v_parcelas, 2);
  v_sobra := v_resto - (v_valor_parcela * v_parcelas);
  for i in 1..v_parcelas loop
    insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status)
    values (
      auth.uid(), v_venda_id, i + 1,
      v_valor_parcela + case when i = v_parcelas then v_sobra else 0 end,
      (coalesce(p_primeiro_vencimento, v_data) + ((i - 1) * interval '1 month'))::date,
      'pendente'
    );
  end loop;

  return v_venda_id;
end;
$$;

revoke execute on function registrar_venda_com_entrada(uuid, text, jsonb, numeric, text, text, numeric, integer, date, date, uuid, uuid, numeric, boolean) from public, anon;
grant execute on function registrar_venda_com_entrada(uuid, text, jsonb, numeric, text, text, numeric, integer, date, date, uuid, uuid, numeric, boolean) to authenticated, service_role;
