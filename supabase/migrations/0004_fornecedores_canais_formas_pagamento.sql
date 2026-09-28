-- Fase 3a: fornecedores, canais de venda e formas de pagamento como entidades
-- próprias (antes eram texto livre). Mesma regra de sempre: apagar a entidade
-- nunca quebra o histórico — as colunas de texto existentes viram snapshot e
-- as novas colunas *_id usam ON DELETE SET NULL.

-- ---------------------------------------------------------------------------
-- fornecedores
-- ---------------------------------------------------------------------------
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index fornecedores_owner_idx on fornecedores (owner_id, nome);

alter table fornecedores enable row level security;

create policy "fornecedores_select_own" on fornecedores
  for select using (owner_id = auth.uid());
create policy "fornecedores_insert_own" on fornecedores
  for insert with check (owner_id = auth.uid());
create policy "fornecedores_update_own" on fornecedores
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "fornecedores_delete_own" on fornecedores
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- canais de venda (Instagram, Mercado Livre, Shopee, WhatsApp...)
-- ---------------------------------------------------------------------------
create table canais_venda (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, nome)
);

alter table canais_venda enable row level security;

create policy "canais_venda_select_own" on canais_venda
  for select using (owner_id = auth.uid());
create policy "canais_venda_insert_own" on canais_venda
  for insert with check (owner_id = auth.uid());
create policy "canais_venda_update_own" on canais_venda
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "canais_venda_delete_own" on canais_venda
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- formas de pagamento (PIX, Dinheiro, Cartão...)
-- ---------------------------------------------------------------------------
create table formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, nome)
);

alter table formas_pagamento enable row level security;

create policy "formas_pagamento_select_own" on formas_pagamento
  for select using (owner_id = auth.uid());
create policy "formas_pagamento_insert_own" on formas_pagamento
  for insert with check (owner_id = auth.uid());
create policy "formas_pagamento_update_own" on formas_pagamento
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "formas_pagamento_delete_own" on formas_pagamento
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- liga produtos e movimentos de estoque a fornecedores (mantendo o snapshot
-- em texto que já existia)
-- ---------------------------------------------------------------------------
alter table produtos
  add column fornecedor_id uuid references fornecedores (id) on delete set null;

alter table movimentos_estoque
  add column fornecedor_id uuid references fornecedores (id) on delete set null;

-- ---------------------------------------------------------------------------
-- liga vendas a canal/forma de pagamento cadastrados (mantendo canal/
-- forma_pagamento como snapshot em texto)
-- ---------------------------------------------------------------------------
alter table vendas
  add column canal_id uuid references canais_venda (id) on delete set null,
  add column forma_pagamento_id uuid references formas_pagamento (id) on delete set null;

-- ---------------------------------------------------------------------------
-- registrar_entrada_estoque ganha p_fornecedor_id (o nome continua vindo
-- pronto do app, igual cliente_nome em registrar_venda, pra não duplicar a
-- lógica de resolução de nome dentro do SQL)
-- ---------------------------------------------------------------------------
create or replace function registrar_entrada_estoque(
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_data date default current_date,
  p_fornecedor_nome text default null,
  p_observacoes text default null,
  p_fornecedor_id uuid default null
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
    quantidade, valor_unitario, data, fornecedor_nome, fornecedor_id, observacoes
  ) values (
    auth.uid(), p_produto_id, p_variacao_id, v_produto.nome, 'compra',
    p_quantidade, p_valor_unitario, p_data, p_fornecedor_nome, p_fornecedor_id, p_observacoes
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

-- ---------------------------------------------------------------------------
-- registrar_venda ganha p_canal_id / p_forma_pagamento_id (mesmo padrão)
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
  p_data date default current_date,
  p_canal_id uuid default null,
  p_forma_pagamento_id uuid default null
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
    owner_id, cliente_id, cliente_nome, data, canal, forma_pagamento, canal_id, forma_pagamento_id,
    tipo_pagamento, valor_total, desconto, custo_total
  ) values (
    auth.uid(), p_cliente_id, p_cliente_nome, p_data, p_canal, p_forma_pagamento, p_canal_id, p_forma_pagamento_id,
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
