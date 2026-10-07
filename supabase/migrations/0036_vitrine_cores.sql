-- Cores da vitrine editáveis uma a uma (paleta pronta + ajuste): botão, fundo, texto e faixa de anúncio.
-- "cor" continua sendo o destaque. Vazio = como antes (botão e faixa na cor de destaque, fundo e texto do tema).

alter table vitrines
  add column if not exists cor_botao text check (cor_botao ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_fundo text check (cor_fundo ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_texto text check (cor_texto ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_faixa text check (cor_faixa ~ '^#[0-9a-fA-F]{6}$');

-- mesma função da 0031, agora com as cores novas
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
