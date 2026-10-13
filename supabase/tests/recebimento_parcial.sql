-- Roteiro do recebimento parcial de parcela (migration 0045).
-- Sempre desfaz tudo no fim: o último comando é um RAISE EXCEPTION com o resultado, então nada fica gravado.
-- Como rodar: colar no SQL Editor do Supabase (ou execute_sql) e ler a mensagem de erro final.
--   "PARCIAL OK ..."      = todos os testes passaram
--   "PARCIAL FALHOU ..."  = lista o que falhou
-- Roda na conta de teste do Staging (teste.staging@usemarcon.com), que precisa de um produto
-- sem variação com pelo menos 1 em estoque. Em outro banco, troque o e-mail abaixo.

do $teste$
declare
  email_teste constant text := 'teste.staging@usemarcon.com';
  fn regprocedure := 'receber_parcela(uuid, numeric, date)'::regprocedure;
  dono uuid;
  prod_id uuid;
  estoque_antes integer;
  estoque_depois integer;
  v uuid;
  p1 uuid;
  p2 uuid;
  saldo_antes numeric;
  n integer;
  x numeric;
  d date;
  r jsonb;
  oks text[] := '{}';
  falhas text[] := '{}';
begin
  -- 1) permissões: só quem está logado (e o servidor) executa
  if has_function_privilege('anon', fn, 'execute') then falhas := array_append(falhas, 'anon executa'); else oks := array_append(oks, 'anon sem permissao'); end if;
  if has_function_privilege('authenticated', fn, 'execute') then oks := array_append(oks, 'authenticated executa'); else falhas := array_append(falhas, 'authenticated NAO executa'); end if;

  select id into dono from auth.users where email = email_teste;
  if dono is null then
    raise exception 'PARCIAL FALHOU: conta % não existe neste banco', email_teste;
  end if;
  select p.id, p.estoque_atual into prod_id, estoque_antes
    from produtos p where p.owner_id = dono and not p.tem_variacoes and p.estoque_atual >= 1 order by p.created_at limit 1;
  if prod_id is null then
    raise exception 'PARCIAL FALHOU: a conta de teste não tem produto sem variação com estoque';
  end if;

  -- as funções usam auth.uid(): o teste roda como a conta de teste
  perform set_config('request.jwt.claims', jsonb_build_object('sub', dono, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', dono::text, true);
  if auth.uid() is distinct from dono then
    raise exception 'PARCIAL FALHOU: não consegui assumir a conta de teste';
  end if;

  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0) into saldo_antes
    from lancamentos_caixa where owner_id = dono;

  -- venda a prazo de R$ 200 em 2 parcelas de R$ 100, a primeira vencida há 10 dias
  v := registrar_venda_como(dono, null, 'Teste Parcial',
    jsonb_build_array(jsonb_build_object('produto_id', prod_id, 'variacao_id', null, 'quantidade', 1, 'preco_unitario', 200)),
    0, 'a_prazo', null, null, 2, hoje_br() - 10, hoje_br(), null, null, 0);
  select id into p1 from parcelas where venda_id = v and numero_parcela = 1;
  select id into p2 from parcelas where venda_id = v and numero_parcela = 2;
  select count(*), sum(valor) into n, x from parcelas where venda_id = v;
  if n = 2 and x = 200 then oks := array_append(oks, 'venda com 2 parcelas de 100'); else falhas := array_append(falhas, format('venda nasceu com %s parcelas somando %s', n, x)); end if;
  select count(*) into n from lancamentos_caixa where venda_id = v;
  if n = 0 then oks := array_append(oks, 'a prazo nao entra no caixa'); else falhas := array_append(falhas, 'venda a prazo lancou no caixa'); end if;

  -- 2) valores inválidos são recusados e nada muda
  begin
    perform receber_parcela(p1, 0, hoje_br());
    falhas := array_append(falhas, 'aceitou valor zero');
  exception when others then oks := array_append(oks, 'recusa valor zero');
  end;
  begin
    perform receber_parcela(p1, -5, hoje_br());
    falhas := array_append(falhas, 'aceitou valor negativo');
  exception when others then oks := array_append(oks, 'recusa valor negativo');
  end;
  begin
    perform receber_parcela(p1, 100.01, hoje_br());
    falhas := array_append(falhas, 'aceitou valor maior que a parcela');
  exception when others then oks := array_append(oks, 'recusa valor maior que o que falta');
  end;
  begin
    perform receber_parcela(gen_random_uuid(), 10, hoje_br());
    falhas := array_append(falhas, 'aceitou parcela inexistente');
  exception when others then oks := array_append(oks, 'recusa parcela inexistente');
  end;

  -- 3) recebe R$ 50 da parcela 1, com data de 3 dias atrás
  r := receber_parcela(p1, 50, hoje_br() - 3);
  if (r ->> 'recebido')::numeric = 50 and (r ->> 'restante')::numeric = 50 and not (r ->> 'quitada')::boolean then
    oks := array_append(oks, 'retorno do parcial');
  else
    falhas := array_append(falhas, 'retorno do parcial errado: ' || r::text);
  end if;

  -- caixa: uma entrada de 50 na data do recebimento, ligada à parte recebida
  select count(*), sum(l.valor), min(l.data) into n, x, d
    from lancamentos_caixa l where l.venda_id = v and l.tipo = 'entrada';
  if n = 1 and x = 50 and d = hoje_br() - 3 then oks := array_append(oks, 'caixa recebeu 50 na data');
  else falhas := array_append(falhas, format('caixa apos parcial: %s lancamentos, %s, data %s', n, x, d)); end if;
  select count(*) into n from lancamentos_caixa l join parcelas p on p.id = l.parcela_id
    where l.venda_id = v and p.parcial and p.status = 'pago' and p.valor = 50 and p.numero_parcela = 1
      and p.lancamento_caixa_id = l.id and p.data_pagamento = hoje_br() - 3;
  if n = 1 then oks := array_append(oks, 'parte recebida ligada ao lancamento'); else falhas := array_append(falhas, 'parte recebida sem ligacao com o lancamento'); end if;

  -- saldo em aberto: a parcela original continua pendente (e atrasada) valendo 50
  select valor into x from parcelas where id = p1 and status = 'pendente' and not parcial;
  if x = 50 then oks := array_append(oks, 'parcela segue em aberto com 50'); else falhas := array_append(falhas, format('parcela original ficou com %s', x)); end if;
  select count(*) into n from parcelas_com_status where id = p1 and status_efetivo = 'atrasado';
  if n = 1 then oks := array_append(oks, 'resto continua atrasado'); else falhas := array_append(falhas, 'resto deixou de ser atrasado'); end if;
  select sum(valor) into x from parcelas_com_status where venda_id = v and status <> 'pago';
  if x = 150 then oks := array_append(oks, 'em aberto 150'); else falhas := array_append(falhas, format('em aberto %s, esperado 150', x)); end if;
  select sum(valor) into x from parcelas where venda_id = v;
  if x = 200 then oks := array_append(oks, 'parcelas somam o total da venda'); else falhas := array_append(falhas, format('parcelas somam %s', x)); end if;

  -- 4) segundo parcial, de R$ 20: sobra 30
  r := receber_parcela(p1, 20, hoje_br());
  select valor into x from parcelas where id = p1;
  select count(*) into n from parcelas where venda_id = v and parcial;
  if x = 30 and n = 2 then oks := array_append(oks, 'segundo parcial deixa 30'); else falhas := array_append(falhas, format('segundo parcial: falta %s, %s partes', x, n)); end if;
  begin
    perform receber_parcela(p1, 30.01, hoje_br());
    falhas := array_append(falhas, 'aceitou mais que o resto');
  exception when others then oks := array_append(oks, 'recusa mais que o resto');
  end;

  -- 5) quitação: receber os 30 que faltam fecha a parcela
  r := receber_parcela(p1, 30, hoje_br());
  select count(*) into n from parcelas where id = p1 and status = 'pago' and valor = 30 and data_pagamento = hoje_br() and lancamento_caixa_id is not null;
  if n = 1 and (r ->> 'quitada')::boolean then oks := array_append(oks, 'quitacao fecha a parcela'); else falhas := array_append(falhas, 'quitacao nao fechou a parcela: ' || r::text); end if;
  select sum(valor) into x from lancamentos_caixa where venda_id = v and tipo = 'entrada';
  if x = 100 then oks := array_append(oks, 'caixa soma 100 na parcela quitada'); else falhas := array_append(falhas, format('caixa soma %s, esperado 100', x)); end if;
  select count(*) into n from (select parcela_id from lancamentos_caixa where venda_id = v group by parcela_id having count(*) > 1) dup;
  if n = 0 then oks := array_append(oks, 'um lancamento por parte'); else falhas := array_append(falhas, 'parte com dois lancamentos'); end if;
  begin
    perform receber_parcela(p1, 10, hoje_br());
    falhas := array_append(falhas, 'recebeu de parcela ja paga');
  exception when others then oks := array_append(oks, 'recusa parcela ja paga');
  end;

  -- 6) parcial na parcela 2 (R$ 40) e depois cancela a venda
  perform receber_parcela(p2, 40, hoje_br());
  select sum(valor) into x from parcelas_com_status where venda_id = v and status <> 'pago';
  if x = 60 then oks := array_append(oks, 'em aberto 60 antes de cancelar'); else falhas := array_append(falhas, format('em aberto %s antes de cancelar', x)); end if;

  perform cancelar_venda(v);
  select coalesce(sum(valor), 0) into x from lancamentos_caixa where venda_id = v and tipo = 'saida' and categoria = 'Estorno';
  if x = 140 then oks := array_append(oks, 'cancelar estorna os 140 recebidos'); else falhas := array_append(falhas, format('estorno de %s, esperado 140', x)); end if;
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0) into x from lancamentos_caixa where venda_id = v;
  if x = 0 then oks := array_append(oks, 'venda cancelada zera no caixa'); else falhas := array_append(falhas, format('venda cancelada deixou %s no caixa', x)); end if;
  select count(*) into n from parcelas where venda_id = v and status <> 'pago';
  if n = 0 then oks := array_append(oks, 'cancelar remove o que estava em aberto'); else falhas := array_append(falhas, 'sobrou parcela em aberto na venda cancelada'); end if;
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0) into x from lancamentos_caixa where owner_id = dono;
  if x = saldo_antes then oks := array_append(oks, 'saldo do caixa voltou ao de antes'); else falhas := array_append(falhas, format('saldo %s, antes %s', x, saldo_antes)); end if;
  select estoque_atual into estoque_depois from produtos where id = prod_id;
  if estoque_depois = estoque_antes then oks := array_append(oks, 'estoque voltou'); else falhas := array_append(falhas, format('estoque %s -> %s', estoque_antes, estoque_depois)); end if;

  -- 7) outra conta não recebe parcela que não é dela
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform receber_parcela(p2, 10, hoje_br());
    falhas := array_append(falhas, 'outra conta recebeu a parcela');
  exception when others then oks := array_append(oks, 'outra conta nao recebe');
  end;

  if array_length(falhas, 1) is null then
    raise exception 'PARCIAL OK (%): %', array_length(oks, 1), array_to_string(oks, '; ');
  else
    raise exception 'PARCIAL FALHOU: % | ok: %', array_to_string(falhas, '; '), array_to_string(oks, '; ');
  end if;
end
$teste$;
