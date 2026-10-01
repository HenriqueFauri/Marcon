-- Painel de administração (/admin).
-- Quem é admin vem de ADMIN_EMAILS no servidor, não do banco: a conta do admin é
-- uma conta normal, com o próprio negócio, e só ganha uma tela a mais.

-- Cortesia: plano liberado pelo admin, sem cobrança. Por isso a assinatura
-- pode existir sem cliente no Asaas.
alter table assinaturas alter column asaas_customer_id drop not null;
alter table assinaturas drop constraint assinaturas_status_check;
alter table assinaturas add constraint assinaturas_status_check
  check (status in ('pendente', 'ativa', 'atrasada', 'cancelada', 'cortesia'));

-- Uso de cada conta, para a lista do admin. Só a chave de serviço chama:
-- nenhum usuário logado enxerga os números dos outros.
create or replace function admin_uso_por_conta()
returns table (owner_id uuid, produtos bigint, vendas_mes bigint, ultima_venda date)
language sql
security definer
set search_path = public
as $$
  select u.id,
    (select count(*) from produtos p where p.owner_id = u.id),
    (select count(*) from vendas v
      where v.owner_id = u.id and v.status <> 'cancelada'
        and v.data >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date),
    (select max(v.data) from vendas v where v.owner_id = u.id and v.status <> 'cancelada')
  from auth.users u;
$$;

revoke all on function admin_uso_por_conta() from public, anon, authenticated;
grant execute on function admin_uso_por_conta() to service_role;

-- Cortesia conta como plano pago nos limites (migration 0013).
create or replace function plano_do_usuario(p_owner uuid) returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists (select 1 from assinaturas where owner_id = p_owner and status in ('ativa', 'atrasada', 'cortesia')) then 'pago'
    when coalesce((select created_at from auth.users where id = p_owner), '-infinity'::timestamptz) + interval '14 days' > now() then 'teste'
    else 'gratis'
  end;
$$;

revoke execute on function plano_do_usuario(uuid) from public, anon, authenticated;

-- Plano grátis: 3 fotos por produto (e por variação), em vez de 1.
create or replace function limites_do_plano(p_plano text) returns jsonb
language sql
immutable
as $$
  select case
    when p_plano = 'gratis' then
      jsonb_build_object('vendas_mes', 30, 'produtos', 50, 'fotos_por_item', 3, 'importa_historico', false)
    else
      jsonb_build_object('vendas_mes', null, 'produtos', null, 'fotos_por_item', 10, 'importa_historico', true)
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
    where produto_id = new.produto_id and variacao_id is not distinct from new.variacao_id
  ) >= v_max then
    raise exception 'No plano grátis cada produto tem até % fotos. Assine o plano Marcon para ter até 10.', v_max;
  end if;
  return new;
end;
$$;
