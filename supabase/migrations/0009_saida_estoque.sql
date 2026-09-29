-- Saída de estoque sem venda: perda/quebra, uso próprio/brinde e ajuste de
-- contagem. Baixa o estoque (do produto ou da variação) e deixa o registro no
-- histórico do produto (movimentos_estoque, tipo 'ajuste', quantidade negativa).
-- Não mexe no caixa: nenhum dinheiro entra nem sai.

create or replace function registrar_saida_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_motivo text,
  p_data date default current_date,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_variacao produto_variacoes%rowtype;
  v_movimento_id uuid;
  v_nome text;
  v_custo numeric;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'quantidade inválida';
  end if;
  if p_motivo not in ('perda', 'uso', 'ajuste') then
    raise exception 'motivo inválido';
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
    if v_variacao.estoque < p_quantidade then
      raise exception 'estoque insuficiente para % (%): tem %, pediu %',
        v_produto.nome, v_variacao.nome_combinacao, v_variacao.estoque, p_quantidade;
    end if;
    v_nome := v_produto.nome || ' — ' || v_variacao.nome_combinacao;
    v_custo := coalesce(v_variacao.custo, v_produto.custo);
    update produto_variacoes set estoque = estoque - p_quantidade
      where id = p_variacao_id and owner_id = auth.uid();
  else
    if v_produto.estoque_atual < p_quantidade then
      raise exception 'estoque insuficiente para %: tem %, pediu %',
        v_produto.nome, v_produto.estoque_atual, p_quantidade;
    end if;
    v_nome := v_produto.nome;
    v_custo := v_produto.custo;
    update produtos set estoque_atual = estoque_atual - p_quantidade, updated_at = now()
      where id = p_produto_id and owner_id = auth.uid();
  end if;

  insert into movimentos_estoque (
    owner_id, produto_id, variacao_id, produto_nome, tipo, quantidade, valor_unitario, data, observacoes
  ) values (
    auth.uid(), p_produto_id, case when v_produto.tem_variacoes then p_variacao_id else null end,
    v_nome, 'ajuste', -p_quantidade, v_custo, coalesce(p_data, current_date),
    case p_motivo when 'perda' then 'Perda ou quebra' when 'uso' then 'Uso próprio ou brinde' else 'Ajuste de contagem' end
      || case when nullif(trim(coalesce(p_observacoes, '')), '') is not null then ': ' || trim(p_observacoes) else '' end
  )
  returning id into v_movimento_id;

  return v_movimento_id;
end;
$$;
