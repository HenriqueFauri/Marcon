-- Fase 2: clientes, vendas, itens de venda, parcelas (fiado/parcelado).
-- Mesma regra do produto: excluir um cliente NUNCA apaga ou quebra vendas
-- antigas — cliente_id usa ON DELETE SET NULL e cliente_nome guarda uma
-- cópia do nome (snapshot), do mesmo jeito que o VendaMax faz (e que
-- decidimos manter, porque é um bom padrão).

create table clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  cpf_cnpj text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index clientes_owner_idx on clientes (owner_id, nome);

alter table clientes enable row level security;

create policy "clientes_select_own" on clientes
  for select using (owner_id = auth.uid());
create policy "clientes_insert_own" on clientes
  for insert with check (owner_id = auth.uid());
create policy "clientes_update_own" on clientes
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "clientes_delete_own" on clientes
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- vendas
-- ---------------------------------------------------------------------------
create type venda_tipo_pagamento as enum ('a_vista', 'a_prazo');
create type venda_status as enum ('concluida', 'cancelada');

create table vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid references clientes (id) on delete set null,
  cliente_nome text, -- snapshot: sobrevive à exclusão do cliente ("fiado" sem cadastro formal também cai aqui, digitado à mão
  data date not null default current_date,
  canal text,
  forma_pagamento text,
  tipo_pagamento venda_tipo_pagamento not null default 'a_vista',
  valor_total numeric(12, 2) not null,
  desconto numeric(12, 2) not null default 0,
  custo_total numeric(12, 2) not null default 0, -- snapshot do custo dos itens, pro lucro da venda nunca mudar se o custo do produto mudar depois
  status venda_status not null default 'concluida',
  observacoes text,
  created_at timestamptz not null default now()
);

create index vendas_owner_idx on vendas (owner_id, data desc);
create index vendas_cliente_idx on vendas (cliente_id);

alter table vendas enable row level security;

create policy "vendas_select_own" on vendas
  for select using (owner_id = auth.uid());
create policy "vendas_insert_own" on vendas
  for insert with check (owner_id = auth.uid());
create policy "vendas_update_own" on vendas
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "vendas_delete_own" on vendas
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- itens da venda
-- ---------------------------------------------------------------------------
create table venda_itens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  venda_id uuid not null references vendas (id) on delete cascade,
  produto_id uuid references produtos (id) on delete set null,
  variacao_id uuid references produto_variacoes (id) on delete set null,
  produto_nome text not null, -- snapshot
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(12, 2) not null,
  custo_unitario numeric(12, 2) not null default 0 -- snapshot do custo no momento da venda
);

create index venda_itens_venda_idx on venda_itens (venda_id);
create index venda_itens_produto_idx on venda_itens (produto_id);

alter table venda_itens enable row level security;

create policy "venda_itens_select_own" on venda_itens
  for select using (owner_id = auth.uid());
create policy "venda_itens_insert_own" on venda_itens
  for insert with check (owner_id = auth.uid());
create policy "venda_itens_update_own" on venda_itens
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "venda_itens_delete_own" on venda_itens
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- parcelas (contas a receber)
-- ---------------------------------------------------------------------------
create type parcela_status as enum ('pendente', 'pago', 'atrasado');

create table parcelas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  venda_id uuid not null references vendas (id) on delete cascade,
  numero_parcela integer not null,
  valor numeric(12, 2) not null,
  vencimento date not null,
  status parcela_status not null default 'pendente',
  data_pagamento date,
  lancamento_caixa_id uuid,
  created_at timestamptz not null default now()
);

create index parcelas_owner_idx on parcelas (owner_id, vencimento);
create index parcelas_venda_idx on parcelas (venda_id);

alter table parcelas enable row level security;

create policy "parcelas_select_own" on parcelas
  for select using (owner_id = auth.uid());
create policy "parcelas_insert_own" on parcelas
  for insert with check (owner_id = auth.uid());
create policy "parcelas_update_own" on parcelas
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "parcelas_delete_own" on parcelas
  for delete using (owner_id = auth.uid());

-- lancamentos_caixa ganha como uma venda pode gerar um lançamento (à vista)
-- ou uma parcela paga gera um (a_prazo). origem_venda_id / origem_parcela_id
-- deixam o vínculo rastreável sem forçar a origem_id genérico a adivinhar o tipo.
alter table lancamentos_caixa
  add column venda_id uuid references vendas (id) on delete set null,
  add column parcela_id uuid references parcelas (id) on delete set null;

alter table parcelas
  add constraint parcelas_lancamento_fk
  foreign key (lancamento_caixa_id) references lancamentos_caixa (id) on delete set null;

