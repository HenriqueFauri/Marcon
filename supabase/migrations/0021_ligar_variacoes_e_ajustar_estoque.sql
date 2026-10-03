-- Importar sem deixar o estoque desencontrar, e ajustar o estoque sem mexer no caixa.
--
-- 1. normalizar_nome / achar_produto_do_item / achar_variacao: ligam o nome de um item ao
--    produto e à variação ignorando acento, maiúscula e pontuação, por palavras inteiras
--    (a variação "P" não casa com "Polo"). A mais específica vence e empate não é adivinhado.
-- 2. importar_vendas passa a ligar o item à variação (antes só ao produto, e por nome exato).
-- 3. cancelar_venda tenta ligar itens que ficaram sem produto ou sem variação (vendas importadas
--    antes desta migration) antes de devolver o estoque.
-- 4. ajustar_estoque: corrige a quantidade para o valor real, sem caixa e sem mexer no custo.

-- ---------------------------------------------------------------------------
-- 1. ligação por nome
-- ---------------------------------------------------------------------------
create or replace function normalizar_nome(t text) returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

-- produto do dono logado cujo nome é o do item ou o do item sem a "(variação)" no fim
create or replace function achar_produto_do_item(p_nome text) returns uuid
language sql
stable
set search_path = public
as $$
  select id from produtos
  where owner_id = auth.uid()
    and normalizar_nome(nome) <> ''
    and normalizar_nome(nome) in (
      normalizar_nome(p_nome),
      normalizar_nome(regexp_replace(coalesce(p_nome, ''), '\s*\([^)]*\)\s*$', ''))
    )
  order by (normalizar_nome(nome) = normalizar_nome(p_nome)) desc
  limit 1;
$$;

-- variação do produto citada no texto: a de nome mais longo, só se não houver empate
create or replace function achar_variacao(p_produto uuid, p_texto text) returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when count(*) = 1 or (array_agg(tamanho order by tamanho desc))[1] > (array_agg(tamanho order by tamanho desc))[2]
      then (array_agg(id order by tamanho desc))[1]
  end
  from (
    select id, length(normalizar_nome(nome_combinacao)) as tamanho
    from produto_variacoes
    where owner_id = auth.uid() and produto_id = p_produto
      and normalizar_nome(nome_combinacao) <> ''
      and position((' ' || normalizar_nome(nome_combinacao) || ' ') in (' ' || normalizar_nome(p_texto) || ' ')) > 0
  ) achadas;
$$;

-- ---------------------------------------------------------------------------
-- 2. importar_vendas liga a variação
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
      greatest(coalesce((v_venda->>'custo_total')::numeric, 0), 0), 'concluida', null, v_ref
    ) returning id into v_venda_id;

    for v_item in select * from jsonb_array_elements(v_venda->'itens') loop
      v_nome := left(btrim(coalesce(v_item->>'nome', '')), 200);
      v_base := left(btrim(coalesce(v_item->>'nome_base', '')), 200);
      v_variacao := left(btrim(coalesce(v_item->>'variacao', '')), 200);
      if v_nome = '' then raise exception 'Item sem nome (%).', v_ref; end if;
      if coalesce((v_item->>'quantidade')::integer, 0) <= 0 then raise exception 'Item com quantidade inválida (%).', v_ref; end if;

      -- vincula ao produto pelo nome (sem acento nem maiúscula) e, se o produto tem variações,
      -- à variação: pelo campo "variação" do relatório ou, se não bater, pelo nome do item
      v_produto_id := achar_produto_do_item(v_nome);
      if v_produto_id is null and v_base <> '' then
        v_produto_id := achar_produto_do_item(v_base);
      end if;
      v_variacao_id := null;
      if v_produto_id is not null
         and exists (select 1 from produtos where id = v_produto_id and owner_id = v_owner and tem_variacoes) then
        if v_variacao <> '' then
          select id into v_variacao_id from produto_variacoes
            where owner_id = v_owner and produto_id = v_produto_id
              and normalizar_nome(nome_combinacao) = normalizar_nome(v_variacao) limit 1;
        end if;
        if v_variacao_id is null then
          v_variacao_id := achar_variacao(v_produto_id, v_nome);
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
        'Venda' || case when v_cliente <> '' then ' · ' || v_cliente else '' end,
        v_total, v_data, true, true
      );
    end if;

    v_criadas := v_criadas + 1;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'ignoradas', v_ignoradas, 'itens_sem_produto', v_sem_produto);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. cancelar_venda religa o que ficou solto antes de devolver o estoque
