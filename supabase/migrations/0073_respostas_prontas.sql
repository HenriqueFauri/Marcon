-- Extensão do WhatsApp Web, parte 2: respostas prontas salvas na conta (tela em Configurações e
-- seção "Respostas" na extensão). O dono escreve uma vez e insere na conversa com um clique; quem
-- envia é sempre ele. Variáveis como {pix} e {negocio} ficam no texto e são preenchidas na hora,
-- com os dados que a conta já tem (nunca com dado da conversa).
--
-- Pensada para as próximas partes, sem implementar agora:
--   parte 3 (fotos, arquivos e áudios): tabela própria de mídia com resposta_id -> respostas_prontas
--   parte 4 (sequências): tabela de sequências cujos passos apontam para respostas_prontas.id
-- Por isso o id é estável e nada aqui depende da posição na lista (ordem é só a exibição).

create table respostas_prontas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 60),
  texto text not null check (char_length(btrim(texto)) >= 1 and char_length(texto) <= 2000),
  -- atalho curto opcional para achar rápido na extensão ("pix", "entrega"): minúsculas e números
  atalho text check (atalho ~ '^[a-z0-9]{1,20}$'),
  ordem integer not null default 0 check (ordem between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, atalho)
);

create index respostas_prontas_owner_idx on respostas_prontas (owner_id, ordem, created_at);

alter table respostas_prontas enable row level security;

create policy "respostas_prontas_select_own" on respostas_prontas
  for select to authenticated using (owner_id = auth.uid());
create policy "respostas_prontas_insert_own" on respostas_prontas
  for insert to authenticated with check (owner_id = auth.uid());
create policy "respostas_prontas_update_own" on respostas_prontas
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "respostas_prontas_delete_own" on respostas_prontas
  for delete to authenticated using (owner_id = auth.uid());

-- sem login, nada
revoke all on table respostas_prontas from anon;

-- gatilho de posse (0031): hoje a tabela não aponta para outra, mas as partes 3 e 4 vão apontar
create trigger respostas_prontas_posse before insert or update on respostas_prontas
  for each row execute function checar_posse_relacionada();

-- limite por conta (200) e datas que o usuário não mexe
create or replace function preparar_resposta_pronta() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- dois cadastros ao mesmo tempo não passam juntos do limite
    perform pg_advisory_xact_lock(hashtextextended('respostas_prontas:' || new.owner_id::text, 0));
    if (select count(*) from respostas_prontas where owner_id = new.owner_id) >= 200 then
      raise exception 'Limite de 200 respostas prontas por conta.';
    end if;
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function preparar_resposta_pronta() from public, anon, authenticated;

create trigger respostas_prontas_preparar before insert or update on respostas_prontas
  for each row execute function preparar_resposta_pronta();

-- reordenar de uma vez (a lista inteira na ordem nova). Roda com a RLS de quem chama:
-- só mexe nas respostas do próprio dono, id de outra conta é ignorado.
create or replace function reordenar_respostas_prontas(p_ids uuid[]) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(cardinality(p_ids), 0) > 200 then
    raise exception 'Lista grande demais.';
  end if;
  update respostas_prontas r
    set ordem = x.posicao - 1
    from unnest(p_ids) with ordinality as x (id, posicao)
    where r.id = x.id and r.owner_id = auth.uid();
end;
$$;

revoke execute on function reordenar_respostas_prontas(uuid[]) from public, anon;
grant execute on function reordenar_respostas_prontas(uuid[]) to authenticated;
