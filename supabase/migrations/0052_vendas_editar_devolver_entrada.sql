-- F5 editar venda, F6 devolução de item e F13 venda com entrada.
--
-- Tudo o que mexe em estoque, caixa e parcelas roda em função SQL (security definer, search_path
-- fixo, auth.uid() = dono, sem execute para anon). Nenhuma delas apaga venda nem toca em created_at
-- (o limite de vendas do plano grátis conta vendas por created_at e a venda nunca sai da tabela).
--
-- Modelo:
--   * Entrada (F13): vira a parcela 1, já paga na data da venda (parcelas.entrada = true), com o
--     seu lançamento de entrada no caixa. O restante vira as parcelas 2 em diante. Tudo o que já
--     lê parcelas (recibo, contas a receber, cancelar_venda) continua certo sem mudar.
--   * Mudou o valor da venda (preço editado ou devolução): _venda_ajustar_valor tira a diferença
--     das parcelas em aberto (da última para a primeira) e, se sobrar, devolve em dinheiro com um
--     estorno no caixa. Aumento soma na última parcela em aberto (ou cria uma) ou, à vista, entra
--     como lançamento de ajuste. Como cancelar_venda estorna pela soma dos lançamentos da venda,
--     cancelar depois de editar ou devolver continua devolvendo exatamente o que entrou.

alter table parcelas add column if not exists entrada boolean not null default false;

comment on column parcelas.entrada is
  'true = entrada paga na hora da venda (criada por registrar_venda_com_entrada); as demais parcelas são o restante';

-- a view lista as colunas na criação: recriar para enxergar `entrada`
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

-- ---------------------------------------------------------------------------
-- _venda_ajustar_valor: acerta parcelas e caixa quando o valor da venda muda.
-- Interna: só as funções abaixo chamam (ninguém logado executa direto).
-- ---------------------------------------------------------------------------
create or replace function _venda_ajustar_valor(
  p_venda_id uuid,
  p_delta numeric,
  p_data date,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_parcela parcelas%rowtype;
  v_resta numeric(12, 2) := round(abs(coalesce(p_delta, 0)), 2);
  v_tira numeric(12, 2);
  v_data date := coalesce(p_data, hoje_br());
  v_ultimo integer;
begin
  select * into v_venda from vendas where id = p_venda_id and owner_id = auth.uid();
  if not found then
    raise exception 'venda não encontrada';
  end if;
  if v_resta = 0 then
    return;
  end if;

  if p_delta < 0 then
    -- tira do que ainda está em aberto, da última parcela para a primeira
    for v_parcela in
      select * from parcelas
        where venda_id = p_venda_id and owner_id = auth.uid() and status = 'pendente'
        order by numero_parcela desc, created_at desc
        for update
    loop
      exit when v_resta <= 0;
      v_tira := least(v_parcela.valor, v_resta);
      if v_tira >= v_parcela.valor then
        delete from parcelas where id = v_parcela.id and owner_id = auth.uid();
      else
        update parcelas set valor = valor - v_tira where id = v_parcela.id and owner_id = auth.uid();
      end if;
      v_resta := v_resta - v_tira;
    end loop;

    -- o que sobrou já tinha sido pago: volta em dinheiro
    if v_resta > 0 then
      insert into lancamentos_caixa (
        owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
      ) values (
        auth.uid(), p_venda_id, 'saida', 'ajuste', 'Estorno',
        p_motivo || coalesce(' · ' || v_venda.cliente_nome, ''),
        v_resta, v_data, true, true
      );
    end if;
  else
    if v_venda.tipo_pagamento = 'a_prazo' then
      select * into v_parcela from parcelas
        where venda_id = p_venda_id and owner_id = auth.uid() and status = 'pendente'
        order by numero_parcela desc, created_at desc
        limit 1
        for update;
      if found then
        update parcelas set valor = valor + v_resta where id = v_parcela.id and owner_id = auth.uid();
      else
        -- tudo já estava pago e o valor subiu: a diferença vira uma parcela nova em aberto
        select coalesce(max(numero_parcela), 0) into v_ultimo from parcelas where venda_id = p_venda_id and owner_id = auth.uid();
        insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status)
        values (auth.uid(), p_venda_id, v_ultimo + 1, v_resta, v_data, 'pendente');
      end if;
    else
      insert into lancamentos_caixa (
        owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
      ) values (
        auth.uid(), p_venda_id, 'entrada', 'ajuste', 'Venda',
        p_motivo || coalesce(' · ' || v_venda.cliente_nome, ''),
        v_resta, v_data, true, true
      );
    end if;
  end if;
