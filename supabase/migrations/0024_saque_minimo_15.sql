-- Saque mínimo do "Indique e ganhe" cai de R$ 20 para R$ 15 (ver SAQUE_MINIMO em src/lib/indicacao.ts).
create or replace function pedir_saque(p_chave text) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chave text := btrim(coalesce(p_chave, ''));
  v_disponivel numeric(12, 2);
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.';
  end if;
  if char_length(v_chave) < 5 or char_length(v_chave) > 140 then
    raise exception 'Informe uma chave PIX válida.';
  end if;

  -- trava a linha do afiliado: dois pedidos ao mesmo tempo não gastam o mesmo saldo
  perform 1 from afiliados where owner_id = v_uid for update;
  if not found then
    raise exception 'Você ainda não tem link de indicação.';
  end if;

  select
    coalesce((select sum(valor) from comissoes
      where afiliado_id = v_uid and estornada_em is null and liberada_em <= now()), 0)
    - coalesce((select sum(valor) from saques
      where afiliado_id = v_uid and status in ('pedido', 'pago')), 0)
  into v_disponivel;

  if v_disponivel < 15 then
    raise exception 'O saque mínimo é R$ 15,00.';
  end if;

  insert into saques (afiliado_id, valor, chave_pix) values (v_uid, v_disponivel, v_chave);
  update afiliados set chave_pix = v_chave where owner_id = v_uid;

  return v_disponivel;
end;
$$;

revoke all on function pedir_saque(text) from public, anon;
grant execute on function pedir_saque(text) to authenticated;
