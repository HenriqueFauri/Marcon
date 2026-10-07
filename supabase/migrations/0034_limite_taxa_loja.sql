-- Auditoria de segurança (A5, A11): as funções da loja pública (contar visita e validar cupom) estavam
-- abertas para qualquer chamada, sem limite: dava para inflar as métricas de qualquer loja e testar
-- códigos de cupom à força. Agora só a chave de serviço chama; a server action da loja aplica o limite
-- por IP com consumir_limite() antes de chamar (src/app/loja/[slug]/actions.ts).

create table limites_taxa (
  chave text not null,
  janela timestamptz not null,
  n integer not null default 0,
  primary key (chave, janela)
);

-- sem política nenhuma: só a chave de serviço lê e grava
alter table limites_taxa enable row level security;

create or replace function consumir_limite(p_chave text, p_max integer, p_segundos integer) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  v_n integer;
begin
  insert into limites_taxa (chave, janela, n) values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set n = limites_taxa.n + 1
  returning n into v_n;
  return v_n <= p_max;
end;
$$;

revoke execute on function consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function consumir_limite(text, integer, integer) to service_role;

-- como a chamada agora vem do servidor (sem o login do visitante), a action diz quem é o visitante
-- logado em p_ignorar: o dono abrindo a própria loja continua sem contar (regra da 0029)
drop function registrar_evento_vitrine(text, text, uuid);
create or replace function registrar_evento_vitrine(p_slug text, p_tipo text, p_produto uuid default null, p_ignorar uuid default null) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select owner_id into v_owner from vitrines where slug = lower(p_slug) and ativa;
  if v_owner is null or v_owner = p_ignorar then
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

revoke execute on function registrar_evento_vitrine(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function registrar_evento_vitrine(text, text, uuid, uuid) to service_role;

revoke execute on function validar_cupom_vitrine(text, text) from anon, authenticated;
grant execute on function validar_cupom_vitrine(text, text) to service_role;
