-- Vitrine: cupons de desconto e métricas simples (visitas, pedidos enviados, produtos abertos).
--
--  * vitrine_cupons: o dono cria; a loja pública só consegue validar um código por vez
--    (validar_cupom_vitrine), nunca listar os cupons;
--  * vitrine_metricas / vitrine_metricas_produto: contadores por dia (fuso de Brasília). A loja
--    pública só soma pela função registrar_evento_vitrine; ninguém de fora lê. Contador por dia
--    (e não um registro por evento) mantém as tabelas pequenas.

-- ---------------------------------------------------------------------------
-- cupons
-- ---------------------------------------------------------------------------
create table if not exists vitrine_cupons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-Z0-9]{3,20}$'),
  tipo text not null check (tipo in ('percentual', 'valor')),
  valor numeric(10, 2) not null check (valor > 0),
  minimo numeric(10, 2) check (minimo is null or minimo > 0),
  validade date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, codigo),
  check (tipo <> 'percentual' or valor <= 90)
);

alter table vitrine_cupons enable row level security;

drop policy if exists "vitrine_cupons_select_own" on vitrine_cupons;
create policy "vitrine_cupons_select_own" on vitrine_cupons for select using (owner_id = auth.uid());
drop policy if exists "vitrine_cupons_insert_own" on vitrine_cupons;
create policy "vitrine_cupons_insert_own" on vitrine_cupons for insert with check (owner_id = auth.uid());
drop policy if exists "vitrine_cupons_update_own" on vitrine_cupons;
create policy "vitrine_cupons_update_own" on vitrine_cupons
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "vitrine_cupons_delete_own" on vitrine_cupons;
create policy "vitrine_cupons_delete_own" on vitrine_cupons for delete using (owner_id = auth.uid());

-- um código digitado na loja: devolve o desconto se o cupom vale hoje, ou null
create or replace function validar_cupom_vitrine(p_slug text, p_codigo text) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object('codigo', c.codigo, 'tipo', c.tipo, 'valor', c.valor, 'minimo', c.minimo)
  from vitrines vt
  join vitrine_cupons c on c.owner_id = vt.owner_id
  where vt.slug = lower(p_slug)
    and vt.ativa
    and plano_do_usuario(vt.owner_id) in ('pago', 'teste')
    and c.codigo = upper(btrim(p_codigo))
    and c.ativo
    and (c.validade is null or c.validade >= (now() at time zone 'America/Sao_Paulo')::date);
$$;

revoke execute on function validar_cupom_vitrine(text, text) from public;
grant execute on function validar_cupom_vitrine(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- métricas
-- ---------------------------------------------------------------------------
create table if not exists vitrine_metricas (
  owner_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,
  visitas integer not null default 0,
  pedidos integer not null default 0,
  primary key (owner_id, dia)
);

create table if not exists vitrine_metricas_produto (
  owner_id uuid not null references auth.users (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  dia date not null,
  aberturas integer not null default 0,
  primary key (owner_id, produto_id, dia)
);

alter table vitrine_metricas enable row level security;
alter table vitrine_metricas_produto enable row level security;

drop policy if exists "vitrine_metricas_select_own" on vitrine_metricas;
create policy "vitrine_metricas_select_own" on vitrine_metricas for select using (owner_id = auth.uid());
drop policy if exists "vitrine_metricas_produto_select_own" on vitrine_metricas_produto;
create policy "vitrine_metricas_produto_select_own" on vitrine_metricas_produto for select using (owner_id = auth.uid());

-- soma um evento da loja pública: 'visita', 'pedido' (clicou em enviar pelo WhatsApp) ou 'produto' (abriu um produto)
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
  if v_owner is null then
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
