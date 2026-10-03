-- Cancelar venda de produto com variações devolve o estoque na variação certa.
--
-- Defeito: uma venda importada pode ter o item ligado só ao produto, sem a variação.
-- O cancelamento somava a quantidade no estoque do produto, que não conta quando o
-- produto tem variações (o total vem da soma das variações). O estoque não voltava e a
-- tela dizia que sim.
--
-- Correção: se o item não tem variação, procura a variação pelo nome do item (ex.:
-- "Relogio Tomi (Branco)" -> variação "Branco") e, se não houver certeza, avisa em vez
-- de calar (a comparação é por palavras inteiras: "P" não casa com "Polo"). A função passa a devolver um resumo do que aconteceu com o estoque.

drop function if exists cancelar_venda(uuid);

create function cancelar_venda(p_venda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_item venda_itens%rowtype;
  v_produto produtos%rowtype;
  v_variacao_id uuid;
  v_tamanhos integer[];
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
    if v_item.variacao_id is not null then
      update produto_variacoes set estoque = estoque + v_item.quantidade
        where id = v_item.variacao_id and owner_id = auth.uid();
      if found then v_devolvidos := v_devolvidos + 1; else v_sem_ligacao := v_sem_ligacao + 1; end if;
    elsif v_item.produto_id is not null then
      select * into v_produto from produtos where id = v_item.produto_id and owner_id = auth.uid();
      if not found then
        v_sem_ligacao := v_sem_ligacao + 1;
      elsif v_produto.tem_variacoes then
        -- item sem variação num produto com variações (venda importada): acha pelo nome do item,
        -- ficando com a mais específica (a de nome mais longo) e só se não houver empate
        select (array_agg(id order by tamanho desc))[1], array_agg(tamanho order by tamanho desc)
          into v_variacao_id, v_tamanhos
          from (
            select id, length(btrim(nome_combinacao)) as tamanho
              from produto_variacoes
              where produto_id = v_produto.id and owner_id = auth.uid()
                and btrim(nome_combinacao) <> ''
                and position((' ' || regexp_replace(lower(btrim(nome_combinacao)), '[^[:alnum:]]+', ' ', 'g') || ' ')
                  in (' ' || regexp_replace(lower(v_item.produto_nome), '[^[:alnum:]]+', ' ', 'g') || ' ')) > 0
              order by tamanho desc
              limit 2
          ) achadas;
        if v_variacao_id is not null and (cardinality(v_tamanhos) = 1 or v_tamanhos[1] > v_tamanhos[2]) then
          update produto_variacoes set estoque = estoque + v_item.quantidade where id = v_variacao_id;
          v_devolvidos := v_devolvidos + 1;
        else
          v_sem_variacao := v_sem_variacao + 1;
        end if;
      else
        update produtos set estoque_atual = estoque_atual + v_item.quantidade, updated_at = now()
          where id = v_item.produto_id and owner_id = auth.uid();
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
-- Conserto das vendas já canceladas com esse defeito
-- ---------------------------------------------------------------------------
-- Itens de venda cancelada, ligados a um produto com variações mas sem variação: o estoque
-- foi parar no campo do produto (que não conta). Move para a variação, só quando o nome do
-- item aponta para uma única variação (a de nome mais longo, sem empate). O resto fica como
-- está e pode ser ajustado à mão em Produtos.
do $$
declare
  r record;
  v_variacao_id uuid;
  v_tamanhos integer[];
begin
  for r in
    select i.id, i.owner_id, i.produto_id, i.produto_nome, i.quantidade
      from venda_itens i
      join vendas v on v.id = i.venda_id
      join produtos p on p.id = i.produto_id
      where v.status = 'cancelada'
        and i.variacao_id is null
        and p.tem_variacoes
  loop
    select (array_agg(id order by tamanho desc))[1], array_agg(tamanho order by tamanho desc)
      into v_variacao_id, v_tamanhos
      from (
        select id, length(btrim(nome_combinacao)) as tamanho
          from produto_variacoes
          where produto_id = r.produto_id and owner_id = r.owner_id
            and btrim(nome_combinacao) <> ''
            and position((' ' || regexp_replace(lower(btrim(nome_combinacao)), '[^[:alnum:]]+', ' ', 'g') || ' ')
                in (' ' || regexp_replace(lower(r.produto_nome), '[^[:alnum:]]+', ' ', 'g') || ' ')) > 0
          order by tamanho desc
          limit 2
      ) achadas;
    if v_variacao_id is not null and (cardinality(v_tamanhos) = 1 or v_tamanhos[1] > v_tamanhos[2]) then
      update produto_variacoes set estoque = estoque + r.quantidade where id = v_variacao_id;
      update produtos set estoque_atual = greatest(estoque_atual - r.quantidade, 0) where id = r.produto_id;
    end if;
  end loop;
end;
$$;
