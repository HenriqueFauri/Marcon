-- Compra a prazo do fornecedor: a compra entra no estoque e no custo na hora, mas não sai do caixa.
-- Em vez disso, abre N contas a pagar mensais (descrição "Compra de <fornecedor>", categoria
-- Fornecimento). O caixa só sai quando a conta é paga em A pagar (pagar_conta, 0055).
--
-- 1. pedidos_compra ganha a_prazo e parcelas (a lista de Compras mostra "A prazo · 3 parcelas").
-- 2. registrar_pedido_compra ganha p_a_prazo, p_parcelas e p_primeiro_vencimento, todos com default:
--    quem chama sem eles continua com a compra à vista (saída única no caixa).
--    Assinatura antiga: (uuid, date, numeric, jsonb, text, boolean)
--    Assinatura nova:   (uuid, date, numeric, jsonb, text, boolean, boolean, integer, date)
--    A função vira security invoker (RLS respeitada); por isso pedidos_compra e pedido_compra_itens
--    ganham policy de insert do próprio dono. Estoque e custo seguem por registrar_entrada_estoque.
-- Idempotente.

alter table pedidos_compra add column if not exists a_prazo boolean not null default false;
alter table pedidos_compra add column if not exists parcelas smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_compra_parcelas_check') then
    alter table pedidos_compra add constraint pedidos_compra_parcelas_check
      check (parcelas is null or parcelas between 1 and 12);
  end if;
end;
$$;

drop policy if exists "pedidos_compra_insert_own" on pedidos_compra;
create policy "pedidos_compra_insert_own" on pedidos_compra
  for insert with check (owner_id = auth.uid());
drop policy if exists "pedido_compra_itens_insert_own" on pedido_compra_itens;
create policy "pedido_compra_itens_insert_own" on pedido_compra_itens
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from pedidos_compra pc where pc.id = pedido_id and pc.owner_id = auth.uid())
  );

-- a assinatura muda: a antiga sai para não ficar duas versões (chamada ambígua)
drop function if exists registrar_pedido_compra(uuid, date, numeric, jsonb, text, boolean);

