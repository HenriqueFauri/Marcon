-- Assistente no WhatsApp: o vendedor escolhe, por tipo de lançamento, se quer ou não confirmar com SIM.
-- Lista dos grupos em que o lançamento sai na hora, sem pedir SIM. Vazia (padrão) = pede SIM em tudo,
-- como sempre foi. Grupos: venda, produto, estoque, caixa (os três últimos seguem WHATSAPP_LANCAMENTOS).
-- Mensagem de voz sempre pede o SIM, no código, porque a transcrição pode errar um número.

alter table whatsapp_vinculos
  add column sem_confirmar text[] not null default '{}',
  add constraint whatsapp_vinculos_sem_confirmar_check
    check (sem_confirmar <@ array['venda', 'produto', 'estoque', 'caixa']::text[]);

-- o dono muda só as colunas de ajuste do próprio vínculo (a política de update vem da 0041)
revoke update on whatsapp_vinculos from anon, authenticated;
grant update (lancar_venda, sem_confirmar) on whatsapp_vinculos to authenticated;
