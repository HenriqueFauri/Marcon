-- Limites de foto, para o banco e o armazenamento não crescerem sem controle.
-- O navegador comprime e confere antes de enviar, mas quem chama a API direto
-- passa por cima disso: por isso a regra também vive aqui.

-- 1. no máximo 10 fotos por produto e 10 por variação (cada variação conta à parte)
create or replace function limitar_fotos_produto() returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from produto_fotos
    where produto_id = new.produto_id
      and variacao_id is not distinct from new.variacao_id
  ) >= 10 then
    raise exception 'Limite de 10 fotos atingido.';
  end if;
  return new;
end;
$$;

create trigger produto_fotos_limite
  before insert on produto_fotos
  for each row execute function limitar_fotos_produto();

-- 2. o bucket só aceita imagem comum de até 4 MB (o app comprime para bem menos)
update storage.buckets
set file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'produto-fotos';