create or replace function registrar_pedido_compra(
  p_fornecedor_id uuid,
  p_data date,
  p_frete numeric,
  p_itens jsonb,
  p_observacoes text default null,
  p_afeta_caixa boolean default true,
  p_a_prazo boolean default false,
  p_parcelas integer default 1,
  p_primeiro_vencimento date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_data date := coalesce(p_data, hoje_br());
  v_frete numeric := round(coalesce(p_frete, 0), 2);
  v_a_prazo boolean := coalesce(p_a_prazo, false);
  v_parcelas integer := coalesce(p_parcelas, 1);
  v_primeiro date;
  v_dia_base integer;
  v_mes date;
  v_ultimo_dia integer;
  v_valor_parcela numeric;
  v_soma_parcelas numeric := 0;
  v_descricao text;
  v_total_compra numeric;
  v_fornecedor_nome text;
  v_pedido_id uuid;
  v_item jsonb;
  v_n integer;
  v_i integer := 0;
  v_qtd integer;
  v_valor numeric;
  v_linha numeric;
  v_total numeric := 0;
  v_total_qtd numeric := 0;
  v_frete_restante numeric;
  v_frete_linha numeric;
  v_custo_final numeric;
  v_produto_nome text;
  v_variacao_id uuid;
  v_produto_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if v_frete < 0 then
    raise exception 'o frete não pode ser negativo';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'adicione pelo menos um item ao pedido';
  end if;
  v_n := jsonb_array_length(p_itens);
  if v_n > 100 then
    raise exception 'o pedido aceita até 100 itens';
  end if;

  if v_a_prazo then
    if v_parcelas < 1 or v_parcelas > 12 then
      raise exception 'escolha de 1 a 12 parcelas';
    end if;
    v_primeiro := coalesce(p_primeiro_vencimento, v_data + 30);
    if v_primeiro < v_data then
      raise exception 'o primeiro vencimento não pode ser antes da data da compra';
    end if;
  end if;

  if p_fornecedor_id is not null then
    select nome into v_fornecedor_nome from fornecedores
      where id = p_fornecedor_id and owner_id = auth.uid();
    if not found then
      raise exception 'fornecedor não encontrado';
    end if;
  end if;

  -- 1ª passada: valida e soma, para poder ratear o frete
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_valor := (v_item ->> 'valor_unitario')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'a quantidade de cada item precisa ser maior que zero';
    end if;
    if v_valor is null or v_valor < 0 then
      raise exception 'o preço de cada item não pode ser negativo';
    end if;
    v_total := v_total + v_qtd * v_valor;
    v_total_qtd := v_total_qtd + v_qtd;
  end loop;

  v_total_compra := round(v_total, 2) + v_frete;
  if v_a_prazo and v_total_compra < 0.01 * v_parcelas then
    raise exception 'o valor da compra é pequeno demais para % parcelas', v_parcelas;
  end if;

  insert into pedidos_compra (
    owner_id, fornecedor_id, fornecedor_nome, data, frete, total_itens, observacoes, a_prazo, parcelas
  ) values (
    auth.uid(), p_fornecedor_id, v_fornecedor_nome, v_data, v_frete, round(v_total, 2),
    nullif(btrim(p_observacoes), ''), v_a_prazo, case when v_a_prazo then v_parcelas end
  )
  returning id into v_pedido_id;

  v_frete_restante := v_frete;

  -- 2ª passada: frete proporcional ao valor da linha (à quantidade se o pedido for todo de preço zero);
  -- a última linha leva o centavo que sobrou do arredondamento
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_i := v_i + 1;
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_variacao_id := nullif(v_item ->> 'variacao_id', '')::uuid;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_valor := (v_item ->> 'valor_unitario')::numeric;
    v_linha := v_qtd * v_valor;

    if v_i = v_n then
      v_frete_linha := v_frete_restante;
    elsif v_total > 0 then
      v_frete_linha := round(v_frete * v_linha / v_total, 2);
    else
      v_frete_linha := round(v_frete * v_qtd / v_total_qtd, 2);
    end if;
    v_frete_linha := least(v_frete_linha, v_frete_restante);
    v_frete_restante := v_frete_restante - v_frete_linha;

    v_custo_final := round(v_valor + v_frete_linha / v_qtd, 2);

    -- estoque e custo médio pela função de sempre (ela confere a posse do produto e da variação);
    -- o caixa é lançado uma vez só, abaixo (ou vira contas a pagar, se for a prazo)
    perform registrar_entrada_estoque(
      p_produto_id => v_produto_id,
      p_variacao_id => v_variacao_id,
      p_quantidade => v_qtd,
      p_valor_unitario => v_custo_final,
      p_data => v_data,
      p_fornecedor_nome => v_fornecedor_nome,
      p_observacoes => 'Pedido de compra',
      p_fornecedor_id => p_fornecedor_id,
      p_afeta_caixa => false
    );

    select p.nome || coalesce(' — ' || pv.nome_combinacao, '') into v_produto_nome
      from produtos p
      left join produto_variacoes pv on pv.id = v_variacao_id and pv.owner_id = auth.uid()
      where p.id = v_produto_id and p.owner_id = auth.uid();

    insert into pedido_compra_itens (
      owner_id, pedido_id, produto_id, variacao_id, produto_nome, quantidade,
      valor_unitario, frete_rateado, custo_unitario_final
    ) values (
      auth.uid(), v_pedido_id, v_produto_id, v_variacao_id, v_produto_nome, v_qtd,
      round(v_valor, 2), v_frete_linha, v_custo_final
    );
  end loop;

  if v_a_prazo then
    -- N contas a pagar mensais; a última leva os centavos que sobram da divisão.
    -- Vencimentos seguem o dia do primeiro (31/01 vira 28/02 e volta a 31/03), como em pagar_conta.
    v_dia_base := extract(day from v_primeiro)::integer;
    v_valor_parcela := floor(v_total_compra * 100 / v_parcelas) / 100;
    v_descricao := left(coalesce('Compra de ' || v_fornecedor_nome, 'Compra de estoque'), 100);
    for v_i in 1..v_parcelas loop
      v_mes := (date_trunc('month', v_primeiro) + make_interval(months => v_i - 1))::date;
      v_ultimo_dia := extract(day from (v_mes + interval '1 month' - interval '1 day'))::integer;
      insert into contas_a_pagar (
        owner_id, descricao, valor, vencimento, dia_base, recorrencia, categoria, fornecedor_id
      ) values (
        auth.uid(),
        v_descricao || case when v_parcelas > 1 then ' · ' || v_i || ' de ' || v_parcelas else '' end,
        case when v_i = v_parcelas then v_total_compra - v_soma_parcelas else v_valor_parcela end,
        v_mes + (least(v_dia_base, v_ultimo_dia) - 1),
        v_dia_base, 'nenhuma', 'Fornecimento', p_fornecedor_id
      );
      v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
    end loop;
  elsif coalesce(p_afeta_caixa, true) and v_total_compra > 0 then
    insert into lancamentos_caixa (
      owner_id, tipo, origem, categoria, descricao, valor, data, afeta_lucro, afeta_caixa
    ) values (
      auth.uid(), 'saida', 'compra', 'Fornecimento',
      'Pedido de compra' || coalesce(': ' || v_fornecedor_nome, ''),
      v_total_compra, v_data, false, true
    );
  end if;

  return v_pedido_id;
end;
$$;

revoke execute on function registrar_pedido_compra(uuid, date, numeric, jsonb, text, boolean, boolean, integer, date) from public, anon;
grant execute on function registrar_pedido_compra(uuid, date, numeric, jsonb, text, boolean, boolean, integer, date) to authenticated, service_role;
