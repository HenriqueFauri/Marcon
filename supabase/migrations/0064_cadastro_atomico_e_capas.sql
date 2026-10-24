-- 1. criar_produto_cadastro: o cadastro de produto (com variações e estoque inicial) numa transação só.
--    Antes eram várias chamadas do app: se a entrada de estoque falhasse, o produto ficava criado sem
--    estoque. Agora ou entra tudo (produto, variações, entradas e o lançamento no caixa) ou nada.
--    O estoque inicial reaproveita registrar_entrada_estoque (custo médio, movimento e caixa).
--    p_afeta_caixa = false: "Esse estoque já era meu" (entra no estoque, não sai do caixa).
--    p_variacoes: [{ "nome": text, "sku": text|null, "custo": numeric|null, "preco": numeric|null, "estoque": int }]
-- 2. produto_capas: a capa de cada produto (primeira foto geral; foto de variação só se não houver geral)
--    e o total de fotos, calculados no banco. As telas liam todas as fotos e o PostgREST corta em 1000.
-- 3. saldo_caixa_como e resumo_caixa_como: os totais do caixa para o assistente do WhatsApp (abaixo).
-- Idempotente. RLS respeitada: as funções são security invoker e a view é security_invoker.

create or replace function criar_produto_cadastro(
  p_produto jsonb,
  p_variacoes jsonb default '[]'::jsonb,
  p_estoque_inicial integer default 0,
  p_afeta_caixa boolean default true,
  p_data date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_data date := coalesce(p_data, hoje_br());
  v_produto_id uuid;
  v_custo numeric := coalesce((p_produto->>'custo')::numeric, 0);
  v_fornecedor_id uuid := nullif(p_produto->>'fornecedor_id', '')::uuid;
  v_fornecedor_nome text := nullif(p_produto->>'fornecedor_nome', '');
  v_variacao jsonb;
  v_variacao_id uuid;
  v_estoque integer;
begin
  if v_owner is null then
    raise exception 'sessão expirada';
  end if;
  if coalesce(p_estoque_inicial, 0) < 0 then
    raise exception 'o estoque inicial não pode ser negativo';
  end if;

  insert into produtos (
    owner_id, categoria_id, nome, marca, descricao, sku, codigo_barras, custo, preco_varejo, preco_atacado,
    alerta_estoque_baixo, unidade_medida, estoque_atual, tem_variacoes, fornecedor_nome, fornecedor_id
  )
  values (
    v_owner,
    nullif(p_produto->>'categoria_id', '')::uuid,
    p_produto->>'nome',
    nullif(p_produto->>'marca', ''),
    nullif(p_produto->>'descricao', ''),
    nullif(p_produto->>'sku', ''),
    nullif(p_produto->>'codigo_barras', ''),
    v_custo,
    coalesce((p_produto->>'preco_varejo')::numeric, 0),
    (p_produto->>'preco_atacado')::numeric,
    (p_produto->>'alerta_estoque_baixo')::integer,
    coalesce(nullif(p_produto->>'unidade_medida', ''), 'un'),
    0,
    coalesce((p_produto->>'tem_variacoes')::boolean, false),
    v_fornecedor_nome,
    v_fornecedor_id
  )
  returning id into v_produto_id;

  if coalesce(p_estoque_inicial, 0) > 0 then
    perform registrar_entrada_estoque(
      p_produto_id => v_produto_id,
      p_variacao_id => null,
      p_quantidade => p_estoque_inicial,
      p_valor_unitario => v_custo,
      p_data => v_data,
      p_fornecedor_nome => v_fornecedor_nome,
      p_observacoes => 'Estoque inicial do cadastro',
      p_fornecedor_id => v_fornecedor_id,
      p_afeta_caixa => coalesce(p_afeta_caixa, true)
    );
  end if;

  for v_variacao in select * from jsonb_array_elements(coalesce(p_variacoes, '[]'::jsonb)) loop
    insert into produto_variacoes (owner_id, produto_id, nome_combinacao, sku, custo, preco_venda)
    values (
      v_owner,
      v_produto_id,
      v_variacao->>'nome',
      nullif(v_variacao->>'sku', ''),
      (v_variacao->>'custo')::numeric,
      (v_variacao->>'preco')::numeric
    )
    returning id into v_variacao_id;

    v_estoque := coalesce((v_variacao->>'estoque')::integer, 0);
    if v_estoque < 0 then
      raise exception 'o estoque da variação "%" não pode ser negativo', v_variacao->>'nome';
    end if;
    if v_estoque > 0 then
      perform registrar_entrada_estoque(
        p_produto_id => v_produto_id,
        p_variacao_id => v_variacao_id,
        p_quantidade => v_estoque,
        p_valor_unitario => coalesce((v_variacao->>'custo')::numeric, v_custo),
        p_data => v_data,
        p_fornecedor_nome => v_fornecedor_nome,
        p_observacoes => 'Estoque inicial do cadastro',
        p_fornecedor_id => v_fornecedor_id,
        p_afeta_caixa => coalesce(p_afeta_caixa, true)
      );
    end if;
  end loop;

  return v_produto_id;
end;
$$;

revoke execute on function criar_produto_cadastro(jsonb, jsonb, integer, boolean, date) from public, anon;
grant execute on function criar_produto_cadastro(jsonb, jsonb, integer, boolean, date) to authenticated, service_role;

-- uma linha por produto com foto: a capa e quantas fotos ele tem
create or replace view produto_capas
with (security_invoker = true) as
select distinct on (f.produto_id)
  f.produto_id,
  f.path,
  (count(*) over (partition by f.produto_id))::integer as total_fotos
from produto_fotos f
order by f.produto_id, (f.variacao_id is not null), f.ordem, f.created_at, f.id;

revoke all on produto_capas from public, anon;
grant select on produto_capas to authenticated, service_role;

-- 3. Saldo e resumo do caixa para o assistente do WhatsApp, que roda com a chave de serviço (sem
--    auth.uid()): mesma conta da saldo_caixa e da resumo_caixa (0016 e 0022), com o dono explícito.
--    Antes o assistente lia os lançamentos com .limit alto e somava no app. Só a chave de serviço executa.
create or replace function saldo_caixa_como(p_owner uuid, p_ate date default null)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
  from lancamentos_caixa
  where owner_id = p_owner
    and afeta_caixa
    and (p_ate is null or data <= p_ate);
$$;

create or replace function resumo_caixa_como(p_owner uuid, p_inicio date, p_fim_exclusivo date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'entradas', coalesce(sum(valor) filter (where tipo = 'entrada'), 0),
    'saidas', coalesce(sum(valor) filter (where tipo = 'saida'), 0),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', c.categoria, 'valor', c.total) order by c.total desc)
      from (
        select categoria, sum(valor) as total
        from lancamentos_caixa
        where owner_id = p_owner and tipo = 'saida' and data >= p_inicio and data < p_fim_exclusivo
        group by categoria
        order by total desc
        limit 5
      ) c
    ), '[]'::jsonb)
  )
  from lancamentos_caixa
  where owner_id = p_owner and data >= p_inicio and data < p_fim_exclusivo;
$$;

revoke execute on function saldo_caixa_como(uuid, date) from public, anon, authenticated;
grant execute on function saldo_caixa_como(uuid, date) to service_role;
revoke execute on function resumo_caixa_como(uuid, date, date) from public, anon, authenticated;
grant execute on function resumo_caixa_como(uuid, date, date) to service_role;