-- ---------------------------------------------------------------------------
-- registrar_venda: cria a venda, os itens, debita estoque, e — se à vista —
-- já lança a entrada de caixa; se a prazo, gera as parcelas em aberto
-- (nenhum dinheiro entra até cada parcela ser paga).
--
-- p_itens é um array de objetos: [{"produto_id":"...","variacao_id":null,"quantidade":2,"preco_unitario":49.9}, ...]
-- ---------------------------------------------------------------------------
create or replace function registrar_venda(
  p_cliente_id uuid,
  p_cliente_nome text,
  p_itens jsonb,
  p_desconto numeric,
  p_tipo_pagamento venda_tipo_pagamento,
  p_forma_pagamento text,
  p_canal text,
  p_numero_parcelas integer default 1,
  p_primeiro_vencimento date default current_date,
  p_data date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_produto produtos%rowtype;
  v_venda_id uuid;
  v_valor_total numeric := 0;
  v_custo_total numeric := 0;
  v_qtd integer;
  v_preco numeric;
  v_produto_id uuid;
  v_variacao_id uuid;
  v_custo_item numeric;
  v_valor_parcela numeric;
  v_resto numeric;
  i integer;
begin
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'a venda precisa de pelo menos um item';
  end if;

  -- valida estoque e soma o total antes de gravar qualquer coisa
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_preco := (v_item ->> 'preco_unitario')::numeric;

    select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
    if not found then
      raise exception 'produto não encontrado: %', v_produto_id;
    end if;
    if v_produto.estoque_atual < v_qtd then
      raise exception 'estoque insuficiente para %: tem %, pediu %', v_produto.nome, v_produto.estoque_atual, v_qtd;
    end if;

    v_valor_total := v_valor_total + (v_qtd * v_preco);
    v_custo_total := v_custo_total + (v_qtd * v_produto.custo);
  end loop;

  insert into vendas (
    owner_id, cliente_id, cliente_nome, data, canal, forma_pagamento,
    tipo_pagamento, valor_total, desconto, custo_total
  ) values (
    auth.uid(), p_cliente_id, p_cliente_nome, p_data, p_canal, p_forma_pagamento,
    p_tipo_pagamento, v_valor_total - coalesce(p_desconto, 0), coalesce(p_desconto, 0), v_custo_total
  )
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::uuid;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_preco := (v_item ->> 'preco_unitario')::numeric;

    select * into v_produto from produtos where id = v_produto_id and owner_id = auth.uid();
    v_custo_item := v_produto.custo;

    insert into venda_itens (
      owner_id, venda_id, produto_id, variacao_id, produto_nome, quantidade, preco_unitario, custo_unitario
    ) values (
      auth.uid(), v_venda_id, v_produto_id, v_variacao_id, v_produto.nome, v_qtd, v_preco, v_custo_item
    );

    if v_variacao_id is not null then
      update produto_variacoes set estoque = estoque - v_qtd
        where id = v_variacao_id and owner_id = auth.uid();
    else
      update produtos set estoque_atual = estoque_atual - v_qtd, updated_at = now()
        where id = v_produto_id and owner_id = auth.uid();
    end if;
  end loop;

  if p_tipo_pagamento = 'a_vista' then
    insert into lancamentos_caixa (
      owner_id, venda_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), v_venda_id, 'entrada', 'manual', 'Venda',
      'Venda' || case when p_cliente_nome is not null then ' — ' || p_cliente_nome else '' end,
      v_valor_total - coalesce(p_desconto, 0), p_data, true, true
    );
  else
    v_valor_parcela := trunc((v_valor_total - coalesce(p_desconto, 0)) / greatest(p_numero_parcelas, 1), 2);
    v_resto := (v_valor_total - coalesce(p_desconto, 0)) - (v_valor_parcela * greatest(p_numero_parcelas, 1));
    for i in 1..greatest(p_numero_parcelas, 1) loop
      insert into parcelas (owner_id, venda_id, numero_parcela, valor, vencimento, status)
      values (
        auth.uid(), v_venda_id, i,
        v_valor_parcela + case when i = p_numero_parcelas then v_resto else 0 end,
        p_primeiro_vencimento + ((i - 1) * interval '30 days'),
        'pendente'
      );
    end loop;
  end if;

  return v_venda_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pagar_parcela: marca a parcela como paga e lança a entrada de caixa
-- correspondente — o dinheiro só entra no fluxo quando o cliente paga de
-- verdade, nunca no momento da venda a prazo.
-- ---------------------------------------------------------------------------
create or replace function pagar_parcela(p_parcela_id uuid, p_data_pagamento date default current_date)
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
  select * into v_parcela from parcelas where id = p_parcela_id and owner_id = auth.uid();
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
    v_parcela.valor, p_data_pagamento, true, true
  )
  returning id into v_lancamento_id;

  update parcelas
    set status = 'pago', data_pagamento = p_data_pagamento, lancamento_caixa_id = v_lancamento_id
    where id = p_parcela_id and owner_id = auth.uid();
end;
$$;

-- parcelas vencidas e ainda pendentes contam como atrasadas na leitura,
-- sem precisar de um job agendado pra atualizar status.
create or replace view parcelas_com_status
with (security_invoker = true) as
select
  p.*,
  case
    when p.status = 'pendente' and p.vencimento < current_date then 'atrasado'::parcela_status
    else p.status
  end as status_efetivo
from parcelas p;
