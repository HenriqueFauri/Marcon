-- F24: onde o anúncio está publicado. Por produto e canal, guarda o link do anúncio, a data em que
-- foi publicado (ou renovado) e de quantos em quantos dias lembrar de renovar (o Marketplace derruba
-- anúncio velho). O aviso é calculado na tela: publicado_em + renovar_dias.
-- Não mexe em produto_anuncios nem em ia_geracoes (a cota da IA continua como estava).
-- Número 0059 fica reservado a esta frente e não foi usado.

create table if not exists anuncio_publicacoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  canal_id uuid not null references canais_venda (id) on delete cascade,
  link text check (link is null or (char_length(link) <= 500 and link ~* '^https?://')),
  publicado_em date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  renovar_dias integer not null default 30 check (renovar_dias between 1 and 365),
  updated_at timestamptz not null default now(),
  unique (produto_id, canal_id)
);

create index if not exists anuncio_publicacoes_owner_idx on anuncio_publicacoes (owner_id);

alter table anuncio_publicacoes enable row level security;

drop policy if exists "anuncio_publicacoes_select_own" on anuncio_publicacoes;
create policy "anuncio_publicacoes_select_own" on anuncio_publicacoes
  for select using (owner_id = auth.uid());
drop policy if exists "anuncio_publicacoes_insert_own" on anuncio_publicacoes;
create policy "anuncio_publicacoes_insert_own" on anuncio_publicacoes
  for insert with check (owner_id = auth.uid());
drop policy if exists "anuncio_publicacoes_update_own" on anuncio_publicacoes;
create policy "anuncio_publicacoes_update_own" on anuncio_publicacoes
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "anuncio_publicacoes_delete_own" on anuncio_publicacoes;
create policy "anuncio_publicacoes_delete_own" on anuncio_publicacoes
  for delete using (owner_id = auth.uid());

-- gatilho de posse (0031): produto_id e canal_id precisam ser do mesmo dono da linha
drop trigger if exists anuncio_publicacoes_posse on anuncio_publicacoes;
create trigger anuncio_publicacoes_posse
  before insert or update on anuncio_publicacoes
  for each row execute function checar_posse_relacionada();
