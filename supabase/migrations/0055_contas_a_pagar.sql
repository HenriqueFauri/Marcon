-- F10: contas a pagar e gastos que se repetem (aluguel, internet, boleto do fornecedor).
-- Lança-se uma vez (valor, vencimento, recorrência mensal); "marcar como paga" lança a saída no caixa
-- e, se a conta se repete, já abre a do mês seguinte, tudo na mesma transação (pagar_conta).

create table contas_a_pagar (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  descricao text not null check (length(btrim(descricao)) between 1 and 120),
  valor numeric(12, 2) not null check (valor > 0),
  vencimento date not null,
  -- dia do mês em que a conta vence de verdade: evita que 31/01 vire 28/02 e 28/03 nos meses seguintes
  dia_base integer not null check (dia_base between 1 and 31),
  recorrencia text not null default 'nenhuma' check (recorrencia in ('nenhuma', 'mensal')),
  categoria text not null default 'Contas' check (length(btrim(categoria)) between 1 and 60),
  fornecedor_id uuid references fornecedores (id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'paga')),
  data_pagamento date,
  lancamento_caixa_id uuid references lancamentos_caixa (id) on delete set null,
  created_at timestamptz not null default now()
);

create index contas_a_pagar_owner_idx on contas_a_pagar (owner_id, status, vencimento);

alter table contas_a_pagar enable row level security;

create policy "contas_a_pagar_select_own" on contas_a_pagar
  for select using (owner_id = auth.uid());
create policy "contas_a_pagar_insert_own" on contas_a_pagar
  for insert with check (owner_id = auth.uid() and status = 'aberta' and lancamento_caixa_id is null);
-- pagar passa só por pagar_conta(): editar não muda status nem o vínculo com o caixa
create policy "contas_a_pagar_update_own" on contas_a_pagar
  for update using (owner_id = auth.uid() and status = 'aberta')
  with check (owner_id = auth.uid() and status = 'aberta' and lancamento_caixa_id is null);
create policy "contas_a_pagar_delete_own" on contas_a_pagar
  for delete using (owner_id = auth.uid());

-- gatilho de posse (0031): fornecedor_id e lancamento_caixa_id têm que ser do mesmo dono
create trigger contas_a_pagar_posse before insert or update on contas_a_pagar
  for each row execute function checar_posse_relacionada();

-- ---------------------------------------------------------------------------
-- pagar_conta: trava a conta, lança a saída no caixa e abre a próxima se for mensal.
-- Devolve o id da próxima conta (ou null).
-- ---------------------------------------------------------------------------
create function pagar_conta(p_conta_id uuid, p_data date default hoje_br())
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
    insert into contas_a_pagar (
      owner_id, descricao, valor, vencimento, dia_base, recorrencia, categoria, fornecedor_id
    ) values (
      auth.uid(), v_conta.descricao, v_conta.valor,
      v_proximo_mes + (least(v_conta.dia_base, v_ultimo_dia) - 1),
      v_conta.dia_base, 'mensal', v_conta.categoria, v_conta.fornecedor_id
    )
    returning id into v_proximo_id;
  end if;

  return v_proximo_id;
end;
$$;

revoke execute on function pagar_conta(uuid, date) from public, anon;
grant execute on function pagar_conta(uuid, date) to authenticated, service_role;
