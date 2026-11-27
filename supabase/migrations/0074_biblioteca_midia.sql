-- Extensão do WhatsApp Web, parte 3: biblioteca de mídia da conta (fotos, PDFs e áudios) que o
-- dono anexa na conversa pela extensão. A extensão só coloca o arquivo na prévia de anexo do
-- próprio WhatsApp; quem confirma e envia é sempre o dono. Nada aqui guarda conversa.
--
-- Limites travados no banco e no Storage (o app e a extensão repetem, mas quem chama a API direto
-- passa por cima deles): 10 MB por arquivo (bucket), 50 MB e 200 arquivos por conta (política de
-- envio do Storage e gatilho da tabela), só os tipos que o WhatsApp abre (bucket e check).
-- Os mesmos números vivem em src/lib/midias.ts.

-- ---------------------------------------------------------------------------------------------
-- Bucket privado, uma pasta por dono (<owner_id>/<id>.<ext>), acesso só por URL assinada

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'midias', 'midias', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/amr']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Quanto a conta já ocupa no bucket (bytes de verdade, lidos dos metadados do Storage, não do que
-- o navegador declara). Só da própria conta. security definer para ler storage.objects sem cair na
-- política que chama esta função.
create or replace function midias_uso_storage() returns table (bytes bigint, arquivos integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, count(*)::integer
  from storage.objects o
  where auth.uid() is not null
    and o.bucket_id = 'midias'
    and (storage.foldername(o.name))[1] = auth.uid()::text
$$;

revoke execute on function midias_uso_storage() from public, anon;
grant execute on function midias_uso_storage() to authenticated;

create policy "midias_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = auth.uid()::text);

-- enviar: só na própria pasta e enquanto a conta está abaixo de 50 MB e 200 arquivos (passa no
-- máximo um arquivo, de até 10 MB, do total). Sem política de update: não dá para sobrescrever.
create policy "midias_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'midias'
    and (storage.foldername(name))[1] = auth.uid()::text
    and position(chr(46) || chr(46) in name) = 0
    and (select u.bytes < 52428800 and u.arquivos < 200 from midias_uso_storage() u)
  );

create policy "midias_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- Tabela: um registro por arquivo, ligável opcionalmente a uma resposta pronta

create table midias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('imagem', 'documento', 'audio')),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  -- nome com que o arquivo chega no WhatsApp (o PDF mostra esse nome ao cliente)
  nome_arquivo text not null check (char_length(nome_arquivo) between 1 and 120 and nome_arquivo !~ '[/\\]'),
  path text not null unique,
  mime text not null check (
    mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/amr')
  ),
  tamanho bigint not null check (tamanho between 1 and 10485760),
  duracao integer check (duracao between 0 and 900), -- segundos, só áudio
  origem text not null default 'arquivo' check (origem in ('arquivo', 'gravacao')),
  resposta_id uuid references respostas_prontas (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint midias_path_do_dono check (
    caminho_do_dono(path, owner_id) and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf|m4a|mp3|ogg|aac|amr)$'
  ),
  constraint midias_tipo_confere check (
    case tipo
      when 'imagem' then mime like 'image/%'
      when 'documento' then mime = 'application/pdf'
      else mime like 'audio/%'
    end
  ),
  constraint midias_duracao_so_audio check (duracao is null or tipo = 'audio')
);

create index midias_owner_idx on midias (owner_id, created_at desc);
create index midias_resposta_idx on midias (resposta_id) where resposta_id is not null;

alter table midias enable row level security;

create policy "midias_select_own" on midias
  for select to authenticated using (owner_id = auth.uid());
create policy "midias_insert_own" on midias
  for insert to authenticated with check (owner_id = auth.uid());
create policy "midias_update_own" on midias
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "midias_delete_own" on midias
  for delete to authenticated using (owner_id = auth.uid());

revoke all on table midias from anon;

-- Ao registrar: o arquivo tem de já estar no Storage, e tamanho e tipo vêm de lá (não do navegador).
-- Limite de 200 arquivos e 50 MB por conta. Depois de criado, só título, nome e resposta mudam.
create or replace function preparar_midia() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tamanho bigint;
  v_mime text;
  v_total bigint;
  v_qtd integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('midias:' || new.owner_id::text, 0));
    select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_tamanho, v_mime
      from storage.objects o
      where o.bucket_id = 'midias' and o.name = new.path;
    if v_tamanho is null then
      raise exception 'Arquivo não encontrado. Envie de novo.';
    end if;
    new.tamanho := v_tamanho;
    new.mime := v_mime;
    select count(*), coalesce(sum(tamanho), 0) into v_qtd, v_total from midias where owner_id = new.owner_id;
    if v_qtd >= 200 then
      raise exception 'Limite de 200 arquivos na biblioteca de mídia.';
    end if;
    if v_total + new.tamanho > 52428800 then
      raise exception 'A biblioteca de mídia passou de 50 MB. Apague algum arquivo antes.';
    end if;
    new.created_at := now();
  else
    -- trocar o dono é recusado (não trocado em silêncio): o gatilho de posse, que roda antes deste,
    -- conferiu a resposta ligada contra o dono novo
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Não dá para mudar o dono do arquivo.';
    end if;
    new.tipo := old.tipo;
    new.path := old.path;
    new.mime := old.mime;
    new.tamanho := old.tamanho;
    new.duracao := old.duracao;
    new.origem := old.origem;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function preparar_midia() from public, anon, authenticated;

create trigger midias_preparar before insert or update on midias
  for each row execute function preparar_midia();

-- ---------------------------------------------------------------------------------------------
-- Gatilho de posse (0031) passa a conhecer resposta_id: ninguém liga mídia à resposta de outra conta.
-- Mesmo corpo da 0031, com a chave nova no mapa.

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
    "resposta_id": "respostas_prontas"
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

create trigger midias_posse before insert or update on midias
  for each row execute function checar_posse_relacionada();