end;
$$;

revoke execute on function _venda_ajustar_valor(uuid, numeric, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- _devolver_estoque_item: devolve a quantidade ao produto ou à variação certa.
-- Mesma lógica de cancelar_venda (liga item solto pelo nome). Retorna:
-- 'voltou', 'sem_ligacao' (produto ou variação não existe mais) ou 'sem_variacao'
-- (produto com variações e item sem variação ligada).
-- ---------------------------------------------------------------------------
create or replace function _devolver_estoque_item(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_nome text,
  p_quantidade integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto produtos%rowtype;
  v_produto_id uuid := p_produto_id;
  v_variacao_id uuid := p_variacao_id;
begin
  if v_produto_id is null then
    v_produto_id := achar_produto_do_item(p_nome);
  end if;
  if v_variacao_id is null and v_produto_id is not null then
    select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
    if found and v_produto.tem_variacoes then
      v_variacao_id := achar_variacao(v_produto_id, p_nome);
    end if;
  end if;

  if v_variacao_id is not null then
    update produto_variacoes set estoque = estoque + p_quantidade
      where id = v_variacao_id and owner_id = auth.uid();
    if found then return 'voltou'; end if;
    return 'sem_ligacao';
  elsif v_produto_id is not null then
    select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
    if not found then
      return 'sem_ligacao';
    elsif v_produto.tem_variacoes then
      return 'sem_variacao';
    end if;
    update produtos set estoque_atual = estoque_atual + p_quantidade, updated_at = now()
      where id = v_produto_id and owner_id = auth.uid();
    return 'voltou';
  end if;
  return 'sem_ligacao';
end;
$$;

revoke execute on function _devolver_estoque_item(uuid, uuid, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- F5 editar_venda: cliente, canal, forma de pagamento, data, observação e preço dos itens.
-- Quantidade, estoque e custo dos itens não mudam aqui (para isso, devolver ou cancelar).
-- p_precos: [{"item_id": "...", "preco_unitario": 12.5}], só os itens que mudaram.
-- ---------------------------------------------------------------------------
create or replace function editar_venda(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_canal_id uuid,
  p_canal text,
  p_forma_pagamento_id uuid,
  p_forma_pagamento text,
  p_data date,
  p_observacoes text,
  p_precos jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda vendas%rowtype;
  v_cliente text;
  v_canal text;
  v_forma text;
  v_preco jsonb;
  v_item_id uuid;
  v_valor numeric;
  v_subtotal numeric;
  v_total numeric;
  v_delta numeric;
  v_data date := coalesce(p_data, (select data from vendas where id = p_venda_id and owner_id = auth.uid()));
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_venda from vendas
    where id = p_venda_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'venda não encontrada';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'venda cancelada não pode ser editada';
  end if;
  if v_data > hoje_br() then
    raise exception 'a data da venda não pode ser no futuro';
  end if;

  -- nomes viram snapshot na venda: vêm do cadastro quando há id (e o id precisa ser do dono)
  if p_cliente_id is not null then
    select nome into v_cliente from clientes where id = p_cliente_id and owner_id = auth.uid();
    if not found then raise exception 'cliente não encontrado'; end if;
  else
    v_cliente := nullif(btrim(coalesce(p_cliente_nome, '')), '');
  end if;
  if p_canal_id is not null then
    select nome into v_canal from canais_venda where id = p_canal_id and owner_id = auth.uid();
    if not found then raise exception 'canal não encontrado'; end if;
  else
    v_canal := nullif(btrim(coalesce(p_canal, '')), '');
  end if;
  if p_forma_pagamento_id is not null then
    select nome into v_forma from formas_pagamento where id = p_forma_pagamento_id and owner_id = auth.uid();
    if not found then raise exception 'forma de pagamento não encontrada'; end if;
  else
    v_forma := nullif(btrim(coalesce(p_forma_pagamento, '')), '');
  end if;

  if v_venda.tipo_pagamento = 'a_prazo' and v_cliente is null then
    raise exception 'venda a prazo precisa de um cliente, pra saber de quem cobrar';
  end if;

  -- preços novos dos itens (só os que vieram na lista)
  if p_precos is not null and jsonb_typeof(p_precos) = 'array' then
    for v_preco in select * from jsonb_array_elements(p_precos)
    loop
      v_item_id := (v_preco ->> 'item_id')::uuid;
      v_valor := round((v_preco ->> 'preco_unitario')::numeric, 2);
      if v_valor is null or v_valor < 0 then
        raise exception 'preço inválido';
      end if;
      update venda_itens set preco_unitario = v_valor
        where id = v_item_id and venda_id = p_venda_id and owner_id = auth.uid();
      if not found then
        raise exception 'item não encontrado nesta venda';
      end if;
    end loop;
  end if;

  select coalesce(sum(quantidade * preco_unitario), 0) into v_subtotal
    from venda_itens where venda_id = p_venda_id and owner_id = auth.uid();
  if v_venda.desconto > v_subtotal then
    raise exception 'o desconto não pode ser maior que o total da venda';
  end if;
  v_total := v_subtotal - v_venda.desconto;
  v_delta := v_total - v_venda.valor_total;

  update vendas set
    cliente_id = p_cliente_id,
    cliente_nome = v_cliente,
    canal_id = p_canal_id,
    canal = v_canal,
    forma_pagamento_id = p_forma_pagamento_id,
    forma_pagamento = v_forma,
    data = v_data,
    observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
    valor_total = v_total
  where id = p_venda_id and owner_id = auth.uid();

  if v_delta <> 0 then
    perform _venda_ajustar_valor(p_venda_id, v_delta, hoje_br(), 'Ajuste de preço da venda');
  end if;

  -- mudou a data da venda: o dinheiro que entrou na hora (à vista, entrada) e o gasto da entrega
  -- acompanham. Parcelas pagas depois e estornos mantêm a data em que o dinheiro se mexeu.
  if v_data <> v_venda.data then
    update lancamentos_caixa l set data = v_data
      where l.venda_id = p_venda_id and l.owner_id = auth.uid()
        and l.data = v_venda.data
        and l.origem in ('manual', 'gasto')
        and (l.parcela_id is null or exists (
          select 1 from parcelas p where p.id = l.parcela_id and p.owner_id = auth.uid() and p.entrada
        ));
    update parcelas set vencimento = v_data, data_pagamento = v_data
      where venda_id = p_venda_id and owner_id = auth.uid() and entrada and data_pagamento = v_venda.data;
  end if;

  return jsonb_build_object('valor_total', v_total, 'diferenca', v_delta);
end;
$$;

revoke execute on function editar_venda(uuid, uuid, text, uuid, text, uuid, text, date, text, jsonb) from public, anon;
grant execute on function editar_venda(uuid, uuid, text, uuid, text, uuid, text, date, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F6 devolver_item_venda: devolve parte (ou toda a quantidade) de um item.
-- Volta o estoque na variação certa (opcional: peça com defeito não volta), estorna o valor
-- proporcional (já com a fatia do desconto) nas parcelas em aberto e, se o cliente já tinha
-- pago, em dinheiro no caixa, e recalcula total, desconto e custo da venda.
-- Devolver tudo é cancelar: a função pede para cancelar a venda.
-- ---------------------------------------------------------------------------
create or replace function devolver_item_venda(
  p_item_id uuid,
  p_quantidade integer,
  p_voltar_estoque boolean default true,
  p_data date default hoje_br()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_venda vendas%rowtype;
  v_item venda_itens%rowtype;
  v_subtotal_antes numeric;
  v_subtotal_depois numeric;
  v_qtd_total numeric;
  v_devolvido numeric(12, 2);
  v_total_novo numeric(12, 2);
  v_desconto_novo numeric(12, 2);
  v_custo_novo numeric(12, 2);
  v_estoque text := 'nao_voltou';
  v_data date := coalesce(p_data, hoje_br());
  v_nota text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select venda_id into v_venda_id from venda_itens where id = p_item_id and owner_id = auth.uid();
  if not found then
    raise exception 'item não encontrado';
  end if;

  select * into v_venda from vendas where id = v_venda_id and owner_id = auth.uid() for update;
  if not found then
    raise exception 'venda não encontrada';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'venda cancelada não aceita devolução';
  end if;
  if v_data > hoje_br() then
    raise exception 'a data da devolução não pode ser no futuro';
  end if;

  select * into v_item from venda_itens where id = p_item_id and owner_id = auth.uid() for update;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > v_item.quantidade then
    raise exception 'quantidade a devolver entre 1 e %', v_item.quantidade;
  end if;

  select coalesce(sum(quantidade * preco_unitario), 0), coalesce(sum(quantidade), 0)
    into v_subtotal_antes, v_qtd_total
    from venda_itens where venda_id = v_venda_id and owner_id = auth.uid();
  if p_quantidade >= v_qtd_total then
    raise exception 'devolver tudo é cancelar a venda: use Cancelar venda';
  end if;

  -- valor proporcional ao peso do item na venda, já com a fatia do desconto
  v_subtotal_depois := v_subtotal_antes - p_quantidade * v_item.preco_unitario;
  v_devolvido := case
    when v_subtotal_antes > 0
      then round(p_quantidade * v_item.preco_unitario * v_venda.valor_total / v_subtotal_antes, 2)
    else 0
  end;
  v_total_novo := v_venda.valor_total - v_devolvido;
  v_desconto_novo := greatest(v_subtotal_depois - v_total_novo, 0);
  v_custo_novo := greatest(v_venda.custo_total - p_quantidade * v_item.custo_unitario, 0);

  if coalesce(p_voltar_estoque, true) then
    v_estoque := case _devolver_estoque_item(v_item.produto_id, v_item.variacao_id, v_item.produto_nome, p_quantidade)
      when 'voltou' then 'voltou'
      when 'sem_variacao' then 'sem_variacao'
      else 'sem_ligacao'
    end;
  end if;

  if p_quantidade = v_item.quantidade then
    delete from venda_itens where id = p_item_id and owner_id = auth.uid();
  else
    update venda_itens set quantidade = quantidade - p_quantidade
      where id = p_item_id and owner_id = auth.uid();
  end if;

  -- o histórico fica na observação da venda (o item some ou diminui na lista)
  v_nota := 'Devolução em ' || to_char(v_data, 'DD/MM/YYYY') || ': ' || p_quantidade || 'x ' || v_item.produto_nome
    || ' (R$ ' || replace(to_char(v_devolvido, 'FM999999990.00'), '.', ',') || ')'
    || case when coalesce(p_voltar_estoque, true) then '' else ', sem voltar ao estoque' end;

  update vendas set
    valor_total = v_total_novo,
    desconto = v_desconto_novo,
    custo_total = v_custo_novo,
    observacoes = case when observacoes is null or btrim(observacoes) = '' then v_nota else observacoes || E'\n' || v_nota end
  where id = v_venda_id and owner_id = auth.uid();

  perform _venda_ajustar_valor(v_venda_id, -v_devolvido, v_data, 'Devolução de ' || p_quantidade || 'x ' || v_item.produto_nome);

  return jsonb_build_object('devolvido', v_devolvido, 'estoque', v_estoque, 'valor_total', v_total_novo);
end;
$$;

revoke execute on function devolver_item_venda(uuid, integer, boolean, date) from public, anon;
grant execute on function devolver_item_venda(uuid, integer, boolean, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F13 registrar_venda_com_entrada: venda a prazo com uma parte paga na hora.
-- Usa registrar_venda (estoque, custo, gasto da entrega, limite do plano) e, na mesma
-- transação, troca as parcelas: parcela 1 é a entrada, já paga e já no caixa; o restante
-- vira as parcelas 2 em diante. Só a entrada entra no caixa agora.
-- ---------------------------------------------------------------------------
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
  p_outros_gastos numeric default 0
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
    v_parcelas, coalesce(p_primeiro_vencimento, v_data), v_data, p_canal_id, p_forma_pagamento_id, p_outros_gastos
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

revoke execute on function registrar_venda_com_entrada(uuid, text, jsonb, numeric, text, text, numeric, integer, date, date, uuid, uuid, numeric) from public, anon;
grant execute on function registrar_venda_com_entrada(uuid, text, jsonb, numeric, text, text, numeric, integer, date, date, uuid, uuid, numeric) to authenticated, service_role;
