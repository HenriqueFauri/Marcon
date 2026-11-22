-- Funil por conta no admin: quando cadastrou o 1º produto, quando fez a 1ª venda
-- e em quantos dias diferentes a conta usou o app (cadastrou produto ou lançou venda).
-- Venda cancelada não conta, nem para a 1ª venda nem para os dias ativos (mesmo padrão de 0048).
-- Só leitura, só para o service_role (mesmo padrão de admin_resumo_por_conta, 0048).

create or replace function admin_funil_por_conta()
returns table (
  owner_id uuid,
  primeiro_produto timestamptz,
  primeira_venda timestamptz,
  dias_ativos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.owner_id, min(pr.created_at) as primeiro
    from produtos pr
    group by pr.owner_id
  ),
  v as (
    select ve.owner_id, min(ve.created_at) as primeira
    from vendas ve
    where ve.status <> 'cancelada'
    group by ve.owner_id
  ),
  d as (
    select x.owner_id, count(distinct x.dia) as dias
    from (
      select pr.owner_id, (pr.created_at at time zone 'America/Sao_Paulo')::date as dia from produtos pr
      union all
      select ve.owner_id, (ve.created_at at time zone 'America/Sao_Paulo')::date from vendas ve where ve.status <> 'cancelada'
    ) x
    group by x.owner_id
  )
  select
    u.id,
    p.primeiro,
    v.primeira,
    coalesce(d.dias, 0)
  from auth.users u
  left join p on p.owner_id = u.id
  left join v on v.owner_id = u.id
  left join d on d.owner_id = u.id;
$$;
revoke all on function admin_funil_por_conta() from public, anon, authenticated;
grant execute on function admin_funil_por_conta() to service_role;
