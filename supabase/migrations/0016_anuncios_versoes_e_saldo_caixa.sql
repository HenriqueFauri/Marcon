-- 1. Anúncios: várias versões de título/descrição por produto e canal, e cada
--    versão pode ser do produto todo ou de uma variação específica.
--    As linhas que já existem viram a "versão 1" de cada canal.
-- 2. saldo_caixa: soma do caixa no banco (o PostgREST corta consultas em 1000
--    linhas, então somar no app deixava o saldo errado em contas com histórico).

alter table produto_anuncios drop constraint if exists produto_anuncios_produto_id_canal_id_key;

alter table produto_anuncios
  add column variacao_id uuid references produto_variacoes (id) on delete cascade,
  add column created_at timestamptz not null default now();

drop function if exists salvar_anuncio_produto(uuid, uuid, text, text);

-- cria (p_id nulo) ou atualiza uma versão de anúncio; devolve o id
create or replace function salvar_anuncio_versao(
  p_id uuid,
  p_produto_id uuid,
  p_canal_id uuid,
  p_variacao_id uuid,
  p_titulo text,
  p_descricao text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into produto_anuncios (owner_id, produto_id, canal_id, variacao_id, titulo, descricao)
    values (auth.uid(), p_produto_id, p_canal_id, p_variacao_id, p_titulo, p_descricao)
    returning id into v_id;
  else
    update produto_anuncios
      set variacao_id = p_variacao_id, titulo = p_titulo, descricao = p_descricao, updated_at = now()
      where id = p_id and owner_id = auth.uid()
      returning id into v_id;
    if v_id is null then
      raise exception 'anúncio não encontrado';
    end if;
  end if;
  return v_id;
end;
$$;

-- saldo do caixa até uma data (inclusive), só do dono logado
create or replace function saldo_caixa(p_ate date default null)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
  from lancamentos_caixa
  where owner_id = auth.uid()
    and afeta_caixa
    and (p_ate is null or data <= p_ate);
$$;
