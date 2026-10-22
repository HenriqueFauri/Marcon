-- F33: pedido de compra ao fornecedor com frete rateado no custo.
-- Só leitura pelo cliente: quem grava é registrar_pedido_compra() (0057), numa transação só.

create table pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  fornecedor_id uuid references fornecedores (id) on delete set null,
  fornecedor_nome text,
  data date not null default hoje_br(),
  frete numeric(12, 2) not null default 0 check (frete >= 0),
  total_itens numeric(12, 2) not null check (total_itens >= 0),
  observacoes text,
  created_at timestamptz not null default now()
);

create index pedidos_compra_owner_idx on pedidos_compra (owner_id, data desc);

create table pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pedido_id uuid not null references pedidos_compra (id) on delete cascade,
  produto_id uuid references produtos (id) on delete set null,
  variacao_id uuid references produto_variacoes (id) on delete set null,
  produto_nome text not null,
  quantidade integer not null check (quantidade > 0),
  valor_unitario numeric(12, 2) not null check (valor_unitario >= 0),
  frete_rateado numeric(12, 2) not null default 0 check (frete_rateado >= 0),
  custo_unitario_final numeric(12, 2) not null check (custo_unitario_final >= 0)
);

create index pedido_compra_itens_pedido_idx on pedido_compra_itens (pedido_id);

alter table pedidos_compra enable row level security;
alter table pedido_compra_itens enable row level security;

-- sem policy de insert, update e delete: o cliente só lê; a escrita é da função
create policy "pedidos_compra_select_own" on pedidos_compra
  for select using (owner_id = auth.uid());
create policy "pedido_compra_itens_select_own" on pedido_compra_itens
  for select using (owner_id = auth.uid());

-- gatilho de posse (0031): fornecedor, produto e variação têm que ser do mesmo dono
create trigger pedidos_compra_posse before insert or update on pedidos_compra
  for each row execute function checar_posse_relacionada();
create trigger pedido_compra_itens_posse before insert or update on pedido_compra_itens
  for each row execute function checar_posse_relacionada();
