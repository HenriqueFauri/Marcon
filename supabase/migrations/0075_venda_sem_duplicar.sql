-- Venda sem duplicar (extensão do WhatsApp Web, parte 5, e Nova venda do app).
-- Quem chama manda uma chave (uuid) por tentativa de venda. Repetir a chamada com a mesma chave
-- (rede caiu, clique duplo, nova tentativa depois de erro de conexão) devolve a mesma venda em vez
-- de criar outra. A chave é única por conta: outra conta com a mesma chave cria a venda dela e
-- nunca enxerga a venda de quem usou a chave antes.
--
-- Nada das regras de venda muda: registrar_venda_unica só trava a chave, procura a venda da chave
-- na conta de quem chama e, se não houver, chama registrar_venda (0065) ou
-- registrar_venda_com_entrada (0065) como sempre. Validações, posse (owner_id = auth.uid()),
-- estoque com for update, gatilhos de posse (0031) e de limite do plano (0013, 0032, 0063) seguem
-- valendo. Erro em qualquer passo desfaz tudo, inclusive a chave, então dá para tentar de novo.
-- Idempotente.

alter table vendas add column if not exists chave_idempotencia uuid;

create unique index if not exists vendas_chave_idempotencia_uk
  on vendas (owner_id, chave_idempotencia)
  where chave_idempotencia is not null;

create or replace function registrar_venda_unica(
  p_chave uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_itens jsonb,
  p_desconto numeric,
  p_tipo_pagamento venda_tipo_pagamento,
  p_forma_pagamento text,
  p_canal text,
  p_numero_parcelas integer default 1,
  p_primeiro_vencimento date default null,
  p_data date default null,
  p_canal_id uuid default null,
  p_forma_pagamento_id uuid default null,
  p_outros_gastos numeric default 0,
  p_encomenda boolean default false,
  p_entrada numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid := auth.uid();
  v_venda_id uuid;
  v_token uuid;
  v_data date := coalesce(p_data, hoje_br());
begin
  if v_dono is null then
    raise exception 'não autenticado';
  end if;
  if p_chave is null then
    raise exception 'falta a chave da venda';
  end if;

  -- duas chamadas iguais ao mesmo tempo: a segunda espera a primeira terminar e acha a venda dela
  perform pg_advisory_xact_lock(hashtextextended('venda_unica:' || v_dono::text || ':' || p_chave::text, 0));

  select id, recibo_token into v_venda_id, v_token
    from vendas
    where owner_id = v_dono and chave_idempotencia = p_chave;
  if found then
    return jsonb_build_object('venda_id', v_venda_id, 'recibo_token', v_token, 'criada', false);
  end if;

  if coalesce(p_entrada, 0) > 0 then
    if p_tipo_pagamento is distinct from 'a_prazo' then
      raise exception 'entrada só vale em venda a prazo';
    end if;
    v_venda_id := registrar_venda_com_entrada(
      p_cliente_id, p_cliente_nome, p_itens, p_desconto, p_forma_pagamento, p_canal, p_entrada,
      p_numero_parcelas, coalesce(p_primeiro_vencimento, v_data), v_data, p_canal_id, p_forma_pagamento_id,
      coalesce(p_outros_gastos, 0), coalesce(p_encomenda, false)
    );
  else
    v_venda_id := registrar_venda(
      p_cliente_id, p_cliente_nome, p_itens, p_desconto, p_tipo_pagamento, p_forma_pagamento, p_canal,
      p_numero_parcelas, coalesce(p_primeiro_vencimento, v_data), v_data, p_canal_id, p_forma_pagamento_id,
      coalesce(p_outros_gastos, 0), coalesce(p_encomenda, false)
    );
  end if;

  update vendas set chave_idempotencia = p_chave
    where id = v_venda_id and owner_id = v_dono
    returning recibo_token into v_token;

  return jsonb_build_object('venda_id', v_venda_id, 'recibo_token', v_token, 'criada', true);
end;
$$;

revoke execute on function registrar_venda_unica(uuid, uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric, boolean, numeric) from public, anon;
grant execute on function registrar_venda_unica(uuid, uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric, boolean, numeric) to authenticated, service_role;
