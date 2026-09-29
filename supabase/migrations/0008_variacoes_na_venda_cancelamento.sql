-- Fase 4: correções de integridade e cancelamento de venda.
--
-- 1. registrar_venda passa a entender variações. Antes, um produto com
--    variações sempre falhava com "estoque insuficiente" (o estoque dele vive
--    em produto_variacoes, e a função olhava produtos.estoque_atual), e o custo
--    do item ignorava o custo da variação.
--    Também trava as linhas de estoque (FOR UPDATE) pra duas vendas simultâneas
--    não venderem a mesma unidade, valida quantidade/preço/desconto, e soma
--    itens repetidos na checagem de estoque (a checagem é feita já debitando).
-- 2. registrar_entrada_estoque recusa entrada sem variação num produto com
--    variações (o estoque ia pro campo do produto-pai, que a view ignora — o
--    dinheiro saía do caixa e o estoque "sumia") e confere que a variação é
--    mesmo daquele produto.
-- 3. cancelar_venda: devolve o estoque, estorna no caixa o que já tinha entrado
--    e remove as parcelas ainda não pagas. A venda fica marcada como
--    cancelada (histórico preservado, nada é apagado).
-- 4. produtos_com_estoque ganha valor_estoque (custo real de cada variação ×
--    estoque dela), pro "valor em estoque" do painel parar de usar o menor custo.

-- ---------------------------------------------------------------------------
-- 0. remove as sobrecargas antigas. A 0004 criou versões com parâmetros a mais
--    em vez de substituir as da 0002/0003, então as antigas (sem as correções
--    abaixo) continuavam existindo e chamáveis pela API.
-- ---------------------------------------------------------------------------
drop function if exists registrar_entrada_estoque(uuid, uuid, integer, numeric, date, text, text);
drop function if exists registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date);

