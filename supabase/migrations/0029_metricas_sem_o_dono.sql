-- Métricas da vitrine: o próprio dono, logado, abrindo a loja para conferir, não conta mais como
-- visita, produto aberto nem pedido. O resto da função é o mesmo da 0028.
create or replace function registrar_evento_vitrine(p_slug text, p_tipo text, p_produto uuid default null) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select owner_id into v_owner from vitrines where slug = lower(p_slug) and ativa;
  if v_owner is null or v_owner = auth.uid() then
    return;
  end if;

  if p_tipo = 'visita' then
    insert into vitrine_metricas (owner_id, dia, visitas) values (v_owner, v_dia, 1)
    on conflict (owner_id, dia) do update set visitas = vitrine_metricas.visitas + 1;
  elsif p_tipo = 'pedido' then
    insert into vitrine_metricas (owner_id, dia, pedidos) values (v_owner, v_dia, 1)
    on conflict (owner_id, dia) do update set pedidos = vitrine_metricas.pedidos + 1;
  elsif p_tipo = 'produto' and p_produto is not null then
    if exists (select 1 from produtos where id = p_produto and owner_id = v_owner and na_vitrine) then
      insert into vitrine_metricas_produto (owner_id, produto_id, dia, aberturas) values (v_owner, p_produto, v_dia, 1)
      on conflict (owner_id, produto_id, dia) do update set aberturas = vitrine_metricas_produto.aberturas + 1;
    end if;
  end if;
end;
$$;

revoke execute on function registrar_evento_vitrine(text, text, uuid) from public;
grant execute on function registrar_evento_vitrine(text, text, uuid) to anon, authenticated;
