-- Vitrine pública: o vendedor escolhe quais produtos mostrar e o cliente monta o pedido,
-- que sai pronto para o WhatsApp do vendedor (sem pagamento nem pedido gravado).
--
--  * vitrines: uma por vendedor (slug do link, WhatsApp, cor, frase de boas-vindas);
--  * produtos.na_vitrine: o interruptor por produto (começa desligado);
--  * vitrine_publica(slug): o que a página pública lê, sem login. Devolve só o que o
--    cliente deve ver: nada de custo, margem, estoque exato ou dados de outros donos.
--
-- Só teste e plano pago têm vitrine. Quem cai no grátis não perde nada: a loja só deixa
-- de abrir até assinar de novo.

create table if not exists vitrines (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  ativa boolean not null default false,
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  cor text not null default '#0f766e' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  boas_vindas text check (char_length(boas_vindas) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vitrines enable row level security;

drop policy if exists "vitrines_select_own" on vitrines;
create policy "vitrines_select_own" on vitrines
  for select using (owner_id = auth.uid());
drop policy if exists "vitrines_insert_own" on vitrines;
create policy "vitrines_insert_own" on vitrines
  for insert with check (owner_id = auth.uid());
drop policy if exists "vitrines_update_own" on vitrines;
create policy "vitrines_update_own" on vitrines
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "vitrines_delete_own" on vitrines;
create policy "vitrines_delete_own" on vitrines
  for delete using (owner_id = auth.uid());

alter table produtos add column if not exists na_vitrine boolean not null default false;
create index if not exists produtos_vitrine_idx on produtos (owner_id) where na_vitrine;

-- Dados da vitrine para quem tem o link, sem login. Devolve null quando a vitrine não
-- existe, está desligada ou o dono não tem mais plano com vitrine.
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
      'boas_vindas', vt.boas_vindas,
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
        'tem_variacoes', p.tem_variacoes,
        'esgotado', case
          when p.tem_variacoes then not exists (select 1 from produto_variacoes v where v.produto_id = p.id and v.estoque > 0)
          else p.estoque_atual <= 0
        end,
        'variacoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'nome', v.nome_combinacao,
            'preco', coalesce(v.preco_venda, p.preco_varejo),
            'esgotado', v.estoque <= 0
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
