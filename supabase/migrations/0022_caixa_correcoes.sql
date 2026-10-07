-- Correções do fluxo de caixa (auditoria de 05/10/2026).
--
-- 1. Datas no fuso de Brasília. O banco roda em UTC: depois das 21h em Brasília,
--    `current_date` já é amanhã. O estorno de uma venda cancelada à noite entrava
--    datado de amanhã (o saldo de hoje não o descontava e, no último dia do mês, ele
--    caía no mês seguinte), e a parcela que vence hoje aparecia como atrasada.
-- 2. pagar_parcela trava a parcela: dois toques ao mesmo tempo passavam pela checagem
--    "já paga" e lançavam a mesma parcela duas vezes no caixa.
-- 3. Estoque que já era seu: registrar_entrada_estoque ganha p_afeta_caixa. Com false o
--    estoque e o custo médio entram, mas nenhum dinheiro sai do caixa (quem começa no
--    Marcon já pagou por esse estoque antes).
-- 4. cancelar_venda: igual à da 0021, só que o estorno é datado no dia de Brasília.
-- 5. resumo_caixa: entradas, saídas e as maiores saídas por categoria somadas no banco,
--    sem o corte de 1000 linhas do PostgREST (o saldo já era assim desde a 0016).

-- hoje no fuso de Brasília
create or replace function hoje_br() returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- pagar_parcela: trava a parcela e usa o dia de Brasília
-- ---------------------------------------------------------------------------
create or replace function pagar_parcela(p_parcela_id uuid, p_data_pagamento date default hoje_br())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parcela parcelas%rowtype;
  v_venda vendas%rowtype;
  v_lancamento_id uuid;
begin
  select * into v_parcela from parcelas
    where id = p_parcela_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'parcela não encontrada';
  end if;
  if v_parcela.status = 'pago' then
    raise exception 'parcela já paga';
  end if;

  select * into v_venda from vendas where id = v_parcela.venda_id and owner_id = auth.uid();

  insert into lancamentos_caixa (
    owner_id, venda_id, parcela_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
  ) values (
    auth.uid(), v_parcela.venda_id, p_parcela_id, 'entrada', 'manual', 'Venda',
    'Parcela ' || v_parcela.numero_parcela || case when v_venda.cliente_nome is not null then ' — ' || v_venda.cliente_nome else '' end,
    v_parcela.valor, coalesce(p_data_pagamento, hoje_br()), true, true
  )
  returning id into v_lancamento_id;

  update parcelas
    set status = 'pago', data_pagamento = coalesce(p_data_pagamento, hoje_br()), lancamento_caixa_id = v_lancamento_id
    where id = p_parcela_id and owner_id = auth.uid();
end;
$$;

-- Uma parcela só pode gerar um lançamento. O índice só é criado se não houver
-- duplicata já gravada (nesse caso o aviso abaixo diz; limpe e rode este bloco de novo).
do $$
begin
  if exists (
    select 1 from lancamentos_caixa where parcela_id is not null group by parcela_id having count(*) > 1
  ) then
    raise notice 'Há parcelas com mais de um lançamento no caixa; o índice único não foi criado. Corrija as duplicatas e crie lancamentos_caixa_parcela_uk.';
  else
    create unique index if not exists lancamentos_caixa_parcela_uk
      on lancamentos_caixa (parcela_id) where parcela_id is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- atrasado = venceu antes de hoje (dia de Brasília)
-- ---------------------------------------------------------------------------
drop view if exists parcelas_com_status;
create view parcelas_com_status
with (security_invoker = true) as
select
  p.*,
  case
    when p.status = 'pendente' and p.vencimento < hoje_br() then 'atrasado'::parcela_status
    else p.status
  end as status_efetivo
from parcelas p;

