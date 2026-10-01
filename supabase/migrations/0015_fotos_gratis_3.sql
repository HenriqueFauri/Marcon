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
