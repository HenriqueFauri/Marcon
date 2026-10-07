-- Toda conta nasce afiliada: a linha de afiliados é criada no cadastro, e não mais na primeira
-- visita à tela "Indique e ganhe" (criar dado enquanto a página carrega falhava na primeira abertura).
-- O código segue o mesmo alfabeto de gerarCodigo() em src/lib/indicacao.ts (sem 0/o/1/l/i).

create or replace function novo_codigo_afiliado() returns text
language plpgsql
as $$
declare
  v_alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_codigo text;
begin
  loop
    v_codigo := '';
    for i in 1..7 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from afiliados where codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- Nunca bloqueia o cadastro: se falhar por qualquer motivo, a tela cria a linha na primeira visita.
create or replace function criar_afiliado_no_cadastro() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into afiliados (owner_id, codigo) values (new.id, novo_codigo_afiliado())
      on conflict (owner_id) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function novo_codigo_afiliado() from public, anon, authenticated;
revoke all on function criar_afiliado_no_cadastro() from public, anon, authenticated;

drop trigger if exists afiliado_no_cadastro on auth.users;
create trigger afiliado_no_cadastro
  after insert on auth.users
  for each row execute function criar_afiliado_no_cadastro();

-- contas que já existiam e nunca abriram a tela
insert into afiliados (owner_id, codigo)
select u.id, novo_codigo_afiliado()
from auth.users u
where not exists (select 1 from afiliados a where a.owner_id = u.id);
