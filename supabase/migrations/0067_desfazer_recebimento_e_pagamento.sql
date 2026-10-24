-- Desfazer recebimento de parcela e pagamento de conta.
--
-- 1. desfazer_recebimento(p_parcela): cada linha paga de `parcelas` é um recebimento (a parcela
--    inteira, o que faltava dela ou uma parte, ver 0045). Desfazer apaga o lançamento de entrada
--    ligado a essa linha (parcelas.lancamento_caixa_id ou lancamentos_caixa.parcela_id) e devolve o
--    valor para o que está em aberto:
--      - se já existe uma linha em aberto da mesma parcela (mesma venda e número), o valor volta
--        para ela e a linha recebida some (caso típico: desfazer uma parte recebida);
--      - senão, a própria linha volta para pendente (sem data, sem lançamento, parcial = false).
--    Não desfaz a entrada (paga na hora da venda: muda em Editar venda) nem parcela de venda
--    cancelada (o cancelamento já estornou pela soma dos lançamentos).
--    Sem lançamento ligado (apagado à mão no caixa), nada muda no caixa: não há o que estornar.
--    Devolve { parcela_id (a linha em aberto que ficou com o valor), valor, data_pagamento }
--    para o app poder refazer o recebimento pelo "Desfazer" do aviso.
--    security invoker: tudo o que ela mexe (parcelas, lancamentos_caixa) a RLS já deixa a dona mexer.
--
-- 2. desfazer_pagamento(p_conta): apaga a saída ligada (contas_a_pagar.lancamento_caixa_id), a conta
--    volta para aberta e, se for mensal, a do mês seguinte que pagar_conta abriu sai da lista quando
--    ainda está em aberto e ninguém mexeu nela (mesma descrição, valor, categoria, fornecedor, dia e
--    vencimento). security definer como pagar_conta: a policy de update de contas_a_pagar só deixa
--    editar conta aberta (pagar e despagar passam só pelas funções), por isso a posse é checada à mão
--    com owner_id = auth.uid() em toda consulta.
--
-- 3. pagar_conta: igual à da 0055, só que não abre a conta do mês seguinte se ela já existe (mesma
--    descrição e dia, mensal, mesmo vencimento). Assim pagar, desfazer e pagar de novo nunca duplica
--    a próxima, mesmo quando ela foi editada e por isso ficou na lista.
--
-- Idempotente (create or replace).

