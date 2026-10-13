-- Base para o assistente do WhatsApp lançar mais do que venda: produto novo, entrada e saída de
-- estoque, entrada e saída de caixa. Nada disto fica ligado só por esta migration: cada tipo depende
-- da variável WHATSAPP_LANCAMENTOS no servidor (ver docs/whatsapp-assistente.md) e sempre passa
-- pelo SIM do vendedor, igual à venda (0040).
-- 1) whatsapp_acoes aceita os tipos novos e guarda o que foi criado (referencia_id).
-- 2) Entrada e saída de estoque usam auth.uid(): ganham a versão "_como", só para a chave de
--    serviço, no mesmo molde de registrar_venda_como(). Produto e caixa são insert direto com o
--    owner_id (os gatilhos de limite do plano leem new.owner_id) e não precisam de função.

alter table whatsapp_acoes drop constraint if exists whatsapp_acoes_tipo_check;
alter table whatsapp_acoes
  add constraint whatsapp_acoes_tipo_check
  check (tipo in ('venda', 'produto', 'estoque_entrada', 'estoque_saida', 'caixa_entrada', 'caixa_saida'));

-- o que o lançamento criou (produto, movimento de estoque ou lançamento de caixa). Sem chave
-- estrangeira: aponta para tabelas diferentes conforme o tipo. A venda continua em venda_id.
alter table whatsapp_acoes add column if not exists referencia_id uuid;

create or replace function registrar_entrada_estoque_como(
  p_owner uuid,
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_data date,
  p_observacoes text,
  p_afeta_caixa boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'conta não encontrada';
  end if;

  -- vale só nesta transação: o auth.uid() da registrar_entrada_estoque() passa a ser o dono
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  return registrar_entrada_estoque(
    p_produto_id => p_produto_id,
    p_variacao_id => p_variacao_id,
    p_quantidade => p_quantidade,
    p_valor_unitario => p_valor_unitario,
    p_data => coalesce(p_data, hoje_br()),
    p_observacoes => p_observacoes,
    p_afeta_caixa => coalesce(p_afeta_caixa, true)
  );
end;
$$;

create or replace function registrar_saida_estoque_como(
  p_owner uuid,
  p_produto_id uuid,
  p_variacao_id uuid,
  p_quantidade integer,
  p_motivo text,
  p_data date,
  p_observacoes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'conta não encontrada';
  end if;

  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  return registrar_saida_estoque(
    p_produto_id => p_produto_id,
    p_variacao_id => p_variacao_id,
    p_quantidade => p_quantidade,
    p_motivo => p_motivo,
    p_data => coalesce(p_data, hoje_br()),
    p_observacoes => p_observacoes
  );
end;
$$;

-- só o servidor (chave de serviço) chama: quem chama escolhe de quem é o lançamento
revoke execute on function registrar_entrada_estoque_como(uuid, uuid, uuid, integer, numeric, date, text, boolean) from public, anon, authenticated;
grant execute on function registrar_entrada_estoque_como(uuid, uuid, uuid, integer, numeric, date, text, boolean) to service_role;
revoke execute on function registrar_saida_estoque_como(uuid, uuid, uuid, integer, text, date, text) from public, anon, authenticated;
grant execute on function registrar_saida_estoque_como(uuid, uuid, uuid, integer, text, date, text) to service_role;
