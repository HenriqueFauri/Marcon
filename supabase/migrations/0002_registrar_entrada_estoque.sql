-- Registrar uma entrada de estoque (compra) atualiza, na mesma transação:
--   1. produtos.estoque_atual / produto_variacoes.estoque (soma)
--   2. o custo médio ponderado (soma de valores / soma de quantidades)
--   3. movimentos_estoque (histórico, nunca sobrescrito)
--   4. lancamentos_caixa (saída de caixa vinculada, pra nunca ficar órfã)
--
-- Quando o produto tem variações, o estoque do produto-pai NÃO é usado
-- (a UI soma produto_variacoes.estoque via view produtos_com_estoque) —
-- decisão deliberada depois do bug encontrado no VendaMax, onde os dois
-- números coexistiam e um sobrescrevia o outro sem avisar.

create or replace function registrar_entrada_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_data date default current_date,
  p_fornecedor_nome text default null,
  p_observacoes text default null
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
begin
  select * into v_produto from produtos where id = p_produto_id and owner_id = auth.uid();
  if not found then
    raise exception 'produto não encontrado';
  end if;
  if p_quantidade <= 0 then
    raise exception 'quantidade precisa ser maior que zero';
  end if;

  insert into movimentos_estoque (
    owner_id, produto_id, variacao_id, produto_nome, tipo,
    quantidade, valor_unitario, data, fornecedor_nome, observacoes
  ) values (
    auth.uid(), p_produto_id, p_variacao_id, v_produto.nome, 'compra',
    p_quantidade, p_valor_unitario, p_data, p_fornecedor_nome, p_observacoes
  )
  returning id into v_movimento_id;

  v_nome_lancamento := 'Entrada de estoque: ' || v_produto.nome;

  insert into lancamentos_caixa (
    owner_id, produto_id, movimento_estoque_id, tipo, origem,
    categoria, descricao, valor, data, afeta_lucro, afeta_caixa
  ) values (
    auth.uid(), p_produto_id, v_movimento_id, 'saida', 'compra',
    'Fornecimento', v_nome_lancamento, p_quantidade * p_valor_unitario, p_data, false, true
  );

  if p_variacao_id is not null then
    select estoque, coalesce(custo, v_produto.custo) into v_estoque_atual, v_custo_atual
      from produto_variacoes where id = p_variacao_id and owner_id = auth.uid();
    if not found then
      raise exception 'variação não encontrada';
    end if;

    update produto_variacoes
      set estoque = v_estoque_atual + p_quantidade,
          custo = round(
            ((v_estoque_atual * coalesce(v_custo_atual, 0)) + (p_quantidade * p_valor_unitario))
            / nullif(v_estoque_atual + p_quantidade, 0),
            2
          )
      where id = p_variacao_id and owner_id = auth.uid();
  else
    update produtos
      set estoque_atual = estoque_atual + p_quantidade,
          custo = round(
            ((estoque_atual * custo) + (p_quantidade * p_valor_unitario))
            / nullif(estoque_atual + p_quantidade, 0),
            2
          ),
          updated_at = now()
      where id = p_produto_id and owner_id = auth.uid();
  end if;

  return v_movimento_id;
end;
$$;

-- estoque total de um produto: soma das variações quando ele tem variações,
-- senão o campo direto. Vista única pra nunca precisar decidir isso na UI.
create or replace view produtos_com_estoque
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
  end as custo_max
from produtos p
left join (
  select produto_id, sum(estoque) as estoque_total, min(custo) as custo_min, max(custo) as custo_max
  from produto_variacoes
  group by produto_id
) v on v.produto_id = p.id;
