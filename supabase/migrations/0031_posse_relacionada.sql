-- Auditoria de segurança (A1, A2): o RLS conferia só o owner_id da linha nova, nunca se o produto,
-- a variação, a venda etc. a que ela aponta é do mesmo dono. A FK ignora RLS, então qualquer conta
-- logada gravava linha própria apontando para o produto de outra pessoa, e a loja pública mostrava.
-- O gatilho abaixo confere a posse de toda referência, para a API, as server actions e as funções.

-- caminho de arquivo do Storage precisa estar na pasta do dono (usada aqui e na 0033)
create or replace function caminho_do_dono(p text, dono uuid) returns boolean
language sql immutable
as $$ select p is not null and starts_with(p, dono::text || chr(47)) and position(chr(46) || chr(46) in p) = 0 $$;

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
    "movimento_estoque_id": "movimentos_estoque", "lancamento_caixa_id": "lancamentos_caixa"
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

create trigger produtos_posse before insert or update on produtos for each row execute function checar_posse_relacionada();
create trigger produto_variacoes_posse before insert or update on produto_variacoes for each row execute function checar_posse_relacionada();
create trigger produto_fotos_posse before insert or update on produto_fotos for each row execute function checar_posse_relacionada();
create trigger produto_anuncios_posse before insert or update on produto_anuncios for each row execute function checar_posse_relacionada();
create trigger ia_geracoes_posse before insert or update on ia_geracoes for each row execute function checar_posse_relacionada();
create trigger vendas_posse before insert or update on vendas for each row execute function checar_posse_relacionada();
create trigger venda_itens_posse before insert or update on venda_itens for each row execute function checar_posse_relacionada();
create trigger parcelas_posse before insert or update on parcelas for each row execute function checar_posse_relacionada();
create trigger movimentos_estoque_posse before insert or update on movimentos_estoque for each row execute function checar_posse_relacionada();
create trigger lancamentos_caixa_posse before insert or update on lancamentos_caixa for each row execute function checar_posse_relacionada();

-- a loja pública junta variações e fotos pelo produto: agora só as do próprio dono
create or replace function vitrine_publica(p_slug text) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'loja', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'logo_path', case when caminho_do_dono(u.raw_user_meta_data->>'empresa_logo_path', u.id) then u.raw_user_meta_data->>'empresa_logo_path' end,
      'whatsapp', vt.whatsapp,
      'cor', vt.cor,
      'tema', vt.tema,
      'boas_vindas', vt.boas_vindas,
      'anuncio', vt.anuncio,
      'entrega', vt.entrega,
      'frete_fixo', vt.frete_fixo,
      'instagram', vt.instagram,
      'endereco', case when vt.mostrar_endereco then nullif(u.raw_user_meta_data->>'empresa_endereco', '') end,
      'formas_pagamento', coalesce((
        select jsonb_agg(fp.nome order by fp.nome) from formas_pagamento fp where fp.owner_id = vt.owner_id
      ), '[]'::jsonb),
      'ref', (select a.codigo from afiliados a where a.owner_id = vt.owner_id)
    ),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'marca', p.marca,
        'descricao', p.descricao,
        'categoria', c.nome,
        'preco', p.preco_varejo,
        'destaque', p.destaque,
        'tem_variacoes', p.tem_variacoes,
        'esgotado', case
          when p.tem_variacoes then not exists (select 1 from produto_variacoes v where v.produto_id = p.id and v.owner_id = p.owner_id and v.estoque > 0)
          else p.estoque_atual <= 0
        end,
        'ultimas', case
          when vt.ultimas_unidades and not p.tem_variacoes and p.estoque_atual between 1 and 5 then p.estoque_atual
        end,
        'variacoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'nome', v.nome_combinacao,
            'preco', coalesce(v.preco_venda, p.preco_varejo),
            'esgotado', v.estoque <= 0,
            'ultimas', case when vt.ultimas_unidades and v.estoque between 1 and 5 then v.estoque end
          ) order by v.created_at)
          from produto_variacoes v where v.produto_id = p.id and v.owner_id = p.owner_id
        ), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(jsonb_build_object('path', f.path, 'variacao_id', f.variacao_id) order by f.ordem, f.created_at)
          from produto_fotos f where f.produto_id = p.id and f.owner_id = p.owner_id and caminho_do_dono(f.path, p.owner_id)
        ), '[]'::jsonb)
      ) order by p.created_at desc)
      from produtos p
      left join categorias c on c.id = p.categoria_id
      where p.owner_id = vt.owner_id and p.na_vitrine and p.status = 'ativo'
    ), '[]'::jsonb)
  )
  from vitrines vt
  join auth.users u on u.id = vt.owner_id
  where vt.slug = lower(p_slug)
    and vt.ativa
    and plano_do_usuario(vt.owner_id) in ('pago', 'teste');
$$;

revoke execute on function vitrine_publica(text) from public;
grant execute on function vitrine_publica(text) to anon, authenticated;

-- o limite de fotos conta só as fotos do próprio dono
create or replace function limitar_fotos_produto() returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from produto_fotos
    where produto_id = new.produto_id
      and owner_id = new.owner_id
      and variacao_id is not distinct from new.variacao_id
  ) >= 10 then
    raise exception 'Limite de 10 fotos atingido.';
  end if;
  return new;
end;
$$;

create or replace function aplicar_limites_foto() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plano text := plano_do_usuario(new.owner_id);
  v_max integer := (limites_do_plano(v_plano)->>'fotos_por_item')::integer;
begin
  if v_plano = 'gratis' and (
    select count(*) from produto_fotos
    where produto_id = new.produto_id and owner_id = new.owner_id
      and variacao_id is not distinct from new.variacao_id
  ) >= v_max then
    raise exception 'No plano grátis cada produto tem até % fotos. Assine o plano Marcon para ter até 10.', v_max;
  end if;
  return new;
end;
$$;

revoke execute on function aplicar_limites_foto() from public, anon, authenticated;
