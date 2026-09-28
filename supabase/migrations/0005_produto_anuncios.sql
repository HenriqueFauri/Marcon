-- Fase 3b: título e descrição de anúncio por produto e por canal — a lacuna
-- que o Notion ainda cobria. Diferente do histórico financeiro, aqui não faz
-- sentido manter um anúncio "órfão" sem produto ou sem canal, então usa
-- cascade mesmo (não é um registro de dinheiro/histórico).

create table produto_anuncios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  canal_id uuid not null references canais_venda (id) on delete cascade,
  titulo text,
  descricao text,
  updated_at timestamptz not null default now(),
  unique (produto_id, canal_id)
);

create index produto_anuncios_produto_idx on produto_anuncios (produto_id);

alter table produto_anuncios enable row level security;

create policy "produto_anuncios_select_own" on produto_anuncios
  for select using (owner_id = auth.uid());
create policy "produto_anuncios_insert_own" on produto_anuncios
  for insert with check (owner_id = auth.uid());
create policy "produto_anuncios_update_own" on produto_anuncios
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "produto_anuncios_delete_own" on produto_anuncios
  for delete using (owner_id = auth.uid());

-- upsert de um anúncio (título/descrição) de um produto num canal
create or replace function salvar_anuncio_produto(
  p_produto_id uuid,
  p_canal_id uuid,
  p_titulo text,
  p_descricao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into produto_anuncios (owner_id, produto_id, canal_id, titulo, descricao, updated_at)
  values (auth.uid(), p_produto_id, p_canal_id, p_titulo, p_descricao, now())
  on conflict (produto_id, canal_id)
  do update set titulo = excluded.titulo, descricao = excluded.descricao, updated_at = now();
end;
$$;
