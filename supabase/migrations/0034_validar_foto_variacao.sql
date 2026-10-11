-- A foto de variação só pode apontar para uma variação do mesmo produto.
-- Esta função e o gatilho já existiam na produção (aplicados à mão na auditoria
-- de segurança) mas nenhuma migration os criava, e a 0035_search_path_funcoes
-- falhava em qualquer banco novo (Staging). Idempotente: na produção não muda nada.

create or replace function public.validar_foto_variacao()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.variacao_id is not null and not exists (
    select 1 from produto_variacoes where id = new.variacao_id and produto_id = new.produto_id
  ) then
    raise exception 'A variação da foto não pertence a este produto.';
  end if;
  return new;
end;
$$;

drop trigger if exists produto_fotos_valida_variacao on public.produto_fotos;
create trigger produto_fotos_valida_variacao
  before insert on public.produto_fotos
  for each row execute function public.validar_foto_variacao();
