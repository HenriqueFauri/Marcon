-- Roteiro de segurança do assistente no WhatsApp (migrations 0038 a 0040).
-- Sempre desfaz tudo no fim: o último comando é um RAISE EXCEPTION com o resultado, então nada fica gravado.
-- Como rodar: colar no SQL Editor do Supabase (ou execute_sql) e ler a mensagem de erro final.
--   "WHATSAPP OK ..."      = todos os testes passaram
--   "WHATSAPP FALHOU ..."  = lista o que falhou
-- Precisa de uma conta com produto sem variação e com pelo menos 2 em estoque (usa a mais antiga que tiver).

do $teste$
declare
  dono uuid;
  fn regprocedure := 'registrar_venda_como(uuid, uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric)'::regprocedure;
  prod_id uuid;
  v uuid;
  antes integer;
  depois integer;
  oks text[] := '{}';
  falhas text[] := '{}';
  v_dono uuid;
  v_total numeric;
  n integer;
  t text;
begin
  -- 1) tabelas do WhatsApp: RLS ligado em todas; as do servidor sem política nenhuma
  foreach t in array array['whatsapp_vinculos', 'whatsapp_codigos', 'whatsapp_conversas', 'whatsapp_acoes'] loop
    if (select relrowsecurity from pg_class where relname = t and relnamespace = 'public'::regnamespace) then
      oks := array_append(oks, t || ' com RLS');
    else
      falhas := array_append(falhas, t || ' SEM RLS');
    end if;
  end loop;
  foreach t in array array['whatsapp_conversas', 'whatsapp_acoes'] loop
    select count(*) into n from pg_policies where tablename = t;
    if n = 0 then oks := array_append(oks, t || ' sem politica'); else falhas := array_append(falhas, t || ' tem politica'); end if;
  end loop;
  -- o dono não cria vínculo sozinho (só o webhook, depois do código chegar pelo WhatsApp)
  select count(*) into n from pg_policies where tablename = 'whatsapp_vinculos' and cmd in ('INSERT', 'UPDATE', 'ALL');
  if n = 0 then oks := array_append(oks, 'vinculo sem insert/update pelo dono'); else falhas := array_append(falhas, 'vinculo aceita insert/update pelo dono'); end if;

  -- 2) registrar_venda_como: só o servidor executa
  if has_function_privilege('anon', fn, 'execute') then falhas := array_append(falhas, 'anon executa'); else oks := array_append(oks, 'anon sem permissao'); end if;
  if has_function_privilege('authenticated', fn, 'execute') then falhas := array_append(falhas, 'authenticated executa'); else oks := array_append(oks, 'authenticated sem permissao'); end if;
  if has_function_privilege('service_role', fn, 'execute') then oks := array_append(oks, 'service_role executa'); else falhas := array_append(falhas, 'service_role NAO executa'); end if;

  -- 3) a venda nasce na conta certa e segue as regras do app
  select p.owner_id, p.id, p.estoque_atual into dono, prod_id, antes
  from produtos p where not p.tem_variacoes and p.estoque_atual >= 2 order by p.created_at limit 1;
  if dono is null then
    falhas := array_append(falhas, 'sem produto para testar');
  else
    v := registrar_venda_como(dono, null, 'Teste WhatsApp', jsonb_build_array(jsonb_build_object('produto_id', prod_id, 'variacao_id', null, 'quantidade', 1, 'preco_unitario', 10)), 0, 'a_vista', 'PIX', null, 1, current_date, current_date, null, null, 0);
    select owner_id, valor_total into v_dono, v_total from vendas where id = v;
    if v_dono = dono and v_total = 10 then oks := array_append(oks, 'venda na conta certa'); else falhas := array_append(falhas, 'venda com dono ou valor errado'); end if;
    select estoque_atual into depois from produtos where id = prod_id;
    if depois = antes - 1 then oks := array_append(oks, 'estoque baixou'); else falhas := array_append(falhas, format('estoque %s -> %s', antes, depois)); end if;
    select count(*) into n from lancamentos_caixa where venda_id = v and owner_id = dono;
    if n >= 1 then oks := array_append(oks, 'lancamento no caixa'); else falhas := array_append(falhas, 'sem lancamento no caixa'); end if;

    begin
      perform registrar_venda_como(dono, null, 'Teste', jsonb_build_array(jsonb_build_object('produto_id', prod_id, 'variacao_id', null, 'quantidade', 99999, 'preco_unitario', 10)), 0, 'a_vista', null, null, 1, current_date, current_date, null, null, 0);
      falhas := array_append(falhas, 'vendeu acima do estoque');
    exception when others then
      oks := array_append(oks, 'bloqueia estoque insuficiente');
    end;
  end if;

  begin
    perform registrar_venda_como('00000000-0000-0000-0000-000000000000', null, 'Teste', '[]'::jsonb, 0, 'a_vista', null, null, 1, current_date, current_date, null, null, 0);
    falhas := array_append(falhas, 'aceitou dono inexistente');
  exception when others then
    oks := array_append(oks, 'recusa dono inexistente');
  end;

  if array_length(falhas, 1) is null then
    raise exception 'WHATSAPP OK (%): %', array_length(oks, 1), array_to_string(oks, '; ');
  else
    raise exception 'WHATSAPP FALHOU: % | ok: %', array_to_string(falhas, '; '), array_to_string(oks, '; ');
  end if;
end
$teste$;
