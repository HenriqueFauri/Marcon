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
    falhas := array_append(falhas, 'B inseriu variação no produto de A');
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := array_append(falhas, ('variação recusada pelo motivo errado: ' || sqlerrm)); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (b, prod_a, b::text || '/x/foto.jpg');
    falhas := array_append(falhas, 'B inseriu foto no produto de A');
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := array_append(falhas, ('foto recusada pelo motivo errado: ' || sqlerrm)); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into ia_geracoes (owner_id, produto_id, canal, modelo) values (b, prod_a, 'teste', 'teste');
    falhas := array_append(falhas, 'B inseriu geração de IA no produto de A');
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := array_append(falhas, ('IA recusada pelo motivo errado: ' || sqlerrm)); end if;
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_anuncios (owner_id, produto_id) values (b, prod_a);
    falhas := array_append(falhas, 'B inseriu anúncio no produto de A');
  exception when others then
    if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := array_append(falhas, ('anúncio recusado pelo motivo errado: ' || sqlerrm)); end if;
  end;

  -- o próprio dono continua conseguindo
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into produto_variacoes (owner_id, produto_id, nome_combinacao) values (a, prod_a, 'TESTE-DONO');
    oks := oks + 1;
  exception when others then
    falhas := array_append(falhas, ('dono não conseguiu criar variação: ' || sqlerrm));
  end;
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (a, prod_a, a::text || '/' || prod_a::text || '/teste.jpg');
    oks := oks + 1;
  exception when others then
    falhas := array_append(falhas, ('dono não conseguiu criar foto: ' || sqlerrm));
  end;

  -- A4: caminho de arquivo fora da pasta do dono é recusado pelo banco
  if tem_0033 then
  execute 'set local role authenticated';
  begin
    insert into produto_fotos (owner_id, produto_id, path) values (a, prod_a, b::text || '/x/foto.jpg');
    falhas := array_append(falhas, 'foto com caminho da pasta de outra conta foi aceita');
  exception when others then
    if sqlerrm like '%path_do_dono%' then oks := oks + 1; else falhas := array_append(falhas, ('caminho recusado pelo motivo errado: ' || sqlerrm)); end if;
  end;
  select count(*) into n from vitrines where owner_id = a;
  if n > 0 then
    execute 'set local role authenticated';
    begin
      update vitrines set banner_paths = array[b::text || '/x/banner.jpg'] where owner_id = a;
      falhas := array_append(falhas, 'banner com caminho de outra conta foi aceito');
    exception when others then
      if sqlerrm like '%banner_do_dono%' then oks := oks + 1; else falhas := array_append(falhas, ('banner recusado pelo motivo errado: ' || sqlerrm)); end if;
    end;
  else
    pulados := array_append(pulados, 'banner (a conta de teste não tem vitrine)');
  end if;
  execute 'reset role';
  if caminho_do_dono('../x/y.jpg', a) or caminho_do_dono(b::text || '/x.jpg', a) or not caminho_do_dono(a::text || '/p/x.jpg', a) then
    falhas := array_append(falhas, 'caminho_do_dono respondeu errado');
  else
    oks := oks + 1;
  end if;
  else
    pulados := array_append(pulados, '0033 (caminhos)');
  end if;

  -- A3: o usuário não zera a cota de IA nem o limite de vendas
  if tem_0032 then
  execute 'reset role';
  insert into ia_geracoes (owner_id, produto_id, canal, modelo) values (a, prod_a, 'teste', 'teste') returning id into ia_id;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from ia_geracoes where id = ia_id;
  get diagnostics n = row_count;
  if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'usuário apagou linha de ia_geracoes'); end if;
  update ia_geracoes set created_at = '2020-01-01' where id = ia_id;
  execute 'reset role';
  select created_at into v_ts from ia_geracoes where id = ia_id;
  if v_ts > now() - interval '1 day' then oks := oks + 1; else falhas := array_append(falhas, 'usuário mudou created_at de ia_geracoes'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update vendas set created_at = '2020-01-01' where id = venda_a;
  delete from vendas where id = venda_a;
  get diagnostics n = row_count;
  execute 'reset role';
  select created_at into v_ts from vendas where id = venda_a;
  if v_ts is null then falhas := array_append(falhas, 'usuário apagou uma venda');
  elsif v_ts <> criada_a then falhas := array_append(falhas, 'usuário mudou created_at da venda');
  else oks := oks + 1; end if;
  else
    pulados := array_append(pulados, '0032 (limites travados)');
  end if;

  -- A5/A11/A7: o que é só da chave de serviço e o que continua público
  execute 'reset role';
  if tem_0034 then
  if consumir_limite('teste-limite', 2, 600) and consumir_limite('teste-limite', 2, 600) and not consumir_limite('teste-limite', 2, 600) then
    oks := oks + 1;
  else
    falhas := array_append(falhas, 'consumir_limite não limitou');
  end if;
  execute 'set local role anon';
  begin
    perform consumir_limite('x', 1, 60);
    falhas := array_append(falhas, 'anon chamou consumir_limite');
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform registrar_evento_vitrine('qualquer', 'visita', null, null);
    falhas := array_append(falhas, 'anon chamou registrar_evento_vitrine');
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform validar_cupom_vitrine('qualquer', 'CODIGO');
    falhas := array_append(falhas, 'anon chamou validar_cupom_vitrine');
  exception when insufficient_privilege then oks := oks + 1; end;
  execute 'reset role';
  else
    pulados := array_append(pulados, '0034 (limite de taxa)');
  end if;
  execute 'set local role anon';
  begin
    perform cancelar_venda(venda_a);
    falhas := array_append(falhas, 'anon chamou cancelar_venda');
  exception when insufficient_privilege then oks := oks + 1; end;
  begin
    perform vitrine_publica('qualquer');
    perform recibo_publico('00000000-0000-0000-0000-000000000000');
    oks := oks + 1;
  exception when others then
    falhas := array_append(falhas, ('função pública quebrou para anon: ' || sqlerrm));
  end;
  execute 'reset role';

  if to_regprocedure('admin_funil_por_conta()') is not null then
    execute 'set local role anon';
    begin
      perform admin_funil_por_conta();
      falhas := array_append(falhas, 'anon chamou admin_funil_por_conta');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
    execute 'set local role authenticated';
    begin
      perform admin_funil_por_conta();
      falhas := array_append(falhas, 'authenticated chamou admin_funil_por_conta');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
  else
    pulados := array_append(pulados, '0069 (funil por conta)');
  end if;

  if to_regclass('public.cancelamento_motivos') is not null then
    execute 'set local role anon';
    begin
      perform 1 from cancelamento_motivos;
      falhas := array_append(falhas, 'anon leu cancelamento_motivos');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
    execute 'set local role authenticated';
    begin
      perform 1 from cancelamento_motivos;
      falhas := array_append(falhas, 'authenticated leu cancelamento_motivos');
    exception when insufficient_privilege then oks := oks + 1; end;
    begin
      insert into cancelamento_motivos (owner_id, assinatura_id, motivo) values (gen_random_uuid(), 'x', 'outro');
      falhas := array_append(falhas, 'authenticated inseriu em cancelamento_motivos');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
    -- o insert acima também falharia só pelo RLS: confere o RLS e as permissões separadamente
    if (select relrowsecurity from pg_class where oid = 'public.cancelamento_motivos'::regclass) then
      oks := oks + 1;
    else
      falhas := array_append(falhas, 'cancelamento_motivos sem RLS');
    end if;
    if has_table_privilege('anon', 'public.cancelamento_motivos', 'insert, update, delete')
       or has_table_privilege('authenticated', 'public.cancelamento_motivos', 'insert, update, delete') then
      falhas := array_append(falhas, 'cancelamento_motivos com permissão de escrita');
    else
      oks := oks + 1;
    end if;
  else
    pulados := array_append(pulados, '0071 (motivo do cancelamento)');
  end if;

  if to_regclass('public.cadastro_origem') is not null then
    execute 'set local role anon';
    begin
      perform 1 from cadastro_origem;
      falhas := array_append(falhas, 'anon leu cadastro_origem');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
    execute 'set local role authenticated';
    begin
      perform 1 from cadastro_origem;
      falhas := array_append(falhas, 'authenticated leu cadastro_origem');
    exception when insufficient_privilege then oks := oks + 1; end;
    execute 'reset role';
    if (select relrowsecurity from pg_class where oid = 'public.cadastro_origem'::regclass) then
      oks := oks + 1;
    else
      falhas := array_append(falhas, 'cadastro_origem sem RLS');
    end if;
    if has_table_privilege('anon', 'public.cadastro_origem', 'insert, update, delete')
       or has_table_privilege('authenticated', 'public.cadastro_origem', 'insert, update, delete') then
      falhas := array_append(falhas, 'cadastro_origem com permissão de escrita');
    else
      oks := oks + 1;
    end if;
  else
    pulados := array_append(pulados, '0072 (origem do cadastro)');
  end if;

  -- 0073: respostas prontas. A cria, B não lê, não altera, não apaga, não reordena nem grava em nome
  -- de A; anon não faz nada; o banco trava tamanho e atalho.
  if to_regclass('public.respostas_prontas') is not null then
    declare
      rp_a uuid;
      t text;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      insert into respostas_prontas (titulo, texto, atalho, ordem) values ('Teste A', 'Oi, aqui é da {negocio}', 'testea', 7)
        returning id into rp_a;
      oks := oks + 1;

      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from respostas_prontas where id = rp_a;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B leu resposta pronta de A'); end if;
      update respostas_prontas set texto = 'INVADIDO' where id = rp_a;
      get diagnostics n = row_count;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B alterou resposta pronta de A'); end if;
      delete from respostas_prontas where id = rp_a;
      get diagnostics n = row_count;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B apagou resposta pronta de A'); end if;
      perform reordenar_respostas_prontas(array[rp_a]);
      begin
        insert into respostas_prontas (owner_id, titulo, texto) values (a, 'INJETADA', 'x');
        falhas := array_append(falhas, 'B gravou resposta pronta em nome de A');
      exception when others then oks := oks + 1; end;

      execute 'reset role';
      select texto into t from respostas_prontas where id = rp_a;
      if t = 'Oi, aqui é da {negocio}' then oks := oks + 1; else falhas := array_append(falhas, 'resposta de A mudou depois de B'); end if;
      select ordem::text into t from respostas_prontas where id = rp_a;
      if t = '7' then oks := oks + 1; else falhas := array_append(falhas, 'B reordenou resposta de A'); end if;

      execute 'set local role anon';
      begin
        perform 1 from respostas_prontas;
        falhas := array_append(falhas, 'anon leu respostas_prontas');
      exception when insufficient_privilege then oks := oks + 1; end;
      begin
        insert into respostas_prontas (owner_id, titulo, texto) values (a, 'ANON', 'x');
        falhas := array_append(falhas, 'anon gravou respostas_prontas');
      exception when others then oks := oks + 1; end;
      begin
        perform reordenar_respostas_prontas(array[rp_a]);
        falhas := array_append(falhas, 'anon chamou reordenar_respostas_prontas');
      exception when others then oks := oks + 1; end;
      execute 'reset role';

      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        insert into respostas_prontas (titulo, texto) values ('Longa', repeat('x', 2001));
        falhas := array_append(falhas, 'texto acima de 2000 caracteres aceito');
      exception when check_violation then oks := oks + 1; end;
      begin
        insert into respostas_prontas (titulo, texto, atalho) values ('Atalho', 'x', 'Com Espaço');
        falhas := array_append(falhas, 'atalho fora do padrão aceito');
      exception when check_violation then oks := oks + 1; end;
      begin
        insert into respostas_prontas (titulo, texto, atalho) values ('Repetido', 'x', 'testea');
        falhas := array_append(falhas, 'atalho repetido na mesma conta aceito');
      exception when unique_violation then oks := oks + 1; end;
      execute 'reset role';
    end;
  else
    pulados := array_append(pulados, '0073 (respostas prontas)');
  end if;

  -- 0074: biblioteca de mídia. A registra só arquivo que está no Storage (tamanho e tipo vêm de lá);
  -- B não lê, não altera, não apaga, não liga à resposta de A nem grava na pasta de A; anon nada;
  -- limites de 50 MB e 200 arquivos por conta travados na tabela e na política de envio.
  if to_regclass('public.midias') is not null then
    declare
      md_a uuid;
      rp_a2 uuid;
      rp_b2 uuid;
      p_a text := a::text || '/' || gen_random_uuid()::text || '.m4a';
      t text;
    begin
      -- o arquivo "no Storage" (linha de storage.objects, desfeita no fim como todo o resto)
      insert into storage.objects (bucket_id, name, owner, metadata)
        values ('midias', p_a, a, jsonb_build_object('size', 12345, 'mimetype', 'audio/mp4'));

      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho, origem)
        values ('audio', 'Áudio A', 'Áudio A.m4a', p_a, 'audio/mp4', 1, 'arquivo') returning id into md_a;
      select tamanho::text into t from midias where id = md_a;
      if t = '12345' then oks := oks + 1; else falhas := array_append(falhas, 'tamanho da mídia não veio do Storage'); end if;
      update midias set tamanho = 1, path = a::text || '/outro.m4a', mime = 'audio/ogg' where id = md_a;
      select tamanho::text || path || mime into t from midias where id = md_a;
      if t = '12345' || p_a || 'audio/mp4' then oks := oks + 1; else falhas := array_append(falhas, 'dono mudou tamanho, caminho ou tipo da mídia'); end if;
      begin
        insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho)
          values ('audio', 'Fantasma', 'f.m4a', a::text || '/' || gen_random_uuid()::text || '.m4a', 'audio/mp4', 10);
        falhas := array_append(falhas, 'mídia registrada sem arquivo no Storage');
      exception when others then
        if sqlerrm like '%não encontrado%' then oks := oks + 1; else falhas := array_append(falhas, ('mídia sem arquivo recusada pelo motivo errado: ' || sqlerrm)); end if;
      end;
      insert into respostas_prontas (titulo, texto) values ('Resposta A', 'x') returning id into rp_a2;
      update midias set resposta_id = rp_a2 where id = md_a;
      oks := oks + 1;

      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from midias where id = md_a;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B leu mídia de A'); end if;
      select count(*) into n from storage.objects where bucket_id = 'midias' and name = p_a;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B viu o arquivo de A no Storage'); end if;
      update midias set titulo = 'INVADIDO' where id = md_a;
      get diagnostics n = row_count;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B alterou mídia de A'); end if;
      delete from midias where id = md_a;
      get diagnostics n = row_count;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'B apagou mídia de A'); end if;
      begin
        insert into storage.objects (bucket_id, name, owner, metadata)
          values ('midias', a::text || '/' || gen_random_uuid()::text || '.m4a', b, '{"size": 10}'::jsonb);
        falhas := array_append(falhas, 'B gravou arquivo na pasta de A');
      exception when others then oks := oks + 1; end;
      begin
        insert into midias (owner_id, tipo, titulo, nome_arquivo, path, mime, tamanho)
          values (a, 'audio', 'INJETADA', 'x.m4a', p_a, 'audio/mp4', 1);
        falhas := array_append(falhas, 'B registrou mídia em nome de A');
      exception when others then oks := oks + 1; end;
      begin
        insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho)
          values ('audio', 'Roubada', 'x.m4a', p_a, 'audio/mp4', 1);
        falhas := array_append(falhas, 'B registrou o arquivo de A como seu');
      exception when others then oks := oks + 1; end;
      execute 'reset role';
      -- B com um arquivo próprio tenta ligar à resposta de A
      insert into storage.objects (bucket_id, name, owner, metadata)
        values ('midias', b::text || '/' || gen_random_uuid()::text || '.pdf', b, jsonb_build_object('size', 10, 'mimetype', 'application/pdf'))
        returning name into t;
      execute 'set local role authenticated';
      begin
        insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho, resposta_id)
          values ('documento', 'B', 'b.pdf', t, 'application/pdf', 1, rp_a2);
        falhas := array_append(falhas, 'B ligou mídia à resposta pronta de A');
      exception when others then
        if sqlerrm like '%relacionado%' then oks := oks + 1; else falhas := array_append(falhas, ('ligação à resposta de A recusada pelo motivo errado: ' || sqlerrm)); end if;
      end;
      execute 'reset role';
      select titulo into t from midias where id = md_a;
      if t = 'Áudio A' then oks := oks + 1; else falhas := array_append(falhas, 'mídia de A mudou depois de B'); end if;
      -- A tenta passar a própria mídia para B ligando à resposta de B (posse conferida contra o dono novo)
      insert into respostas_prontas (owner_id, titulo, texto) values (b, 'Resposta B', 'x') returning id into rp_b2;
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        update midias set owner_id = b, resposta_id = rp_b2 where id = md_a;
        falhas := array_append(falhas, 'A trocou o dono da mídia e ligou à resposta de B');
      exception when others then oks := oks + 1; end;
      execute 'reset role';

      execute 'set local role anon';
      begin
        perform 1 from midias;
        falhas := array_append(falhas, 'anon leu midias');
      exception when insufficient_privilege then oks := oks + 1; end;
      select count(*) into n from storage.objects where bucket_id = 'midias';
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, 'anon viu arquivos do bucket midias'); end if;
      begin
        insert into storage.objects (bucket_id, name, metadata) values ('midias', a::text || '/anon.m4a', '{"size": 1}'::jsonb);
        falhas := array_append(falhas, 'anon gravou no bucket midias');
      exception when others then oks := oks + 1; end;
      execute 'reset role';

      -- tipo declarado diferente do arquivo no Storage: o banco usa o do Storage e recusa
      insert into storage.objects (bucket_id, name, owner, metadata)
        values ('midias', a::text || '/' || gen_random_uuid()::text || '.jpg', a, jsonb_build_object('size', 10, 'mimetype', 'audio/mp4'))
        returning name into t;
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho) values ('imagem', 'Errada', 'x.jpg', t, 'image/jpeg', 1);
        falhas := array_append(falhas, 'mídia com tipo trocado aceita');
      exception when check_violation then oks := oks + 1; end;
      execute 'reset role';

      -- limites da conta: 50 MB (tabela e envio) e 200 arquivos (envio). A já tem 12345 + 10 bytes.
      insert into storage.objects (bucket_id, name, owner, metadata)
        values ('midias', a::text || '/' || gen_random_uuid()::text || '.pdf', a, jsonb_build_object('size', 52428800 - 12345 + 1, 'mimetype', 'application/pdf'))
        returning name into t;
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        insert into storage.objects (bucket_id, name, owner, metadata)
          values ('midias', a::text || '/' || gen_random_uuid()::text || '.m4a', a, '{"size": 10}'::jsonb);
        falhas := array_append(falhas, 'envio aceito com a conta em 50 MB');
      exception when others then oks := oks + 1; end;
      begin
        insert into midias (tipo, titulo, nome_arquivo, path, mime, tamanho) values ('documento', 'Grande', 'g.pdf', t, 'application/pdf', 1);
        falhas := array_append(falhas, 'biblioteca passou de 50 MB');
      exception when others then
        if sqlerrm like '%50 MB%' then oks := oks + 1; else falhas := array_append(falhas, ('50 MB recusado pelo motivo errado: ' || sqlerrm)); end if;
      end;
      execute 'reset role';
      update storage.objects set metadata = '{"size": 1}'::jsonb where bucket_id = 'midias' and name = t;
      insert into storage.objects (bucket_id, name, owner, metadata)
        select 'midias', a::text || '/' || gen_random_uuid()::text || '.m4a', a, '{"size": 1}'::jsonb from generate_series(1, 200);
      execute 'set local role authenticated';
      begin
        insert into storage.objects (bucket_id, name, owner, metadata)
          values ('midias', a::text || '/' || gen_random_uuid()::text || '.m4a', a, '{"size": 1}'::jsonb);
        falhas := array_append(falhas, 'envio aceito com 200 arquivos na conta');
      exception when others then oks := oks + 1; end;
      execute 'reset role';

      -- bucket privado, com limite por arquivo e tipos fechados
      select (not public and file_size_limit = 10485760 and not ('text/html' = any (allowed_mime_types)))::text into t
        from storage.buckets where id = 'midias';
      if t = 'true' then oks := oks + 1; else falhas := array_append(falhas, 'bucket midias público, sem limite ou aceitando qualquer tipo'); end if;
    end;
  else
    pulados := array_append(pulados, '0074 (biblioteca de mídia)');
  end if;

  -- 0075: venda sem duplicar (registrar_venda_unica): chave por conta, sem afrouxar posse nem limite
  if to_regprocedure('registrar_venda_unica(uuid,uuid,text,jsonb,numeric,venda_tipo_pagamento,text,text,integer,date,date,uuid,uuid,numeric,boolean,numeric)') is not null then
    declare
      prod_b uuid;
      ch uuid := gen_random_uuid();
      r jsonb;
      r2 jsonb;
      venda_b uuid;
      est integer;
      i integer;
    begin
      -- produto de B com estoque, criado pelo dono do banco (sem o limite de produtos atrapalhar)
      alter table produtos disable trigger produtos_limites_do_plano;
      insert into produtos (owner_id, nome, preco_varejo, custo, estoque_atual) values (b, 'TESTE 0075', 10, 4, 5)
        returning id into prod_b;
      alter table produtos enable trigger produtos_limites_do_plano;

      execute 'set local role anon';
      begin
        perform registrar_venda_unica(ch, null, null, jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 1, 'preco_unitario', 10)), 0, 'a_vista', null, null);
        falhas := array_append(falhas, 'anon chamou registrar_venda_unica');
      exception when others then oks := oks + 1; end;
      execute 'reset role';

      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      r := registrar_venda_unica(ch, null, 'TESTE', jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 2, 'preco_unitario', 10)), 0, 'a_vista', null, null);
      venda_b := (r->>'venda_id')::uuid;
      if (r->>'criada')::boolean then oks := oks + 1; else falhas := array_append(falhas, '0075: primeira chamada não criou a venda'); end if;
      r2 := registrar_venda_unica(ch, null, 'TESTE', jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 2, 'preco_unitario', 10)), 0, 'a_vista', null, null);
      if (r2->>'venda_id')::uuid = venda_b and not (r2->>'criada')::boolean then oks := oks + 1; else falhas := array_append(falhas, '0075: repetir a chave criou outra venda'); end if;
      select count(*) into n from vendas where chave_idempotencia = ch;
      if n = 1 then oks := oks + 1; else falhas := array_append(falhas, '0075: venda duplicada pela chave'); end if;
      select estoque_atual into est from produtos where id = prod_b;
      if est = 3 then oks := oks + 1; else falhas := array_append(falhas, ('0075: estoque baixou errado, ficou ' || est)); end if;
      select count(*) into n from lancamentos_caixa where venda_id = venda_b;
      if n = 1 then oks := oks + 1; else falhas := array_append(falhas, '0075: caixa duplicado ou ausente'); end if;
      begin
        perform registrar_venda_unica(gen_random_uuid(), null, null, jsonb_build_array(jsonb_build_object('produto_id', prod_a, 'quantidade', 1, 'preco_unitario', 1)), 0, 'a_vista', null, null, p_encomenda => true);
        falhas := array_append(falhas, '0075: B vendeu produto de A');
      exception when others then
        if sqlerrm like '%produto não encontrado%' then oks := oks + 1; else falhas := array_append(falhas, ('0075: produto de A recusado pelo motivo errado: ' || sqlerrm)); end if;
      end;
      begin
        perform registrar_venda_unica(null, null, null, jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 1, 'preco_unitario', 1)), 0, 'a_vista', null, null);
        falhas := array_append(falhas, '0075: venda sem chave aceita');
      exception when others then oks := oks + 1; end;

      -- A com a mesma chave: cria a venda dela e nunca recebe a de B
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      r := registrar_venda_unica(ch, null, 'TESTE', jsonb_build_array(jsonb_build_object('produto_id', prod_a, 'quantidade', 1, 'preco_unitario', 1)), 0, 'a_vista', null, null, p_encomenda => true);
      if (r->>'criada')::boolean and (r->>'venda_id')::uuid <> venda_b then oks := oks + 1; else falhas := array_append(falhas, '0075: A recebeu a venda de B pela chave'); end if;
      update vendas set chave_idempotencia = gen_random_uuid() where id = venda_b;
      get diagnostics n = row_count;
      if n = 0 then oks := oks + 1; else falhas := array_append(falhas, '0075: A mexeu na chave da venda de B'); end if;
      execute 'reset role';

      -- plano grátis no limite: chave nova é recusada pelo gatilho; repetir a chave já usada só devolve a venda
      update auth.users set created_at = now() - interval '60 days' where id = b;
      delete from assinaturas where owner_id = b;
      alter table vendas disable trigger vendas_limites_do_plano;
      for i in 1..25 loop
        insert into vendas (owner_id, valor_total, cliente_nome) values (b, 0, 'TESTE limite');
      end loop;
      alter table vendas enable trigger vendas_limites_do_plano;
      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        perform registrar_venda_unica(gen_random_uuid(), null, null, jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 1, 'preco_unitario', 1)), 0, 'a_vista', null, null);
        falhas := array_append(falhas, '0075: passou do limite do plano grátis');
      exception when others then
        if sqlerrm like '%limite de%vendas%' then oks := oks + 1; else falhas := array_append(falhas, ('0075: limite recusado pelo motivo errado: ' || sqlerrm)); end if;
      end;
      r2 := registrar_venda_unica(ch, null, 'TESTE', jsonb_build_array(jsonb_build_object('produto_id', prod_b, 'quantidade', 2, 'preco_unitario', 10)), 0, 'a_vista', null, null);
      if (r2->>'venda_id')::uuid = venda_b then oks := oks + 1; else falhas := array_append(falhas, '0075: repetir a chave no limite não devolveu a venda'); end if;
      execute 'reset role';
    end;
  else
    pulados := array_append(pulados, '0075 (venda sem duplicar)');
  end if;

  if cardinality(falhas) = 0 then
    raise exception 'SEGURANCA OK: % testes passaram. Pulados: %. (resultado, tudo desfeito)', oks, pulados;
  else
    raise exception 'SEGURANCA FALHOU: % passaram, falhas: %. Pulados: %. (tudo desfeito)', oks, falhas, pulados;
  end if;
end;
$teste$;
