-- Vitrine, extras da v1: entrega/retirada, frete fixo, tema, barra de anúncio, Instagram,
-- endereço no rodapé, aviso de últimas unidades e destaques. Tudo aditivo, com padrão.
--
--  * vitrines.entrega: 'ambos' | 'entrega' | 'retirada' (o que o cliente pode escolher no pedido);
--  * vitrines.frete_fixo: valor somado ao total quando o cliente escolhe entrega (null = sem frete);
--  * vitrines.tema: 'claro' | 'escuro';
--  * vitrines.ultimas_unidades: mostra "Últimas N" quando restam de 1 a 5 (nunca o estoque acima disso);
--  * produtos.destaque: aparece no carrossel de destaques no topo da loja.
-- As formas de pagamento são as já cadastradas em Configurações.

alter table vitrines
  add column if not exists entrega text not null default 'ambos' check (entrega in ('ambos', 'entrega', 'retirada')),
  add column if not exists frete_fixo numeric(10, 2) check (frete_fixo is null or frete_fixo >= 0),
  add column if not exists instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column if not exists mostrar_endereco boolean not null default false,
  add column if not exists anuncio text check (char_length(anuncio) <= 120),
  add column if not exists tema text not null default 'claro' check (tema in ('claro', 'escuro')),
  add column if not exists ultimas_unidades boolean not null default true;

alter table produtos add column if not exists destaque boolean not null default false;

create or replace function vitrine_publica(p_slug text) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'loja', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'logo_path', u.raw_user_meta_data->>'empresa_logo_path',
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
          when p.tem_variacoes then not exists (select 1 from produto_variacoes v where v.produto_id = p.id and v.estoque > 0)
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
          from produto_variacoes v where v.produto_id = p.id
        ), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(jsonb_build_object('path', f.path, 'variacao_id', f.variacao_id) order by f.ordem, f.created_at)
          from produto_fotos f where f.produto_id = p.id
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
