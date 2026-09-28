-- Fase 1: categorias, produtos, variações, fotos, movimentos de estoque, fluxo de caixa
-- Multi-tenant desde o dia 1: toda tabela carrega owner_id + RLS por dono.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- categorias
-- ---------------------------------------------------------------------------
create table categorias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, nome)
);

alter table categorias enable row level security;

create policy "categorias_select_own" on categorias
  for select using (owner_id = auth.uid());
create policy "categorias_insert_own" on categorias
  for insert with check (owner_id = auth.uid());
create policy "categorias_update_own" on categorias
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "categorias_delete_own" on categorias
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- produtos
-- ---------------------------------------------------------------------------
create type produto_status as enum ('ativo', 'inativo');

create table produtos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  categoria_id uuid references categorias (id) on delete set null,
  nome text not null,
  marca text,
  descricao text,
  status produto_status not null default 'ativo',
  tem_variacoes boolean not null default false,
  custo numeric(12, 2) not null default 0,
  margem_alvo_pct numeric(6, 2),
  preco_varejo numeric(12, 2) not null default 0,
  preco_atacado numeric(12, 2),
  estoque_atual integer not null default 0,
  alerta_estoque_baixo integer,
  unidade_medida text not null default 'un',
  peso_kg numeric(10, 3),
  sku text,
  codigo_barras text,
  comprimento_cm numeric(10, 2),
  largura_cm numeric(10, 2),
  altura_cm numeric(10, 2),
  fornecedor_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index produtos_owner_idx on produtos (owner_id);
create index produtos_owner_status_idx on produtos (owner_id, status);

alter table produtos enable row level security;

create policy "produtos_select_own" on produtos
  for select using (owner_id = auth.uid());
create policy "produtos_insert_own" on produtos
  for insert with check (owner_id = auth.uid());
create policy "produtos_update_own" on produtos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "produtos_delete_own" on produtos
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- variações de produto (cor, tamanho, etc.)
-- ---------------------------------------------------------------------------
create table produto_variacoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  nome_combinacao text not null, -- ex: "Preto", "Azul / P"
  atributos jsonb not null default '{}'::jsonb, -- ex: {"cor": "Preto"}
  custo numeric(12, 2),
  preco_venda numeric(12, 2),
  estoque integer not null default 0,
  sku text,
  created_at timestamptz not null default now()
);

create index produto_variacoes_produto_idx on produto_variacoes (produto_id);

alter table produto_variacoes enable row level security;

create policy "produto_variacoes_select_own" on produto_variacoes
  for select using (owner_id = auth.uid());
create policy "produto_variacoes_insert_own" on produto_variacoes
  for insert with check (owner_id = auth.uid());
create policy "produto_variacoes_update_own" on produto_variacoes
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "produto_variacoes_delete_own" on produto_variacoes
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- fotos de produto
-- ---------------------------------------------------------------------------
create table produto_fotos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  variacao_id uuid references produto_variacoes (id) on delete cascade,
  path text not null, -- caminho no bucket "produto-fotos"
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index produto_fotos_produto_idx on produto_fotos (produto_id);

alter table produto_fotos enable row level security;

create policy "produto_fotos_select_own" on produto_fotos
  for select using (owner_id = auth.uid());
create policy "produto_fotos_insert_own" on produto_fotos
  for insert with check (owner_id = auth.uid());
create policy "produto_fotos_update_own" on produto_fotos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "produto_fotos_delete_own" on produto_fotos
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- histórico de movimentos de estoque (compra, ajuste, devolução — venda entra na fase 2)
--
-- Decisão de produto: excluir um produto NUNCA arrasta o histórico junto por
-- padrão. produto_id/variacao_id usam ON DELETE SET NULL e produto_nome
-- guarda uma cópia do nome (snapshot) pra continuar legível mesmo depois do
-- produto sumir. Apagar o histórico junto é uma ação separada e explícita
-- (ver função excluir_produto abaixo).
-- ---------------------------------------------------------------------------
create type movimento_estoque_tipo as enum ('compra', 'ajuste', 'devolucao');

create table movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid references produtos (id) on delete set null,
  variacao_id uuid references produto_variacoes (id) on delete set null,
  produto_nome text not null, -- snapshot: sobrevive à exclusão do produto
  tipo movimento_estoque_tipo not null,
  quantidade integer not null,
  valor_unitario numeric(12, 2) not null default 0,
  data date not null default current_date,
  fornecedor_nome text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index movimentos_estoque_owner_idx on movimentos_estoque (owner_id, data desc);
create index movimentos_estoque_produto_idx on movimentos_estoque (produto_id);

alter table movimentos_estoque enable row level security;

create policy "movimentos_estoque_select_own" on movimentos_estoque
  for select using (owner_id = auth.uid());
create policy "movimentos_estoque_insert_own" on movimentos_estoque
  for insert with check (owner_id = auth.uid());
create policy "movimentos_estoque_update_own" on movimentos_estoque
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "movimentos_estoque_delete_own" on movimentos_estoque
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- fluxo de caixa (entradas e saídas — vendas entram na fase 2)
-- Mesma decisão de snapshot + SET NULL do histórico de estoque.
-- ---------------------------------------------------------------------------
create type lancamento_tipo as enum ('entrada', 'saida');
create type lancamento_origem as enum ('compra', 'manual', 'ajuste', 'gasto');

create table lancamentos_caixa (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid references produtos (id) on delete set null,
  movimento_estoque_id uuid references movimentos_estoque (id) on delete set null,
  tipo lancamento_tipo not null,
  origem lancamento_origem not null default 'manual',
  categoria text not null default 'Outros',
  descricao text not null,
  valor numeric(12, 2) not null,
  data date not null default current_date,
  afeta_lucro boolean not null default true,
  afeta_caixa boolean not null default true,
  created_at timestamptz not null default now()
);

create index lancamentos_caixa_owner_idx on lancamentos_caixa (owner_id, data desc);

alter table lancamentos_caixa enable row level security;

create policy "lancamentos_caixa_select_own" on lancamentos_caixa
  for select using (owner_id = auth.uid());
create policy "lancamentos_caixa_insert_own" on lancamentos_caixa
  for insert with check (owner_id = auth.uid());
create policy "lancamentos_caixa_update_own" on lancamentos_caixa
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "lancamentos_caixa_delete_own" on lancamentos_caixa
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- excluir produto: apaga o produto sempre; apagar o histórico junto é opcional
-- (decisão do usuário, não arquivamento forçado)
-- ---------------------------------------------------------------------------
create or replace function excluir_produto(p_produto_id uuid, p_apagar_historico boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from produtos where id = p_produto_id and owner_id = auth.uid()
  ) then
    raise exception 'produto não encontrado';
  end if;

  if p_apagar_historico then
    delete from lancamentos_caixa where produto_id = p_produto_id and owner_id = auth.uid();
    delete from movimentos_estoque where produto_id = p_produto_id and owner_id = auth.uid();
  end if;

  delete from produtos where id = p_produto_id and owner_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- bucket de fotos de produto (privado; acesso via signed URL)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produto-fotos', 'produto-fotos', false)
on conflict (id) do nothing;

create policy "produto_fotos_storage_owner" on storage.objects
  for all using (
    bucket_id = 'produto-fotos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'produto-fotos' and (storage.foldername(name))[1] = auth.uid()::text
  );
