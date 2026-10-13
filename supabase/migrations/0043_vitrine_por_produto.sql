-- Vitrine separada dos anúncios: o que a loja mostra de cada produto passa a ser configurado na
-- própria Vitrine (Vitrine > Produtos > produto), não mais na tela de Anúncios.
-- 1. Título e descrição próprios da vitrine. Em branco, vale o nome e a descrição do cadastro.
-- 2. Capa própria da vitrine: a foto escolhida vem primeiro na loja, sem mexer na ordem das fotos
--    do anúncio. Sem capa escolhida (ou foto apagada), vale a ordem das fotos, como antes.
-- A escolha de foto fora da vitrine (produto_fotos.na_vitrine, 0042) continua valendo.

alter table produtos
  add column if not exists vitrine_titulo text check (char_length(vitrine_titulo) <= 120),
  add column if not exists vitrine_descricao text check (char_length(vitrine_descricao) <= 3000),
  add column if not exists vitrine_capa_id uuid references produto_fotos (id) on delete set null;

-- Quem já tinha escolhido uma versão de anúncio para a vitrine (0042) fica com o mesmo texto, agora
-- como texto da vitrine. A coluna vitrine_anuncio_id deixa de ser lida; sai numa migration futura,
-- depois que o código antigo não estiver mais no ar.
update produtos p
set vitrine_titulo = nullif(left(btrim(an.titulo), 120), ''),
    vitrine_descricao = nullif(left(btrim(an.descricao), 3000), '')
from produto_anuncios an
where an.id = p.vitrine_anuncio_id
  and an.produto_id = p.id
  and an.owner_id = p.owner_id
  and p.vitrine_titulo is null
  and p.vitrine_descricao is null;

-- O corpo é o da 0042, trocando a versão de anúncio pelo texto da vitrine e pondo a capa na frente.
create or replace function vitrine_dados(p_owner uuid) returns jsonb
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
      'cor_botao', vt.cor_botao,
      'cor_fundo', vt.cor_fundo,
      'cor_texto', vt.cor_texto,
      'cor_faixa', vt.cor_faixa,
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
        'nome', coalesce(nullif(btrim(p.vitrine_titulo), ''), p.nome),
        'marca', p.marca,
        'descricao', coalesce(nullif(btrim(p.vitrine_descricao), ''), p.descricao),
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
          select jsonb_agg(jsonb_build_object('path', f.path, 'variacao_id', f.variacao_id) order by (f.id = p.vitrine_capa_id) desc nulls last, f.ordem, f.created_at)
          from produto_fotos f
          where f.produto_id = p.id and f.owner_id = p.owner_id and f.na_vitrine and caminho_do_dono(f.path, p.owner_id)
        ), '[]'::jsonb)
      ) order by p.created_at desc)
      from produtos p
      left join categorias c on c.id = p.categoria_id
      where p.owner_id = vt.owner_id and p.na_vitrine and p.status = 'ativo'
    ), '[]'::jsonb)
  )
  from vitrines vt
  join auth.users u on u.id = vt.owner_id
  where vt.owner_id = p_owner;
$$;

revoke execute on function vitrine_dados(uuid) from public, anon, authenticated;