-- ---------------------------------------------------------------------------
-- 1. registrar_venda (mesma assinatura da 0004)
-- ---------------------------------------------------------------------------
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
  p_forma_pagamento_id uuid default null
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
  if v_parcelas > 60 then
    raise exception 'no máximo 60 parcelas';
  end if;

  -- a venda nasce zerada e os totais são preenchidos no fim; como tudo roda
  -- numa transação só, qualquer exceção abaixo desfaz a venda inteira
  insert into vendas (
    owner_id, cliente_id, cliente_nome, data, canal, forma_pagamento, canal_id, forma_pagamento_id,
    tipo_pagamento, valor_total, desconto, custo_total
  ) values (
    auth.uid(), p_cliente_id, p_cliente_nome, coalesce(p_data, current_date), p_canal, p_forma_pagamento,
    p_canal_id, p_forma_pagamento_id, p_tipo_pagamento, 0, v_desconto, 0
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
    set valor_total = v_liquido, custo_total = v_custo_total
    where id = v_venda_id;

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

-- ---------------------------------------------------------------------------
-- 2. registrar_entrada_estoque (mesma assinatura da 0004)
-- ---------------------------------------------------------------------------
create or replace function registrar_entrada_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_data date default current_date,
  p_fornecedor_nome text default null,
  p_observacoes text default null,
  p_fornecedor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_movimento_id uuid;
  v_nome_lancamento text;
  v_estoque_atual integer;
  v_custo_atual numeric;
  v_nome_variacao text;
begin
  select * into v_produto from produtos
    where id = p_produto_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'produto não encontrado';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'quantidade precisa ser maior que zero';
  end if;
  if p_valor_unitario is null or p_valor_unitario < 0 then
    raise exception 'o preço unitário não pode ser negativo';
  end if;

  if p_variacao_id is not null then
    select estoque, coalesce(custo, v_produto.custo), nome_combinacao
      into v_estoque_atual, v_custo_atual, v_nome_variacao
      from produto_variacoes
      where id = p_variacao_id and produto_id = p_produto_id and owner_id = auth.uid()
      for update;
    if not found then
      raise exception 'variação não encontrada';
    end if;
  elsif v_produto.tem_variacoes then
    raise exception 'escolha a variação que está entrando no estoque';
  end if;

  insert into movimentos_estoque (
    owner_id, produto_id, variacao_id, produto_nome, tipo,
    quantidade, valor_unitario, data, fornecedor_nome, fornecedor_id, observacoes
  ) values (
    auth.uid(), p_produto_id, p_variacao_id,
    v_produto.nome || coalesce(' — ' || v_nome_variacao, ''), 'compra',
    p_quantidade, p_valor_unitario, coalesce(p_data, current_date), p_fornecedor_nome, p_fornecedor_id, p_observacoes
  )
  returning id into v_movimento_id;

  v_nome_lancamento := 'Entrada de estoque: ' || v_produto.nome || coalesce(' — ' || v_nome_variacao, '');

  if p_quantidade * p_valor_unitario > 0 then
    insert into lancamentos_caixa (
      owner_id, produto_id, movimento_estoque_id, tipo, origem,
      categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_produto_id, v_movimento_id, 'saida', 'compra',
      'Fornecimento', v_nome_lancamento, p_quantidade * p_valor_unitario, coalesce(p_data, current_date), false, true
    );
  end if;

  if p_variacao_id is not null then
    update produto_variacoes
      set estoque = v_estoque_atual + p_quantidade,
          custo = round(
            ((greatest(v_estoque_atual, 0) * coalesce(v_custo_atual, 0)) + (p_quantidade * p_valor_unitario))
            / nullif(greatest(v_estoque_atual, 0) + p_quantidade, 0),
            2
          )
      where id = p_variacao_id and owner_id = auth.uid();
  else
    update produtos
      set estoque_atual = estoque_atual + p_quantidade,
          custo = round(
            ((greatest(estoque_atual, 0) * custo) + (p_quantidade * p_valor_unitario))
            / nullif(greatest(estoque_atual, 0) + p_quantidade, 0),
            2
          ),
          updated_at = now()
      where id = p_produto_id and owner_id = auth.uid();
  end if;

  return v_movimento_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. cancelar_venda
-- ---------------------------------------------------------------------------
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
    where venda_id = p_venda_id and owner_id = auth.uid();

  if v_recebido > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_venda_id, 'saida', 'ajuste', 'Estorno',
      'Estorno de venda cancelada' || case when v_venda.cliente_nome is not null then ' — ' || v_venda.cliente_nome else '' end,
      v_recebido, current_date, true, true
    );
  end if;

  delete from parcelas
    where venda_id = p_venda_id and owner_id = auth.uid() and status <> 'pago';

  update vendas set status = 'cancelada' where id = p_venda_id and owner_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. produtos_com_estoque com valor_estoque
-- (drop + create: a view antiga expandiu p.* antes de produtos ganhar
-- fornecedor_id, então "create or replace" não consegue reordenar as colunas)
-- ---------------------------------------------------------------------------
drop view if exists produtos_com_estoque;

create view produtos_com_estoque
with (security_invoker = true) as
select
  p.*,
  case
    when p.tem_variacoes then coalesce(v.estoque_total, 0)
    else p.estoque_atual
  end as estoque_total,
  case
    when p.tem_variacoes then coalesce(v.custo_min, p.custo)
    else p.custo
  end as custo_min,
  case
    when p.tem_variacoes then coalesce(v.custo_max, p.custo)
    else p.custo
  end as custo_max,
  case
    when p.tem_variacoes then coalesce(v.valor_estoque, 0)
    else greatest(p.estoque_atual, 0) * p.custo
  end as valor_estoque
from produtos p
left join (
  select
    pv.produto_id,
    sum(pv.estoque) as estoque_total,
    min(coalesce(pv.custo, pp.custo)) as custo_min,
    max(coalesce(pv.custo, pp.custo)) as custo_max,
    sum(greatest(pv.estoque, 0) * coalesce(pv.custo, pp.custo)) as valor_estoque
  from produto_variacoes pv
  join produtos pp on pp.id = pv.produto_id
  group by pv.produto_id
) v on v.produto_id = p.id;
