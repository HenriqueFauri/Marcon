-- Auditoria de segurança (A4): a loja e o recibo assinam, com a chave de serviço, caminhos de arquivo
-- vindos de colunas que o usuário edita (fotos, banner) e dos metadados dele (logo). Nada conferia
-- que o caminho estava na pasta do próprio dono, então dava para apontar para arquivo privado alheio.
-- caminho_do_dono() foi criada na 0031.

create or replace function caminhos_do_dono(ps text[], dono uuid) returns boolean
language sql immutable
as $$ select coalesce(bool_and(caminho_do_dono(x, dono)), true) from unnest(ps) x $$;

alter table produto_fotos add constraint produto_fotos_path_do_dono check (caminho_do_dono(path, owner_id)) not valid;
alter table vitrines add constraint vitrines_banner_do_dono check (caminhos_do_dono(banner_paths, owner_id)) not valid;
-- a conferência em produção (07/10/2026) não achou nenhuma linha fora da pasta, então já valida
alter table produto_fotos validate constraint produto_fotos_path_do_dono;
alter table vitrines validate constraint vitrines_banner_do_dono;

-- banner: só os caminhos da pasta do dono (defesa extra, além do CHECK)
create or replace function vitrine_banner(p_slug text) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'paths', coalesce((select jsonb_agg(b) from unnest(vt.banner_paths) b where caminho_do_dono(b, vt.owner_id)), '[]'::jsonb),
    'titulo', vt.banner_titulo,
    'subtitulo', vt.banner_subtitulo,
    'botao', vt.banner_botao
  )
  from vitrines vt
  where vt.slug = lower(p_slug)
    and vt.ativa
    and plano_do_usuario(vt.owner_id) in ('pago', 'teste');
$$;

revoke execute on function vitrine_banner(text) from public;
grant execute on function vitrine_banner(text) to anon, authenticated;

-- recibo: o logo só sai se estiver na pasta do dono (o logo mora nos metadados, que o banco não restringe)
create or replace function recibo_publico(p_token uuid) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'empresa', jsonb_build_object(
      'nome', coalesce(nullif(u.raw_user_meta_data->>'nome_negocio', ''), u.raw_user_meta_data->>'nome'),
      'telefone', u.raw_user_meta_data->>'empresa_telefone',
      'email', u.raw_user_meta_data->>'empresa_email',
      'endereco', u.raw_user_meta_data->>'empresa_endereco',
      'documento', u.raw_user_meta_data->>'empresa_documento',
      'logo_path', case when caminho_do_dono(u.raw_user_meta_data->>'empresa_logo_path', u.id) then u.raw_user_meta_data->>'empresa_logo_path' end
    ),
    'venda', jsonb_build_object(
      'data', v.data,
      'cliente_nome', v.cliente_nome,
      'tipo_pagamento', v.tipo_pagamento,
      'forma_pagamento', v.forma_pagamento,
      'valor_total', v.valor_total,
      'desconto', v.desconto,
      'status', v.status
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.produto_nome, 'quantidade', i.quantidade, 'preco_unitario', i.preco_unitario
      ) order by i.produto_nome)
      from venda_itens i where i.venda_id = v.id
    ), '[]'::jsonb),
    'parcelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero_parcela,
        'vencimento', p.vencimento,
        'valor', p.valor,
        'status', case when p.status = 'pendente' and p.vencimento < hoje_br() then 'atrasado' else p.status::text end,
        'data_pagamento', p.data_pagamento
      ) order by p.numero_parcela)
      from parcelas p where p.venda_id = v.id
    ), '[]'::jsonb)
  )
  from vendas v
  join auth.users u on u.id = v.owner_id
  where v.recibo_token = p_token;
$$;

revoke execute on function recibo_publico(uuid) from public;
grant execute on function recibo_publico(uuid) to anon, authenticated;