-- ---------------------------------------------------------------------------
-- 1. desfazer_recebimento
-- ---------------------------------------------------------------------------
create or replace function desfazer_recebimento(p_parcela uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_parcela parcelas%rowtype;
  v_venda_status venda_status;
  v_aberta_id uuid;
  v_volta_id uuid;
begin
  if v_owner is null then
    raise exception 'não autenticado';
  end if;

  select * into v_parcela from parcelas
    where id = p_parcela and owner_id = v_owner
    for update;
  if not found then
    raise exception 'parcela não encontrada';
  end if;
  if v_parcela.status <> 'pago' then
    raise exception 'essa parcela não está recebida';
  end if;
  if v_parcela.entrada then
    raise exception 'a entrada foi paga na hora da venda. Pra mudar, edite a venda';
  end if;

  select status into v_venda_status from vendas
    where id = v_parcela.venda_id and owner_id = v_owner;
  if v_venda_status = 'cancelada' then
    raise exception 'essa venda foi cancelada';
  end if;

  -- a entrada que esse recebimento lançou no caixa sai (antes da parcela, pelos dois vínculos)
  delete from lancamentos_caixa
    where owner_id = v_owner
      and (id = v_parcela.lancamento_caixa_id or parcela_id = v_parcela.id);

  -- o que falta da mesma parcela, se ainda houver
  select id into v_aberta_id from parcelas
    where owner_id = v_owner
      and venda_id = v_parcela.venda_id
      and numero_parcela = v_parcela.numero_parcela
      and status = 'pendente'
      and id <> v_parcela.id
    order by parcial, created_at
    limit 1
    for update;

  if v_aberta_id is not null then
    update parcelas set valor = valor + v_parcela.valor
      where id = v_aberta_id and owner_id = v_owner;
    delete from parcelas where id = v_parcela.id and owner_id = v_owner;
    v_volta_id := v_aberta_id;
  else
    update parcelas
      set status = 'pendente', data_pagamento = null, lancamento_caixa_id = null, parcial = false
      where id = v_parcela.id and owner_id = v_owner;
    v_volta_id := v_parcela.id;
  end if;

  return jsonb_build_object(
    'parcela_id', v_volta_id,
    'valor', v_parcela.valor,
    'data_pagamento', v_parcela.data_pagamento
  );
end;
$$;

revoke execute on function desfazer_recebimento(uuid) from public, anon;
grant execute on function desfazer_recebimento(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. desfazer_pagamento
-- ---------------------------------------------------------------------------
create or replace function desfazer_pagamento(p_conta uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_conta contas_a_pagar%rowtype;
  v_proximo_mes date;
  v_ultimo_dia integer;
  v_proximo_venc date;
  v_proxima_id uuid;
begin
  if v_owner is null then
    raise exception 'não autenticado';
  end if;

  select * into v_conta from contas_a_pagar
    where id = p_conta and owner_id = v_owner
    for update;
  if not found then
    raise exception 'conta não encontrada';
  end if;
  if v_conta.status <> 'paga' then
    raise exception 'essa conta não está paga';
  end if;

  -- a do mês seguinte que pagar_conta abriu: sai se ainda está aberta e do jeito que nasceu
  if v_conta.recorrencia = 'mensal' then
    v_proximo_mes := (date_trunc('month', v_conta.vencimento) + interval '1 month')::date;
    v_ultimo_dia := extract(day from (v_proximo_mes + interval '1 month' - interval '1 day'))::integer;
    v_proximo_venc := v_proximo_mes + (least(v_conta.dia_base, v_ultimo_dia) - 1);

    select id into v_proxima_id from contas_a_pagar
      where owner_id = v_owner
        and id <> v_conta.id
        and status = 'aberta'
        and recorrencia = 'mensal'
        and descricao = v_conta.descricao
        and dia_base = v_conta.dia_base
        and vencimento = v_proximo_venc
        and valor = v_conta.valor
        and categoria = v_conta.categoria
        and fornecedor_id is not distinct from v_conta.fornecedor_id
      order by created_at desc
      limit 1
      for update;

    if v_proxima_id is not null then
      delete from contas_a_pagar where id = v_proxima_id and owner_id = v_owner;
    end if;
  end if;

  -- a saída no caixa sai junto (sem lançamento ligado, nada a estornar)
  if v_conta.lancamento_caixa_id is not null then
    delete from lancamentos_caixa
      where id = v_conta.lancamento_caixa_id and owner_id = v_owner;
  end if;

  update contas_a_pagar
    set status = 'aberta', data_pagamento = null, lancamento_caixa_id = null
    where id = v_conta.id and owner_id = v_owner;

  return jsonb_build_object(
    'conta_id', v_conta.id,
    'valor', v_conta.valor,
    'data_pagamento', v_conta.data_pagamento,
    'proxima_removida', v_proxima_id is not null
  );
end;
$$;

revoke execute on function desfazer_pagamento(uuid) from public, anon;
grant execute on function desfazer_pagamento(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. pagar_conta: não duplica a conta do mês seguinte
-- ---------------------------------------------------------------------------
create or replace function pagar_conta(p_conta_id uuid, p_data date default hoje_br())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta contas_a_pagar%rowtype;
  v_data date := coalesce(p_data, hoje_br());
  v_lancamento_id uuid;
  v_proximo_mes date;
  v_ultimo_dia integer;
  v_proximo_venc date;
  v_proximo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_conta from contas_a_pagar
    where id = p_conta_id and owner_id = auth.uid()
    for update;
  if not found then
    raise exception 'conta não encontrada';
  end if;
  if v_conta.status = 'paga' then
    raise exception 'conta já paga';
  end if;

  insert into lancamentos_caixa (
    owner_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
  ) values (
    auth.uid(), 'saida', 'gasto', v_conta.categoria, v_conta.descricao, v_conta.valor, v_data, true, true
  )
  returning id into v_lancamento_id;

  update contas_a_pagar
    set status = 'paga', data_pagamento = v_data, lancamento_caixa_id = v_lancamento_id
    where id = p_conta_id and owner_id = auth.uid();

  if v_conta.recorrencia = 'mensal' then
    v_proximo_mes := (date_trunc('month', v_conta.vencimento) + interval '1 month')::date;
    v_ultimo_dia := extract(day from (v_proximo_mes + interval '1 month' - interval '1 day'))::integer;
    v_proximo_venc := v_proximo_mes + (least(v_conta.dia_base, v_ultimo_dia) - 1);

    -- já existe (pagou, desfez e pagou de novo): não abre outra
    if not exists (
      select 1 from contas_a_pagar
        where owner_id = auth.uid()
          and id <> p_conta_id
          and recorrencia = 'mensal'
          and descricao = v_conta.descricao
          and dia_base = v_conta.dia_base
          and vencimento = v_proximo_venc
    ) then
      insert into contas_a_pagar (
        owner_id, descricao, valor, vencimento, dia_base, recorrencia, categoria, fornecedor_id
      ) values (
        auth.uid(), v_conta.descricao, v_conta.valor, v_proximo_venc,
        v_conta.dia_base, 'mensal', v_conta.categoria, v_conta.fornecedor_id
      )
      returning id into v_proximo_id;
    end if;
  end if;

  return v_proximo_id;
end;
$$;

revoke execute on function pagar_conta(uuid, date) from public, anon;
grant execute on function pagar_conta(uuid, date) to authenticated, service_role;
