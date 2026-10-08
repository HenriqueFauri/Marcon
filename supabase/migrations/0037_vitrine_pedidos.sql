-- Pedidos recebidos pela vitrine. Quando o cliente toca em "Enviar pedido", a loja grava o pedido
-- aqui antes de abrir o WhatsApp: o vendedor vê a lista no app e transforma em venda com um toque.
-- O código (ex.: K7P2Q) vai também na mensagem do WhatsApp, para casar o pedido com a conversa.
-- O cliente pode desistir no WhatsApp: pedido gravado não quer dizer pedido enviado.
--
-- Segurança: só o dono lê, muda o status ou apaga (RLS). Ninguém insere direto: a gravação passa
-- pela função registrar_pedido_vitrine, só da chave de serviço, chamada pela server action da loja
-- depois do limite por IP. A função não confia no navegador: preço, nome, cupom, frete e total
-- saem do banco; do cliente vêm só os ids, as quantidades e os dados de entrega.

create table if not exists vitrine_pedidos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-Z0-9]{4,8}$'),
  -- [{produto_id, variacao_id, nome, variacao, preco, quantidade}], com nome e preço da hora do pedido
  itens jsonb not null check (jsonb_typeof(itens) = 'array'),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  desconto numeric(12, 2) not null default 0 check (desconto >= 0),
  cupom text,
  frete numeric(10, 2) check (frete is null or frete >= 0),
  total numeric(12, 2) not null check (total >= 0),
  cliente_nome text check (char_length(cliente_nome) <= 80),
  entrega text not null check (entrega in ('entrega', 'retirada')),
  endereco text check (char_length(endereco) <= 300),
  pagamento text check (char_length(pagamento) <= 60),
  status text not null default 'novo' check (status in ('novo', 'vendido', 'descartado')),
  venda_id uuid references vendas (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vitrine_pedidos_owner_idx on vitrine_pedidos (owner_id, created_at desc);

alter table vitrine_pedidos enable row level security;

drop policy if exists "vitrine_pedidos_select_own" on vitrine_pedidos;
create policy "vitrine_pedidos_select_own" on vitrine_pedidos for select using (owner_id = auth.uid());
drop policy if exists "vitrine_pedidos_update_own" on vitrine_pedidos;
create policy "vitrine_pedidos_update_own" on vitrine_pedidos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "vitrine_pedidos_delete_own" on vitrine_pedidos;
create policy "vitrine_pedidos_delete_own" on vitrine_pedidos for delete using (owner_id = auth.uid());

-- Grava o pedido e conta nas métricas (substitui o evento "pedido" de registrar_evento_vitrine).
-- p_itens: [{produto_id, variacao_id, quantidade}]. p_dados: {cliente_nome, entrega, endereco, pagamento, cupom}.
-- p_ignorar: o dono logado testando a própria loja grava o pedido (para ver funcionando) mas não conta métrica.
create or replace function registrar_pedido_vitrine(p_slug text, p_codigo text, p_itens jsonb, p_dados jsonb, p_ignorar uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vt vitrines%rowtype;
  v_itens jsonb;
  v_subtotal numeric(12, 2);
  v_desconto numeric(12, 2) := 0;
  v_cupom vitrine_cupons%rowtype;
  v_entrega text;
  v_frete numeric(10, 2);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_vt from vitrines where slug = lower(p_slug) and ativa;
  if v_vt.owner_id is null or plano_do_usuario(v_vt.owner_id) not in ('pago', 'teste') then
    return;
  end if;
  if p_codigo !~ '^[A-Z0-9]{4,8}$' or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 50 then
    return;
  end if;

  -- só produtos desta loja, na vitrine, ativos e com estoque; preço e nome do banco
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'produto_id', p.id,
      'variacao_id', v.id,
      'nome', p.nome,
      'variacao', v.nome_combinacao,
      'preco', coalesce(v.preco_venda, p.preco_varejo),
      'quantidade', i.quantidade
    ) order by i.ordem), '[]'::jsonb),
    coalesce(sum(coalesce(v.preco_venda, p.preco_varejo) * i.quantidade), 0)
  into v_itens, v_subtotal
  from (
    select
      (e->>'produto_id')::uuid as produto_id,
      nullif(e->>'variacao_id', '')::uuid as variacao_id,
      least(greatest((e->>'quantidade')::integer, 1), 99) as quantidade,
      ordem
    from jsonb_array_elements(p_itens) with ordinality as x(e, ordem)
    where (e->>'produto_id') ~* '^[0-9a-f-]{36}$'
      and coalesce(e->>'variacao_id', '') ~* '^([0-9a-f-]{36})?$'
      and (e->>'quantidade') ~ '^[0-9]{1,2}$'
  ) i
  join produtos p on p.id = i.produto_id and p.owner_id = v_vt.owner_id and p.na_vitrine and p.status = 'ativo'
  left join produto_variacoes v on v.id = i.variacao_id and v.produto_id = p.id and v.owner_id = p.owner_id
  where (i.variacao_id is null and not p.tem_variacoes and p.estoque_atual > 0)
     or (i.variacao_id is not null and v.id is not null and v.estoque > 0);

  if jsonb_array_length(v_itens) = 0 then
    return;
  end if;

  -- cupom: mesmas regras de validar_cupom_vitrine e de descontoDoCupom (src/lib/vitrine.ts)
  if coalesce(p_dados->>'cupom', '') <> '' then
    select * into v_cupom from vitrine_cupons c
    where c.owner_id = v_vt.owner_id
      and c.codigo = upper(btrim(p_dados->>'cupom'))
      and c.ativo
      and (c.validade is null or c.validade >= v_dia);
    if v_cupom.id is not null and (v_cupom.minimo is null or v_subtotal >= v_cupom.minimo) then
      v_desconto := round(least(
        case when v_cupom.tipo = 'percentual' then v_subtotal * v_cupom.valor / 100 else v_cupom.valor end,
        v_subtotal
      ), 2);
    end if;
  end if;

  -- entrega só do jeito que a loja aceita; frete fixo só na entrega
  v_entrega := case
    when v_vt.entrega = 'ambos' and p_dados->>'entrega' in ('entrega', 'retirada') then p_dados->>'entrega'
    when v_vt.entrega = 'ambos' then 'entrega'
    else v_vt.entrega
  end;
  v_frete := case when v_entrega = 'entrega' then v_vt.frete_fixo end;

  insert into vitrine_pedidos (owner_id, codigo, itens, subtotal, desconto, cupom, frete, total, cliente_nome, entrega, endereco, pagamento)
  values (
    v_vt.owner_id,
    p_codigo,
    v_itens,
    v_subtotal,
    v_desconto,
    case when v_desconto > 0 then v_cupom.codigo end,
    v_frete,
    v_subtotal - v_desconto + coalesce(v_frete, 0),
    nullif(left(btrim(p_dados->>'cliente_nome'), 80), ''),
    v_entrega,
    case when v_entrega = 'entrega' then nullif(left(btrim(p_dados->>'endereco'), 300), '') end,
    nullif(left(btrim(p_dados->>'pagamento'), 60), '')
  );

  if v_vt.owner_id is distinct from p_ignorar then
    insert into vitrine_metricas (owner_id, dia, pedidos) values (v_vt.owner_id, v_dia, 1)
    on conflict (owner_id, dia) do update set pedidos = vitrine_metricas.pedidos + 1;
  end if;
end;
$$;

revoke execute on function registrar_pedido_vitrine(text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function registrar_pedido_vitrine(text, text, jsonb, jsonb, uuid) to service_role;
