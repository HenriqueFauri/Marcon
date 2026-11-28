-- Extensão do WhatsApp Web, parte 4: sequências enviadas por clique. Uma sequência é uma lista
-- ordenada de passos ("boas-vindas", foto do catálogo, áudio explicando, Pix). Cada passo tem um
-- texto (escrito ali ou vindo de uma resposta pronta, com as mesmas variáveis) e/ou um arquivo da
-- biblioteca de mídia. Na extensão o dono avança passo a passo: cada clique coloca o próximo texto
-- na caixa ou abre a prévia do anexo. Quem envia é sempre o dono. Nada de timer nem envio sozinho.
--
-- Limites travados no banco (o app repete): 50 sequências por conta e 20 passos por sequência.
-- Os mesmos números vivem em src/lib/sequencias.ts.

create table sequencias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 60),
  ordem integer not null default 0 check (ordem between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sequencias_owner_idx on sequencias (owner_id, ordem, created_at);

create table sequencia_passos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sequencia_id uuid not null references sequencias (id) on delete cascade,
  ordem integer not null default 0 check (ordem between 0 and 10000),
  -- texto escrito no passo, ou o de uma resposta pronta (lido na hora, acompanha a edição dela)
  texto text check (texto is null or (char_length(btrim(texto)) >= 1 and char_length(texto) <= 2000)),
  resposta_id uuid references respostas_prontas (id) on delete set null,
  -- apagar o arquivo ou a resposta não apaga o passo: ele fica vazio e o app avisa
  midia_id uuid references midias (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sequencia_passos_um_texto check (texto is null or resposta_id is null)
);

create index sequencia_passos_seq_idx on sequencia_passos (sequencia_id, ordem, created_at);
create index sequencia_passos_owner_idx on sequencia_passos (owner_id);
create index sequencia_passos_resposta_idx on sequencia_passos (resposta_id) where resposta_id is not null;
create index sequencia_passos_midia_idx on sequencia_passos (midia_id) where midia_id is not null;

alter table sequencias enable row level security;
alter table sequencia_passos enable row level security;

create policy "sequencias_select_own" on sequencias
  for select to authenticated using (owner_id = auth.uid());
create policy "sequencias_insert_own" on sequencias
  for insert to authenticated with check (owner_id = auth.uid());
create policy "sequencias_update_own" on sequencias
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sequencias_delete_own" on sequencias
  for delete to authenticated using (owner_id = auth.uid());

create policy "sequencia_passos_select_own" on sequencia_passos
  for select to authenticated using (owner_id = auth.uid());
create policy "sequencia_passos_insert_own" on sequencia_passos
  for insert to authenticated with check (owner_id = auth.uid());
create policy "sequencia_passos_update_own" on sequencia_passos
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sequencia_passos_delete_own" on sequencia_passos
  for delete to authenticated using (owner_id = auth.uid());

-- sem login, nada
revoke all on table sequencias from anon;
revoke all on table sequencia_passos from anon;

-- ---------------------------------------------------------------------------------------------
-- Gatilho de posse (0031) passa a conhecer sequencia_id e midia_id: ninguém põe passo na sequência
-- de outra conta nem aponta para resposta ou arquivo de outra conta. Mesmo corpo da 0074, com as
-- chaves novas no mapa (copie o mapa inteiro se redefinir de novo).

create or replace function checar_posse_relacionada() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo jsonb := to_jsonb(new);
  antigo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  refs constant jsonb := '{
    "produto_id": "produtos", "variacao_id": "produto_variacoes", "venda_id": "vendas",
    "parcela_id": "parcelas", "cliente_id": "clientes", "canal_id": "canais_venda",
    "forma_pagamento_id": "formas_pagamento", "categoria_id": "categorias", "fornecedor_id": "fornecedores",
    "movimento_estoque_id": "movimentos_estoque", "lancamento_caixa_id": "lancamentos_caixa",
    "resposta_id": "respostas_prontas", "midia_id": "midias", "sequencia_id": "sequencias"
  }';
  coluna text;
  existe boolean;
