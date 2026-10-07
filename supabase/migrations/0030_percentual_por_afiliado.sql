-- Percentual de comissão por afiliado, para negociar com influenciadores.
-- null = percentual padrão (COMISSAO_PERCENTUAL em src/lib/indicacao.ts). Só o admin define,
-- pelo servidor com a chave de serviço: o afiliado não tem política de update, e a de insert
-- agora exige percentual vazio, para ninguém criar a própria linha já com 50%.
-- Comissões antigas não mudam: cada uma guarda o percentual com que nasceu.

alter table afiliados
  add column if not exists percentual numeric(5, 2)
  check (percentual is null or (percentual >= 1 and percentual <= 50));

drop policy if exists "afiliados_insert_own" on afiliados;
create policy "afiliados_insert_own" on afiliados
  for insert with check (owner_id = auth.uid() and percentual is null);
