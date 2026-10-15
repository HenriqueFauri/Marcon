-- Administração do Marcon, mais segura e mais completa.
--
-- 1. Segundo fator de admin: além do e-mail em ADMIN_EMAILS (Vercel), a conta precisa estar na
--    tabela admins (banco). Quem tiver acesso a só um dos dois não vira admin. A tabela não tem
--    política: só a chave de serviço lê e escreve. Linha nova só por SQL no painel do Supabase.
-- 2. Registro do admin: cada vez que o admin abre os dados de outra conta ou age sobre ela.
-- 3. Admin sem teto de anúncios com IA (o resto do plano pago já é ilimitado).
-- 4. Números por conta para o painel: valor vendido e lucro, além da contagem, e o detalhe de uma conta.

create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table admins enable row level security;
revoke all on table admins from anon, authenticated;

create table if not exists admin_registro (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete cascade,
  acao text not null,
  alvo_id uuid,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists admin_registro_criado_idx on admin_registro (criado_em desc);
alter table admin_registro enable row level security;
revoke all on table admin_registro from anon, authenticated;

create or replace function eh_admin(p_user uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = p_user);
$$;
revoke all on function eh_admin(uuid) from public, anon, authenticated;
grant execute on function eh_admin(uuid) to service_role;

-- Anúncios com IA: o admin não tem teto (igual à migration 0017, com a exceção no começo)
create or replace function aplicar_limites_ia() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plano text := plano_do_usuario(new.owner_id);
  v_max integer := (limites_do_plano(v_plano)->>'ia_mes')::integer;
begin
  if eh_admin(new.owner_id) then
    return new;
  end if;
  if v_max is not null and ia_do_mes(new.owner_id) >= v_max then
    if v_plano = 'gratis' then
      raise exception 'Você usou as % escritas com IA do mês no plano grátis. Assine o plano Marcon para ter mais.', v_max;
    end if;
    raise exception 'Você usou as % escritas com IA deste mês. A cota renova no dia 1º.', v_max;
  end if;
  return new;
end;
$$;

-- a tela de uso mostra "sem limite" de IA para o admin (o resto igual à migration 0017)
create or replace function uso_do_plano() returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid := auth.uid();
  v_plano text;
  v_limites jsonb;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  v_plano := plano_do_usuario(v_owner);
  v_limites := limites_do_plano(v_plano);
  if eh_admin(v_owner) then
    v_limites := v_limites || jsonb_build_object('ia_mes', null);
  end if;
  return jsonb_build_object(
    'plano', v_plano,
    'vendas_mes', vendas_do_mes(v_owner),
    'produtos', (select count(*) from produtos where owner_id = v_owner),
    'ia_mes', ia_do_mes(v_owner),
    'limites', v_limites
  );
end;
$$;

-- Números de cada conta para a lista do admin. Venda cancelada não entra. Lucro como no app:
-- valor menos custo dos itens menos outros gastos da venda.
create or replace function admin_resumo_por_conta()
returns table (
  owner_id uuid,
  produtos bigint,
  vendas_mes bigint,
  valor_mes numeric,
  lucro_mes numeric,
  vendas_total bigint,
  valor_total numeric,
  ultima_venda date
)
language sql
stable
security definer
set search_path = public
as $$
  with mes as (
    select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as inicio
  ),
  v as (
    select
      ve.owner_id,
      count(*) filter (where ve.data >= (select inicio from mes)) as vendas_mes,
      coalesce(sum(ve.valor_total) filter (where ve.data >= (select inicio from mes)), 0) as valor_mes,
      coalesce(sum(ve.valor_total - ve.custo_total - ve.outros_gastos) filter (where ve.data >= (select inicio from mes)), 0) as lucro_mes,
      count(*) as vendas_total,
      coalesce(sum(ve.valor_total), 0) as valor_total,
      max(ve.data) as ultima_venda
    from vendas ve
    where ve.status <> 'cancelada'
    group by ve.owner_id
  ),
  p as (
    select pr.owner_id, count(*) as produtos from produtos pr group by pr.owner_id
  )
  select
    u.id,
    coalesce(p.produtos, 0),
    coalesce(v.vendas_mes, 0),
    coalesce(v.valor_mes, 0),
    coalesce(v.lucro_mes, 0),
    coalesce(v.vendas_total, 0),
    coalesce(v.valor_total, 0),
    v.ultima_venda
  from auth.users u
  left join v on v.owner_id = u.id
  left join p on p.owner_id = u.id;
$$;
revoke all on function admin_resumo_por_conta() from public, anon, authenticated;
grant execute on function admin_resumo_por_conta() to service_role;

-- Detalhe de uma conta, só leitura: resumo, estoque, mais vendidos em 90 dias, produtos e últimas vendas
create or replace function admin_conta_detalhe(p_owner uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'resumo', (select to_jsonb(r) from admin_resumo_por_conta() r where r.owner_id = p_owner),
    'estoque', (
      select jsonb_build_object(
        'produtos_ativos', count(*),
        'unidades', coalesce(sum(pe.estoque_total), 0),
        'valor_custo', coalesce(sum(pe.estoque_total * pe.custo), 0)
      )
      from produtos_com_estoque pe
      where pe.owner_id = p_owner and pe.status = 'ativo'
    ),
    'clientes', (select count(*) from clientes c where c.owner_id = p_owner),
    'mais_vendidos', (
      select coalesce(jsonb_agg(x order by x.valor desc), '[]'::jsonb)
      from (
        select vi.produto_nome as nome, sum(vi.quantidade) as unidades, sum(vi.quantidade * vi.preco_unitario) as valor
        from venda_itens vi
        join vendas ve on ve.id = vi.venda_id
        where vi.owner_id = p_owner and ve.status <> 'cancelada' and ve.data >= current_date - 90
        group by vi.produto_nome
        order by 3 desc
        limit 10
      ) x
    ),
    'produtos', (
      select coalesce(jsonb_agg(x order by x.nome), '[]'::jsonb)
      from (
        select pe.nome, pe.estoque_total as estoque, pe.preco_varejo as preco, pe.custo
        from produtos_com_estoque pe
        where pe.owner_id = p_owner and pe.status = 'ativo'
        order by pe.nome
        limit 200
      ) x
    ),
    'ultimas_vendas', (
      select coalesce(jsonb_agg(x order by x.data desc, x.criada desc), '[]'::jsonb)
      from (
        select
          ve.data,
          ve.valor_total as valor,
          ve.valor_total - ve.custo_total - ve.outros_gastos as lucro,
          ve.status,
          ve.forma_pagamento as pagamento,
          ve.created_at as criada,
          (select count(*) from venda_itens vi where vi.venda_id = ve.id) as itens
        from vendas ve
        where ve.owner_id = p_owner
        order by ve.data desc, ve.created_at desc
        limit 20
      ) x
    )
  );
$$;
revoke all on function admin_conta_detalhe(uuid) from public, anon, authenticated;
grant execute on function admin_conta_detalhe(uuid) to service_role;