begin
  for coluna in select jsonb_object_keys(refs) loop
    -- só confere o que mudou: UPDATE comum não paga a consulta
    if novo ->> coluna is not null and (novo ->> coluna) is distinct from (antigo ->> coluna) then
      execute format('select exists (select 1 from %I where id = $1 and owner_id = $2)', refs ->> coluna)
        into existe
        using (novo ->> coluna)::uuid, new.owner_id;
      if not existe then
        raise exception 'registro relacionado não encontrado (%)', coluna;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function checar_posse_relacionada() from public, anon, authenticated;

create trigger sequencia_passos_posse before insert or update on sequencia_passos
  for each row execute function checar_posse_relacionada();

-- ---------------------------------------------------------------------------------------------
-- Limites e datas que o usuário não mexe

create or replace function preparar_sequencia() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('sequencias:' || new.owner_id::text, 0));
    if (select count(*) from sequencias where owner_id = new.owner_id) >= 50 then
      raise exception 'Limite de 50 sequências por conta.';
    end if;
    new.created_at := now();
  else
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Não dá para mudar o dono da sequência.';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function preparar_sequencia() from public, anon, authenticated;

create trigger sequencias_preparar before insert or update on sequencias
  for each row execute function preparar_sequencia();

-- Passo novo precisa de conteúdo (texto, resposta ou arquivo). Depois, se a resposta ou o arquivo
-- for apagado, o passo pode ficar vazio (on delete set null); editar o texto pede conteúdo de novo.
create or replace function preparar_passo_sequencia() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('sequencia_passos:' || new.sequencia_id::text, 0));
    if (select count(*) from sequencia_passos where sequencia_id = new.sequencia_id) >= 20 then
      raise exception 'Limite de 20 passos por sequência.';
    end if;
    new.created_at := now();
  else
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Não dá para mudar o dono do passo.';
    end if;
    -- passo não muda de sequência (o limite de 20 é por sequência)
    if new.sequencia_id is distinct from old.sequencia_id then
      raise exception 'Não dá para mudar o passo de sequência.';
    end if;
    new.created_at := old.created_at;
  end if;
  if (tg_op = 'INSERT' or new.texto is distinct from old.texto)
     and new.texto is null and new.resposta_id is null and new.midia_id is null then
    raise exception 'O passo precisa de um texto, uma resposta pronta ou um arquivo.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function preparar_passo_sequencia() from public, anon, authenticated;

create trigger sequencia_passos_preparar before insert or update on sequencia_passos
  for each row execute function preparar_passo_sequencia();

-- ---------------------------------------------------------------------------------------------
-- Reordenar de uma vez (a lista inteira na ordem nova), como reordenar_respostas_prontas. Rodam com
-- a RLS de quem chama: id de outra conta é ignorado.

create or replace function reordenar_sequencias(p_ids uuid[]) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(cardinality(p_ids), 0) > 50 then
    raise exception 'Lista grande demais.';
  end if;
  update sequencias s
    set ordem = x.posicao - 1
    from unnest(p_ids) with ordinality as x (id, posicao)
    where s.id = x.id and s.owner_id = auth.uid();
end;
$$;

revoke execute on function reordenar_sequencias(uuid[]) from public, anon;
grant execute on function reordenar_sequencias(uuid[]) to authenticated;

create or replace function reordenar_passos_sequencia(p_sequencia uuid, p_ids uuid[]) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(cardinality(p_ids), 0) > 20 then
    raise exception 'Lista grande demais.';
  end if;
  update sequencia_passos p
    set ordem = x.posicao - 1
    from unnest(p_ids) with ordinality as x (id, posicao)
    where p.id = x.id and p.sequencia_id = p_sequencia and p.owner_id = auth.uid();
end;
$$;

revoke execute on function reordenar_passos_sequencia(uuid, uuid[]) from public, anon;
grant execute on function reordenar_passos_sequencia(uuid, uuid[]) to authenticated;
