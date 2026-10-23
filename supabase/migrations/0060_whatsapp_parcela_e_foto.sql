-- Assistente do WhatsApp: marcar parcela como paga ("o João pagou") e cadastrar produto pela foto.
-- Mesmo molde de 0040 e 0044: o modelo só prepara o rascunho, quem grava é o servidor depois do SIM.
-- 1) whatsapp_acoes aceita o tipo 'parcela_paga'.
-- 2) receber_parcela_como(): a receber_parcela() do app usa auth.uid(), então ganha a versão "_como",
--    só para a chave de serviço, que assume a identidade do dono dentro da transação.
-- 3) whatsapp_conversas.foto_path: a foto de produto que o vendedor mandou e ainda não virou rascunho
--    (guardada no bucket produto-fotos, na pasta do dono). Dura o mesmo que a conversa (24 horas).

alter table whatsapp_acoes drop constraint if exists whatsapp_acoes_tipo_check;
alter table whatsapp_acoes
  add constraint whatsapp_acoes_tipo_check
  check (tipo in ('venda', 'produto', 'estoque_entrada', 'estoque_saida', 'caixa_entrada', 'caixa_saida', 'parcela_paga'));

alter table whatsapp_conversas add column if not exists foto_path text;

create or replace function receber_parcela_como(
  p_owner uuid,
  p_parcela_id uuid,
  p_valor numeric,
  p_data date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'conta não encontrada';
  end if;

  -- vale só nesta transação: o auth.uid() da receber_parcela() passa a ser o dono
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_owner::text, 'role', 'authenticated')::text, true);

  return receber_parcela(p_parcela_id, p_valor, coalesce(p_data, hoje_br()));
end;
$$;

-- só o servidor (chave de serviço) chama: quem chama escolhe de quem é o recebimento
revoke execute on function receber_parcela_como(uuid, uuid, numeric, date) from public, anon, authenticated;
grant execute on function receber_parcela_como(uuid, uuid, numeric, date) to service_role;
