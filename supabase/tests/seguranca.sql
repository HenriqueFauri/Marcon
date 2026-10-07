-- Roteiro de segurança (auditoria de 07/10/2026). Roda depois das migrations 0029 a 0034.
-- Sempre desfaz tudo no fim: o último comando é um RAISE EXCEPTION com o resultado, então nada fica gravado.
-- Como rodar: colar no SQL Editor do Supabase (ou execute_sql) e ler a mensagem de erro final.
--   "SEGURANCA OK ..."  = todos os testes passaram
--   "SEGURANCA FALHOU ..." = lista o que falhou
-- Precisa de pelo menos 2 contas e de um dono com produto e venda; o que não der para testar vai em "pulados".

do $teste$
declare
  a uuid;            -- dono dos dados usados no teste
  b uuid;            -- outra conta (o "atacante")
  prod_a uuid;
  venda_a uuid;
  criada_a timestamptz;
  ia_id uuid;
  n integer;
  oks integer := 0;
  falhas text[] := '{}';
  pulados text[] := '{}';
  v_ts timestamptz;
  tem_0032 boolean;
  tem_0033 boolean;
  tem_0034 boolean;
begin
  select owner_id into a from vendas order by created_at limit 1;
  select id into prod_a from produtos where owner_id = a order by created_at limit 1;
  select id, created_at into venda_a, criada_a from vendas where owner_id = a order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  -- cada bloco só roda se a migration dele já foi aplicada (0031 é obrigatória)
  tem_0032 := not exists (select 1 from pg_policies where tablename = 'ia_geracoes' and policyname = 'ia_geracoes_delete_own');
  tem_0033 := exists (select 1 from pg_constraint where conname = 'produto_fotos_path_do_dono');
  tem_0034 := to_regprocedure('consumir_limite(text,integer,integer)') is not null;
  if a is null or b is null or prod_a is null then
    raise exception 'SEGURANCA PULADA: faltam 2 contas, um produto e uma venda para testar';
  end if;

  -- sem os limites de plano atrapalhando o que está sendo testado
  alter table ia_geracoes disable trigger ia_geracoes_limites_do_plano;
  alter table produto_fotos disable trigger produto_fotos_limites_do_plano;
  alter table produto_fotos disable trigger produto_fotos_limite;

  -- A1/A2: B não grava nada apontando para o produto de A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into produto_variacoes (owner_id, produto_id, nome_combinacao) values (b, prod_a, 'INJETADA');
    falhas := falhas || 'B inseriu variação no produto de A';
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := falhas || ('variação recusada pelo motivo errado: ' || sqlerrm); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (b, prod_a, b::text || '/x/foto.jpg');
    falhas := falhas || 'B inseriu foto no produto de A';
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := falhas || ('foto recusada pelo motivo errado: ' || sqlerrm); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into ia_geracoes (owner_id, produto_id, canal, modelo) values (b, prod_a, 'teste', 'teste');
    falhas := falhas || 'B inseriu geração de IA no produto de A';
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := falhas || ('IA recusada pelo motivo errado: ' || sqlerrm); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_anuncios (owner_id, produto_id) values (b, prod_a);
    falhas := falhas || 'B inseriu anúncio no produto de A';
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := falhas || ('anúncio recusado pelo motivo errado: ' || sqlerrm); end if;
  end;

  -- o próprio dono continua conseguindo
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into produto_variacoes (owner_id, produto_id, nome_combinacao) values (a, prod_a, 'TESTE-DONO');
    oks := oks + 1;
  exception when others then
    falhas := falhas || ('dono não conseguiu criar variação: ' || sqlerrm);
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (a, prod_a, a::text || '/' || prod_a::text || '/teste.jpg');
    oks := oks + 1;
  exception when others then
    falhas := falhas || ('dono não conseguiu criar foto: ' || sqlerrm);
  end;

  -- A4: caminho de arquivo fora da pasta do dono é recusado pelo banco
  if tem_0033 then
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (a, prod_a, b::text || '/x/foto.jpg');
    falhas := falhas || 'foto com caminho da pasta de outra conta foi aceita';
  exception when others then
    if sqlerrm like '%path_do_dono%' then oks := oks + 1; else falhas := falhas || ('caminho recusado pelo motivo errado: ' || sqlerrm); end if;
  end;
  select count(*) into n from vitrines where owner_id = a;
  if n > 0 then
    execute 'set local role authenticated';
    begin
      update vitrines set banner_paths = array[b::text || '/x/banner.jpg'] where owner_id = a;
      falhas := falhas || 'banner com caminho de outra conta foi aceito';
    exception when others then
      if sqlerrm like '%banner_do_dono%' then oks := oks + 1; else falhas := falhas || ('banner recusado pelo motivo errado: ' || sqlerrm); end if;
    end;
  else
    pulados := pulados || 'banner (a conta de teste não tem vitrine)';
  end if;
  execute 'reset role';
  if caminho_do_dono('../x/y.jpg', a) or caminho_do_dono(b::text || '/x.jpg', a) or not caminho_do_dono(a::text || '/p/x.jpg', a) then
    falhas := falhas || 'caminho_do_dono respondeu errado';
  else
    oks := oks + 1;
  end if;
  else
    pulados := pulados || '0033 (caminhos)';
  end if;

  -- A3: o usuário não zera a cota de IA nem o limite de vendas
  if tem_0032 then
  execute 'reset role';
  insert into ia_geracoes (owner_id, produto_id, canal, modelo) values (a, prod_a, 'teste', 'teste') returning id into ia_id;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from ia_geracoes where id = ia_id;
  get diagnostics n = row_count;
  if n = 0 then oks := oks + 1; else falhas := falhas || 'usuário apagou linha de ia_geracoes'; end if;
  update ia_geracoes set created_at = '2020-01-01' where id = ia_id;
  execute 'reset role';
  select created_at into v_ts from ia_geracoes where id = ia_id;
  if v_ts > now() - interval '1 day' then oks := oks + 1; else falhas := falhas || 'usuário mudou created_at de ia_geracoes'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update vendas set created_at = '2020-01-01' where id = venda_a;
  delete from vendas where id = venda_a;
  get diagnostics n = row_count;
  execute 'reset role';
  select created_at into v_ts from vendas where id = venda_a;
  if v_ts is null then falhas := falhas || 'usuário apagou uma venda';
  elsif v_ts <> criada_a then falhas := falhas || 'usuário mudou created_at da venda';
  else oks := oks + 1; end if;
  else
    pulados := pulados || '0032 (limites travados)';
  end if;

  -- A5/A11/A7: o que é só da chave de serviço e o que continua público
  execute 'reset role';
  if tem_0034 then
  if consumir_limite('teste-limite', 2, 600) and consumir_limite('teste-limite', 2, 600) and not consumir_limite('teste-limite', 2, 600) then
    oks := oks + 1;
  else
    falhas := falhas || 'consumir_limite não limitou';
  end if;
  execute 'set local role anon';
  begin
    perform consumir_limite('x', 1, 60);
    falhas := falhas || 'anon chamou consumir_limite';
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform registrar_evento_vitrine('qualquer', 'visita', null, null);
    falhas := falhas || 'anon chamou registrar_evento_vitrine';
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform validar_cupom_vitrine('qualquer', 'CODIGO');
    falhas := falhas || 'anon chamou validar_cupom_vitrine';
  exception when insufficient_privilege then oks := oks + 1; end;
  execute 'reset role';
  else
    pulados := pulados || '0034 (limite de taxa)';
  end if;
  execute 'set local role anon';
  begin
    perform cancelar_venda(venda_a);
    falhas := falhas || 'anon chamou cancelar_venda';
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform vitrine_publica('qualquer');
    perform recibo_publico('00000000-0000-0000-0000-000000000000');
    oks := oks + 1;
  exception when others then
    falhas := falhas || ('função pública quebrou para anon: ' || sqlerrm);
  end;
  execute 'reset role';

  if cardinality(falhas) = 0 then
    raise exception 'SEGURANCA OK: % testes passaram. Pulados: %. (resultado, tudo desfeito)', oks, pulados;
  else
    raise exception 'SEGURANCA FALHOU: % passaram, falhas: %. Pulados: %. (tudo desfeito)', oks, falhas, pulados;
  end if;
end;
$teste$;
