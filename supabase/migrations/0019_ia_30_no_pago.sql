-- Plano pago: 30 anúncios escritos com IA por mês (antes 100). O grátis segue com 10.
create or replace function limites_do_plano(p_plano text) returns jsonb
language sql
immutable
as $$
  select case
    when p_plano = 'gratis' then
      jsonb_build_object('vendas_mes', 30, 'produtos', 50, 'fotos_por_item', 3, 'importa_historico', false, 'ia_mes', 10)
    else
      jsonb_build_object('vendas_mes', null, 'produtos', null, 'fotos_por_item', 10, 'importa_historico', true, 'ia_mes', 30)
  end;
$$;
