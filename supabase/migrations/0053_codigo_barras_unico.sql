-- F8: código de barras do produto. A coluna codigo_barras já existe desde a 0001 e nunca foi usada.
-- Agora o mesmo código não pode se repetir entre os produtos da mesma conta (vazio não conta).
-- Staging primeiro; produção ainda precisa desta migration.

update public.produtos set codigo_barras = null where codigo_barras is not null and btrim(codigo_barras) = '';

create unique index if not exists produtos_owner_codigo_barras_uniq
  on public.produtos (owner_id, codigo_barras)
  where codigo_barras is not null;
