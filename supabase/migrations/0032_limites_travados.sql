-- Auditoria de segurança (A3): a cota de IA e o limite de vendas do plano grátis são contados
-- (count) em linhas que o próprio usuário podia apagar ou editar pela API. Agora ele não pode.
-- Quem devolve a cota quando a IA falha e grava os tokens é o servidor, com a chave de serviço
-- (src/app/(app)/anuncios/actions.ts). Não existe função "devolver cota" chamável pelo usuário.

drop policy "ia_geracoes_update_own" on ia_geracoes;
drop policy "ia_geracoes_delete_own" on ia_geracoes;

-- o app nunca apaga venda (cancelar é só mudar o status); apagar servia para burlar o limite do mês
drop policy "vendas_delete_own" on vendas;

-- ninguém muda a data de criação, que define o mês em que a venda e a geração contam
create or replace function manter_created_at() returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke execute on function manter_created_at() from public, anon, authenticated;

create trigger vendas_manter_created_at before update on vendas for each row execute function manter_created_at();
create trigger ia_geracoes_manter_created_at before update on ia_geracoes for each row execute function manter_created_at();
