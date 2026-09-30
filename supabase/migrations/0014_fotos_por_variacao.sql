-- Foto por variação e limite de fotos do plano grátis.
--
-- 1. plano grátis passa de 1 para 3 fotos por produto e por variação (cada variação
--    conta à parte; o teto de 10 fotos por produto e por variação, das migrations
--    0011, segue valendo para todos);
-- 2. a foto de uma variação só pode apontar para uma variação DO MESMO produto
--    (sem isto, a coluna aceitava qualquer variação que existisse).

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
    raise exception 'No plano grátis cada produto e cada variação têm % fotos. Assine o plano Marcon para ter até 10.', v_max;
  end if;
  return new;
end;
$$;

create or replace function validar_foto_variacao() returns trigger
language plpgsql
as $$
begin
  if new.variacao_id is not null and not exists (
    select 1 from produto_variacoes where id = new.variacao_id and produto_id = new.produto_id
  ) then
    raise exception 'A variação da foto não pertence a este produto.';
  end if;
  return new;
end;
$$;

create trigger produto_fotos_valida_variacao
  before insert on produto_fotos
  for each row execute function validar_foto_variacao();
