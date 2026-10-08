-- Ajuste do assistente no WhatsApp: o próprio vendedor liga e desliga o lançamento de venda pelo Zap
-- (tela Configurações > Assistente no WhatsApp). Padrão ligado: só vale para quem já foi liberado.
-- O dono pode mudar só esta coluna do próprio vínculo; número e dono continuam nascendo pelo webhook.

alter table whatsapp_vinculos add column lancar_venda boolean not null default true;

create policy "whatsapp_vinculos_update_own" on whatsapp_vinculos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- update só da coluna lancar_venda (o Supabase dá update na tabela toda por padrão)
revoke update on whatsapp_vinculos from anon, authenticated;
grant update (lancar_venda) on whatsapp_vinculos to authenticated;