-- ---------------------------------------------------------------------------
create or replace function cancelar_venda(p_venda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_item venda_itens%rowtype;
  v_produto produtos%rowtype;
  v_produto_id uuid;
  v_variacao_id uuid;
  v_recebido numeric;
  v_devolvidos integer := 0;
  v_sem_ligacao integer := 0;
  v_sem_variacao integer := 0;
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

  -- devolve o estoque, contando o que voltou e o que não deu para ligar
  for v_item in select * from venda_itens where venda_id = p_venda_id and owner_id = auth.uid()
  loop
    v_produto_id := v_item.produto_id;
    v_variacao_id := v_item.variacao_id;

    -- item solto (venda importada): tenta ligar pelo nome
    if v_produto_id is null then
      v_produto_id := achar_produto_do_item(v_item.produto_nome);
    end if;
    if v_variacao_id is null and v_produto_id is not null then
      select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
      if found and v_produto.tem_variacoes then
        v_variacao_id := achar_variacao(v_produto_id, v_item.produto_nome);
      end if;
    end if;

    if v_variacao_id is not null then
      update produto_variacoes set estoque = estoque + v_item.quantidade
        where id = v_variacao_id and owner_id = auth.uid();
      if found then v_devolvidos := v_devolvidos + 1; else v_sem_ligacao := v_sem_ligacao + 1; end if;
    elsif v_produto_id is not null then
      select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
      if not found then
        v_sem_ligacao := v_sem_ligacao + 1;
      elsif v_produto.tem_variacoes then
        v_sem_variacao := v_sem_variacao + 1;
      else
        update produtos set estoque_atual = estoque_atual + v_item.quantidade, updated_at = now()
          where id = v_produto_id and owner_id = auth.uid();
        v_devolvidos := v_devolvidos + 1;
      end if;
    else
      v_sem_ligacao := v_sem_ligacao + 1;
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
      'Estorno de venda cancelada' || case when v_venda.cliente_nome is not null then ' · ' || v_venda.cliente_nome else '' end,
      v_recebido, current_date, true, true
    );
  end if;

  -- o gasto da entrega (motoboy etc.) também volta para o caixa
  if coalesce(v_venda.outros_gastos, 0) > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_venda_id, 'entrada', 'ajuste', 'Estorno',
      'Estorno do gasto de venda cancelada' || case when v_venda.cliente_nome is not null then ' · ' || v_venda.cliente_nome else '' end,
      v_venda.outros_gastos, current_date, false, true
    );
  end if;

  delete from parcelas
    where venda_id = p_venda_id and owner_id = auth.uid() and status <> 'pago';

  update vendas set status = 'cancelada' where id = p_venda_id and owner_id = auth.uid();

  return jsonb_build_object(
    'devolvidos', v_devolvidos,
    'sem_ligacao', v_sem_ligacao,
    'sem_variacao', v_sem_variacao
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. ajustar estoque para a quantidade real
-- ---------------------------------------------------------------------------
-- Para quando a contagem do app não bate com a prateleira (venda importada, erro de digitação,
-- perda). Calcula a diferença, registra no histórico (tipo 'ajuste', quantidade com sinal) e
-- não mexe no caixa nem no custo. Devolve a diferença aplicada.
create or replace function ajustar_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_novo_estoque integer,
  p_observacoes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_variacao produto_variacoes%rowtype;
  v_atual integer;
  v_diferenca integer;
  v_nome text;
  v_custo numeric;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_novo_estoque is null or p_novo_estoque < 0 then
    raise exception 'informe a quantidade que você tem agora (zero ou mais)';
  end if;

  select * into v_produto from produtos
    where id = p_produto_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'produto não encontrado';
  end if;

  if v_produto.tem_variacoes then
    if p_variacao_id is null then
      raise exception 'escolha a variação de %', v_produto.nome;
    end if;
    select * into v_variacao from produto_variacoes
      where id = p_variacao_id and produto_id = p_produto_id and owner_id = auth.uid()
      for update;
    if not found then
      raise exception 'variação não encontrada para %', v_produto.nome;
    end if;
    v_atual := v_variacao.estoque;
    v_nome := v_produto.nome || ' — ' || v_variacao.nome_combinacao;
    v_custo := coalesce(v_variacao.custo, v_produto.custo);
  else
    v_atual := v_produto.estoque_atual;
    v_nome := v_produto.nome;
    v_custo := v_produto.custo;
  end if;

  v_diferenca := p_novo_estoque - v_atual;
  if v_diferenca = 0 then
    raise exception 'o estoque já está com % unidade(s)', v_atual;
  end if;

  if v_produto.tem_variacoes then
    update produto_variacoes set estoque = p_novo_estoque
      where id = p_variacao_id and owner_id = auth.uid();
  else
    update produtos set estoque_atual = p_novo_estoque, updated_at = now()
      where id = p_produto_id and owner_id = auth.uid();
  end if;

  insert into movimentos_estoque (
    owner_id, produto_id, variacao_id, produto_nome, tipo, quantidade, valor_unitario, data, observacoes
  ) values (
    auth.uid(), p_produto_id, case when v_produto.tem_variacoes then p_variacao_id else null end,
    v_nome, 'ajuste', v_diferenca, v_custo, current_date,
    'Ajuste de contagem: de ' || v_atual || ' para ' || p_novo_estoque
      || case when nullif(trim(coalesce(p_observacoes, '')), '') is not null then ' · ' || trim(p_observacoes) else '' end
  );

  return v_diferenca;
end;
$$;