-- o recibo público também diz "atrasado" pelo dia de Brasília
create or replace function recibo_publico(p_token uuid) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'empresa', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'telefone', u.raw_user_meta_data->>'empresa_telefone',
      'email', u.raw_user_meta_data->>'empresa_email',
      'endereco', u.raw_user_meta_data->>'empresa_endereco',
      'documento', u.raw_user_meta_data->>'empresa_documento',
      'logo_path', u.raw_user_meta_data->>'empresa_logo_path'
    ),
    'venda', jsonb_build_object(
      'data', v.data,
      'cliente_nome', v.cliente_nome,
      'tipo_pagamento', v.tipo_pagamento,
      'forma_pagamento', v.forma_pagamento,
      'valor_total', v.valor_total,
      'desconto', v.desconto,
      'status', v.status
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.produto_nome, 'quantidade', i.quantidade, 'preco_unitario', i.preco_unitario
      ) order by i.produto_nome)
      from venda_itens i where i.venda_id = v.id
    ), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero_parcela,
        'vencimento', p.vencimento,
        'valor', p.valor,
        'status', case when p.status = 'pendente' and p.vencimento < hoje_br() then 'atrasado' else p.status::text end,
        'data_pagamento', p.data_pagamento
      ) order by p.numero_parcela)
      from parcelas p where p.venda_id = v.id
    ), '[]'::jsonb)
  )
  from vendas v
  join auth.users u on u.id = v.owner_id
  where v.recibo_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- cancelar_venda: igual à da 0021 (religa itens soltos e devolve o estoque), só que o
-- estorno é datado no dia de Brasília
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
      v_recebido, hoje_br(), true, true
    );
  end if;

  -- o gasto da entrega (motoboy etc.) também volta para o caixa
  if coalesce(v_venda.outros_gastos, 0) > 0 then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_venda_id, 'entrada', 'ajuste', 'Estorno',
      'Estorno do gasto de venda cancelada' || case when v_venda.cliente_nome is not null then ' · ' || v_venda.cliente_nome else '' end,
      v_venda.outros_gastos, hoje_br(), false, true
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
-- registrar_entrada_estoque: p_afeta_caixa (false = estoque que já era seu)
-- ---------------------------------------------------------------------------
drop function if exists registrar_entrada_estoque(uuid, uuid, integer, numeric, date, text, text, uuid);
-- a própria assinatura nova também, para a migration poder rodar de novo sem erro
drop function if exists registrar_entrada_estoque(uuid, uuid, integer, numeric, date, text, text, uuid, boolean);

create function registrar_entrada_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_data date default hoje_br(),
  p_fornecedor_nome text default null,
  p_observacoes text default null,
  p_fornecedor_id uuid default null,
  p_afeta_caixa boolean default true
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
    p_quantidade, p_valor_unitario, coalesce(p_data, hoje_br()), p_fornecedor_nome, p_fornecedor_id, p_observacoes
  )
  returning id into v_movimento_id;

  v_nome_lancamento := 'Entrada de estoque: ' || v_produto.nome || coalesce(' — ' || v_nome_variacao, '');

  if coalesce(p_afeta_caixa, true) and p_quantidade * p_valor_unitario > 0 then
    insert into lancamentos_caixa (
      owner_id, produto_id, movimento_estoque_id, tipo, origem,
      categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), p_produto_id, v_movimento_id, 'saida', 'compra',
      'Fornecimento', v_nome_lancamento, p_quantidade * p_valor_unitario, coalesce(p_data, hoje_br()), false, true
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
-- resumo_caixa: totais do período somados no banco
-- ---------------------------------------------------------------------------
create or replace function resumo_caixa(p_inicio date, p_fim_exclusivo date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'entradas', coalesce(sum(valor) filter (where tipo = 'entrada'), 0),
    'saidas', coalesce(sum(valor) filter (where tipo = 'saida'), 0),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', c.categoria, 'valor', c.total) order by c.total desc)
      from (
        select categoria, sum(valor) as total
        from lancamentos_caixa
        where owner_id = auth.uid() and tipo = 'saida' and data >= p_inicio and data < p_fim_exclusivo
        group by categoria
        order by total desc
        limit 5
      ) c
    ), '[]'::jsonb)
  )
  from lancamentos_caixa
  where owner_id = auth.uid() and data >= p_inicio and data < p_fim_exclusivo;
$$;
