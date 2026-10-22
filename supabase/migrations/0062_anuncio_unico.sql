-- Anúncios sem diferença de canal: um anúncio e um registro de publicação por produto.
-- 1. produto_anuncios.canal_id deixa de ser obrigatório. As linhas antigas ficam intactas (inclusive as de
--    vários canais): a tela mostra a mais recente como o anúncio do produto e a vitrine continua
--    copiando o texto de qualquer versão (0043). Nada de anúncio gerado é apagado.
-- 2. anuncio_publicacoes (0058) perde o canal: fica uma linha por produto. Se havia mais de uma (uma por
--    canal), sobra a publicada mais recentemente.
-- Não mexe em ia_geracoes (a cota da IA continua sendo a contagem dessas linhas) nem em canais_venda
-- (o canal de venda da tela de Vendas é outra coisa). Idempotente.

alter table produto_anuncios alter column canal_id drop not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anuncio_publicacoes' and column_name = 'canal_id'
  ) then
    delete from anuncio_publicacoes a
    using anuncio_publicacoes b
    where a.produto_id = b.produto_id
      and a.id <> b.id
      and (a.publicado_em, a.updated_at, a.id) < (b.publicado_em, b.updated_at, b.id);

    alter table anuncio_publicacoes drop constraint if exists anuncio_publicacoes_produto_id_canal_id_key;
    alter table anuncio_publicacoes drop column canal_id;
  end if;
end $$;

alter table anuncio_publicacoes drop constraint if exists anuncio_publicacoes_produto_id_key;
alter table anuncio_publicacoes add constraint anuncio_publicacoes_produto_id_key unique (produto_id);
