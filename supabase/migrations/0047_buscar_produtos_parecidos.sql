-- Assistente no WhatsApp: busca de produto tolerante a erro (voz transcrita, digitação, acento).
-- Antes a busca exigia o trecho exato do nome ("relógio tommy" não achava "Relógio Tomi").
-- Agora cada produto ativo do dono ganha uma nota de 0 a 1 de semelhança com o que foi dito:
--   1    = o termo, ou todas as palavras dele, aparecem no nome, marca ou código
--   < 1  = parecido (trigramas, sem acento, sem pontuação, em qualquer ordem de palavras)
-- Quem decide o que fazer com a nota é o servidor (src/lib/whatsapp/produtos.ts): um vencedor claro,
-- vários parecidos (pergunta qual) ou nenhum. O modelo não escolhe produto por conta própria.
-- Roda só sobre os produtos de UM dono, então não precisa de índice de trigramas.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function buscar_produtos_parecidos(p_owner uuid, p_termo text, p_limite integer default 8)
returns table (
  id uuid,
  nome text,
  marca text,
  estoque_total numeric,
  preco_varejo numeric,
  custo numeric,
  tem_variacoes boolean,
  pontos real,
  exato boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with t as (
    select trim(regexp_replace(lower(unaccent(coalesce(p_termo, ''))), '[^a-z0-9]+', ' ', 'g')) as termo
  ),
  -- palavras que carregam sentido: 3 letras ou mais, ou com número (d20, ps4, 5w)
  palavras as (
    select k.palavra
    from t, unnest(string_to_array(t.termo, ' ')) as k(palavra)
    where length(k.palavra) >= 3 or k.palavra ~ '[0-9]'
  ),
  alvo as (
    select
      p.id,
      p.nome,
      p.marca,
      p.estoque_total::numeric as estoque_total,
      p.preco_varejo::numeric as preco_varejo,
      p.custo::numeric as custo,
      p.tem_variacoes,
      trim(regexp_replace(lower(unaccent(p.nome)), '[^a-z0-9]+', ' ', 'g')) as nome_limpo,
      trim(regexp_replace(lower(unaccent(concat_ws(' ', p.nome, p.marca, p.sku))), '[^a-z0-9]+', ' ', 'g')) as texto
    from produtos_com_estoque p
    where p.owner_id = p_owner and p.status = 'ativo'
  ),
  notas as (
    select
      a.*,
      (case
        when t.termo = '' then 0
        when a.texto like '%' || t.termo || '%' then 1
        -- todas as palavras do termo estão no nome, só que fora de ordem ou separadas ("torneira preta")
        when (select bool_and(a.texto like '%' || k.palavra || '%') from palavras k) then 1
        else greatest(
          word_similarity(t.termo, a.texto),
          0.95 * coalesce((select avg(word_similarity(k.palavra, a.texto)) from palavras k), 0)
        )
      end)::real as pontos,
      (a.nome_limpo = t.termo) as exato
    from alvo a, t
  )
  select n.id, n.nome, n.marca, n.estoque_total, n.preco_varejo, n.custo, n.tem_variacoes, n.pontos, n.exato
  from notas n
  where n.pontos >= 0.3
  order by n.exato desc, n.pontos desc, n.nome
  limit least(greatest(coalesce(p_limite, 8), 1), 20);
$$;

-- só o servidor do assistente chama (chave de serviço); p_owner vem do vínculo, nunca do modelo
revoke all on function buscar_produtos_parecidos(uuid, text, integer) from public, anon, authenticated;
grant execute on function buscar_produtos_parecidos(uuid, text, integer) to service_role;
