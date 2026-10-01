-- Anúncio sem canal fixo: a versão pode ser usada em qualquer marketplace.
-- canal_id passa a ser opcional (quando preenchido, só define os limites de
-- caracteres e o estilo da sugestão).

alter table produto_anuncios alter column canal_id drop not null;
