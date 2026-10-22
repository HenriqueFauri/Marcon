-- F33: registrar_pedido_compra grava o pedido, rateia o frete pelo valor de cada linha, dá entrada
-- no estoque de cada item pelo custo já com o frete (reaproveita registrar_entrada_estoque, que
-- calcula o custo médio) e lança UMA saída no caixa com itens + frete.
--
-- p_itens: [{ "produto_id": uuid, "variacao_id": uuid|null, "quantidade": int, "valor_unitario": numeric }]

create function registrar_pedido_compra(
  p_fornecedor_id uuid,
  p_data date,
  p_frete numeric,
  p_itens jsonb,
  p_observacoes text default null,
  p_afeta_caixa boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date := coalesce(p_data, hoje_br());
  v_frete numeric := round(coalesce(p_frete, 0), 2);
  v_fornecedor_nome text;
  v_pedido_id uuid;
  v_item jsonb;
  v_n integer;
  v_i integer := 0;
  v_qtd integer;
  v_valor numeric;
  v_linha numeric;
  v_total numeric := 0;
  v_total_qtd numeric := 0;
  v_frete_restante numeric;
  v_frete_linha numeric;
  v_custo_final numeric;
  v_produto_nome text;
  v_variacao_id uuid;
  v_produto_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if v_frete < 0 then
    raise exception 'o frete não pode ser negativo';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'adicione pelo menos um item ao pedido';
  end if;
  v_n := jsonb_array_length(p_itens);
  if v_n > 100 then
    raise exception 'o pedido aceita até 100 itens';
  end if;

  if p_fornecedor_id is not null then
    select nome into v_fornecedor_nome from fornecedores
      where id = p_fornecedor_id and owner_id = auth.uid();
    if not found then
      raise exception 'fornecedor não encontrado';
    end if;
  end if;

  -- 1ª passada: valida e soma, para poder ratear o frete
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_valor := (v_item ->> 'valor_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'a quantidade de cada item precisa ser maior que zero';
    end if;
    if v_valor is null or v_valor < 0 then
      raise exception 'o preço de cada item não pode ser negativo';
    end if;
    v_total := v_total + v_qtd * v_valor;
    v_total_qtd := v_total_qtd + v_qtd;
  end loop;

  insert into pedidos_compra (owner_id, fornecedor_id, fornecedor_nome, data, frete, total_itens, observacoes)
  values (auth.uid(), p_fornecedor_id, v_fornecedor_nome, v_data, v_frete, round(v_total, 2), nullif(btrim(p_observacoes), ''))
  returning id into v_pedido_id;

  v_frete_restante := v_frete;

  -- 2ª passada: frete proporcional ao valor da linha (à quantidade se o pedido for todo de preço zero);
  -- a última linha leva o centavo que sobrou do arredondamento
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_i := v_i + 1;
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::uuid;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_valor := (v_item ->> 'valor_unitario')::numeric;
    v_linha := v_qtd * v_valor;

    if v_i = v_n then
      v_frete_linha := v_frete_restante;
    elsif v_total > 0 then
      v_frete_linha := round(v_frete * v_linha / v_total, 2);
    else
      v_frete_linha := round(v_frete * v_qtd / v_total_qtd, 2);
    end if;
    v_frete_linha := least(v_frete_linha, v_frete_restante);
    v_frete_restante := v_frete_restante - v_frete_linha;

    v_custo_final := round(v_valor + v_frete_linha / v_qtd, 2);

    -- estoque e custo médio pela função de sempre (ela confere a posse do produto e da variação);
    -- o caixa é lançado uma vez só, abaixo
    perform registrar_entrada_estoque(
      p_produto_id => v_produto_id,
      p_variacao_id => v_variacao_id,
      p_quantidade => v_qtd,
      p_valor_unitario => v_custo_final,
      p_data => v_data,
      p_fornecedor_nome => v_fornecedor_nome,
      p_observacoes => 'Pedido de compra',
      p_fornecedor_id => p_fornecedor_id,
      p_afeta_caixa => false
    );

    select p.nome || coalesce(' — ' || pv.nome_combinacao, '') into v_produto_nome
      from produtos p
      left join produto_variacoes pv on pv.id = v_variacao_id and pv.owner_id = auth.uid()
      where p.id = v_produto_id and p.owner_id = auth.uid();

    insert into pedido_compra_itens (
      owner_id, pedido_id, produto_id, variacao_id, produto_nome, quantidade,
      valor_unitario, frete_rateado, custo_unitario_final
    ) values (
      auth.uid(), v_pedido_id, v_produto_id, v_variacao_id, v_produto_nome, v_qtd,
      round(v_valor, 2), v_frete_linha, v_custo_final
    );
  end loop;

  if coalesce(p_afeta_caixa, true) and round(v_total, 2) + v_frete > 0 then
    insert into lancamentos_caixa (
      owner_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), 'saida', 'compra', 'Fornecimento',
      'Pedido de compra' || coalesce(': ' || v_fornecedor_nome, ''),
      round(v_total, 2) + v_frete, v_data, false, true
    );
  end if;

  return v_pedido_id;
end;
$$;

revoke execute on function registrar_pedido_compra(uuid, date, numeric, jsonb, text, boolean) from public, anon;
grant execute on function registrar_pedido_compra(uuid, date, numeric, jsonb, text, boolean) to authenticated, service_role;
