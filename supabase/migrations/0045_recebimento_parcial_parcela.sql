-- Recebimento parcial de parcela (F3).
--
-- Modelo: a parcela é fatiada. Quando o cliente paga R$ 50 de uma parcela de R$ 100,
-- nasce uma linha nova em `parcelas`, já paga, de R$ 50 (mesmo número e vencimento,
-- `parcial = true`, com o seu lançamento no caixa), e a parcela original continua
-- pendente valendo os R$ 50 que faltam.
--
-- Por que assim, e não uma coluna "valor recebido" ou uma tabela de recebimentos:
-- tudo o que já existe lê `parcelas.valor` e `parcelas.status` e continua certo sem
-- mudar uma linha:
--   - em aberto e atrasado (Início, Contas a receber, Clientes, lembrete de cobrança,
--     assistente do WhatsApp) somam `valor` das pendentes: passa a ser só o que falta;
--   - recebido (tela da venda, recibo) soma `valor` das pagas: inclui a parte recebida;
--   - a soma das parcelas continua igual ao total da venda;
--   - `lancamentos_caixa_parcela_uk` (um lançamento por parcela) continua valendo,
--     porque cada parte recebida é uma linha própria;
--   - `cancelar_venda` estorna pela soma dos lançamentos da venda e apaga as parcelas
--     não pagas: devolve exatamente o que foi recebido e remove o resto em aberto.

alter table parcelas add column if not exists parcial boolean not null default false;

comment on column parcelas.parcial is
  'true = parte recebida de uma parcela (linha criada por receber_parcela); a parcela original segue com o que falta';

-- a view lista as colunas na criação: recriar para enxergar `parcial`
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
-- receber_parcela: recebe tudo ou uma parte. O valor entra no caixa na data
-- informada; se for parte, o resto continua em aberto na mesma parcela.
-- ---------------------------------------------------------------------------
create or replace function receber_parcela(
  p_parcela_id uuid,
  p_valor numeric,
  p_data_pagamento date default hoje_br()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parcela parcelas%rowtype;
  v_cliente text;
  v_valor numeric(12, 2) := round(p_valor, 2);
  v_data date := coalesce(p_data_pagamento, hoje_br());
  v_parte_id uuid;
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
  if v_valor is null or v_valor <= 0 then
    raise exception 'o valor recebido precisa ser maior que zero';
  end if;
  if v_valor > v_parcela.valor then
    raise exception 'o valor recebido é maior que o que falta nessa parcela';
  end if;

  -- recebeu tudo o que faltava: é o pagamento comum
  if v_valor = v_parcela.valor then
    perform pagar_parcela(p_parcela_id, v_data);
    return jsonb_build_object('recebido', v_valor, 'restante', 0, 'quitada', true);
  end if;

  select cliente_nome into v_cliente from vendas where id = v_parcela.venda_id and owner_id = auth.uid();

  insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status, data_pagamento, parcial)
  values (auth.uid(), v_parcela.venda_id, v_parcela.numero_parcela, v_valor, v_parcela.vencimento, 'pago', v_data, true)
  returning id into v_parte_id;

  insert into lancamentos_caixa (
    owner_id, venda_id, parcela_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
  ) values (
    auth.uid(), v_parcela.venda_id, v_parte_id, 'entrada', 'manual', 'Venda',
    'Parte da parcela ' || v_parcela.numero_parcela || coalesce(' · ' || v_cliente, ''),
    v_valor, v_data, true, true
  )
  returning id into v_lancamento_id;

  update parcelas set lancamento_caixa_id = v_lancamento_id
    where id = v_parte_id and owner_id = auth.uid();

  update parcelas set valor = valor - v_valor
    where id = p_parcela_id and owner_id = auth.uid();

  return jsonb_build_object('recebido', v_valor, 'restante', v_parcela.valor - v_valor, 'quitada', false);
end;
$$;

revoke execute on function receber_parcela(uuid, numeric, date) from public, anon;
grant execute on function receber_parcela(uuid, numeric, date) to authenticated, service_role;
