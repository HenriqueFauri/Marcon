# Plano de correção da auditoria de segurança (UseMarcon)

Base: `relatorio-auditoria-seguranca.pdf` (07/10/2026), achados A1 a A11.
Regra para todas as etapas: nada vai para o banco de produção sem autorização do Henrique no chat. Cada migration é aplicada rodando o SQL e inserindo o nome do arquivo em `public.schema_migrations`.

## Visão geral

| PR | Prioridade | Achados | Migrations | Esforço |
|---|---|---|---|---|
| PR 61 (já aberto) | P2 | A7 | 0029 | aplicar e mergear |
| PR A | P1 | A1, A2, A3 | 0031, 0032 | 1 dia |
| PR B | P2 | A4 | 0033 | meio dia |
| PR C | P3 | A5, A11 | 0034 | meio dia |
| PR D | P4 | A6, A8, A9, A10 | nenhuma | meio dia |

Ordem: PR 61 e PR A primeiro (podem ir juntos), depois B, C e D. Os PRs não dependem um do outro além de seguir a numeração das migrations.

---

## Etapa 0. Antes de mexer: medir o estrago (só leitura)

Rodar em produção (consulta somente leitura) para saber se alguém já explorou o A1 ou o A4:

```sql
-- linhas cujo produto/variação/venda/cadastro é de outro dono
select 'produto_variacoes' t, v.id from produto_variacoes v join produtos p on p.id = v.produto_id where v.owner_id <> p.owner_id
union all select 'produto_fotos', f.id from produto_fotos f join produtos p on p.id = f.produto_id where f.owner_id <> p.owner_id
union all select 'produto_anuncios', a.id from produto_anuncios a join produtos p on p.id = a.produto_id where a.owner_id <> p.owner_id
union all select 'ia_geracoes', g.id from ia_geracoes g join produtos p on p.id = g.produto_id where g.owner_id <> p.owner_id
union all select 'venda_itens', i.id from venda_itens i join produtos p on p.id = i.produto_id where i.owner_id <> p.owner_id
union all select 'movimentos_estoque', m.id from movimentos_estoque m join produtos p on p.id = m.produto_id where m.owner_id <> p.owner_id
union all select 'lancamentos_caixa', l.id from lancamentos_caixa l join produtos p on p.id = l.produto_id where l.owner_id <> p.owner_id;

-- caminhos de arquivo fora da pasta do dono
select 'foto', id, path from produto_fotos where not starts_with(path, owner_id::text || '/')
union all select 'banner', owner_id, unnest(banner_paths) from vitrines
  where exists (select 1 from unnest(banner_paths) b where not starts_with(b, owner_id::text || '/'))
union all select 'logo', id, raw_user_meta_data->>'empresa_logo_path' from auth.users
  where raw_user_meta_data ? 'empresa_logo_path' and not starts_with(raw_user_meta_data->>'empresa_logo_path', id::text || '/');

-- contas com mais apagamentos de IA do que o normal não dá para ver (não há log);
-- olhar o uso real no painel da Anthropic contra a soma de ia_geracoes do mês
select count(*), sum(tokens_entrada), sum(tokens_saida) from ia_geracoes where created_at >= date_trunc('month', now());
```

Se a primeira ou a segunda consulta devolver linhas, guardar o resultado (evidência) antes de limpar, e avisar os vendedores afetados.

---

## PR A (P1): posse amarrada no banco e limites travados

### Migration 0031_posse_relacionada.sql (A1, A2)

**1. Gatilho genérico que confere a posse de toda referência.** Um gatilho no banco cobre a API REST, as server actions e as funções definer de uma vez, coisa que uma política RLS não faz (ela não vale para a service role nem para funções definer). A função lê a linha como jsonb e confere cada coluna de referência que existir:

```sql
create or replace function checar_posse_relacionada() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  -- coluna -> tabela dona; todas têm owner_id
  refs constant jsonb := '{"produto_id":"produtos","variacao_id":"produto_variacoes","venda_id":"vendas",
    "parcela_id":"parcelas","cliente_id":"clientes","canal_id":"canais_venda","forma_pagamento_id":"formas_pagamento",
    "categoria_id":"categorias","fornecedor_id":"fornecedores"}';
  k text; ok boolean;
begin
  for k in select jsonb_object_keys(refs) loop
    if r ? k and r->>k is not null then
      execute format('select exists (select 1 from %I where id = $1 and owner_id = $2)', refs->>k)
        into ok using (r->>k)::uuid, new.owner_id;
      if not ok then raise exception 'registro relacionado não encontrado (%)', k; end if;
    end if;
  end loop;
  return new;
end $$;
revoke execute on function checar_posse_relacionada() from public, anon, authenticated;
```

Aplicar `before insert or update` em: `produto_variacoes`, `produto_fotos`, `produto_anuncios`, `ia_geracoes`, `venda_itens`, `movimentos_estoque`, `lancamentos_caixa`, `parcelas`, `vendas`, `produtos`.
Fora da lista: `vitrine_metricas_produto` (só a função definer grava, e ela já confere o dono).

Para não pesar em UPDATE comum, criar o gatilho com `when` só nas colunas de referência, ou deixar a função sair cedo quando `old` e `new` têm as mesmas referências. Cada consulta usa a chave primária, então o custo é pequeno mesmo na importação em lote.

**2. `vitrine_publica`:** recriar com `v.owner_id = p.owner_id` e `f.owner_id = p.owner_id` nas subconsultas de variações e fotos (`0026_vitrine_extras.sql:57, 71, 75`). Já incluir o filtro de caminho do PR B (`starts_with(f.path, p.owner_id::text || '/')`), para não redefinir a função duas vezes. Manter `revoke ... from public` e `grant ... to anon, authenticated`.

**3. Limites de foto:** em `limitar_fotos_produto` e `aplicar_limites_foto`, contar só `owner_id = new.owner_id`. Depois do gatilho isso é redundante, mas deixa o limite certo mesmo se sobrar linha antiga.

**4. Limpeza:** apagar as linhas cruzadas encontradas na etapa 0 (`delete ... where id in (...)`), na mesma transação, **antes** de criar os gatilhos.

### Migration 0032_limites_travados.sql (A3)

```sql
-- a cota de IA deixa de ser editável pelo usuário
drop policy "ia_geracoes_update_own" on ia_geracoes;
drop policy "ia_geracoes_delete_own" on ia_geracoes;

-- ninguém além do banco muda a data de criação
create or replace function manter_created_at() returns trigger language plpgsql as $$
begin new.created_at := old.created_at; return new; end $$;
create trigger vendas_manter_created_at before update on vendas for each row execute function manter_created_at();
create trigger ia_geracoes_manter_created_at before update on ia_geracoes for each row execute function manter_created_at();
revoke execute on function manter_created_at() from public, anon, authenticated;

-- o app nunca apaga venda (cancelar é um status); apagar só servia para burlar o limite
drop policy "vendas_delete_own" on vendas;
```

A política de UPDATE em `vendas` fica, porque `novo_link_recibo` (que roda com as permissões de quem chama) atualiza `recibo_token`.

### Código no PR A

- `src/app/(app)/produtos/actions.ts:494` `registrarFoto`: buscar o produto com o cliente da sessão (igual a `criarVariacao`, linha 396) e recusar path que não comece com `${user.id}/${produtoId}/` ou contenha `..`.
- `src/app/(app)/anuncios/actions.ts:120` e `:126-129`: devolver a cota e gravar os tokens com `createAdminClient()`, sempre com `.eq("id", registro.id).eq("owner_id", user.id)`. Sem chave de serviço, a escrita com IA responde "indisponível" em vez de rodar sem controle. **Não** criar função "devolver cota" executável pelo usuário: ele chamaria direto e o furo volta.
- Conferir no navegador: criar e excluir variação, enviar e excluir foto, gerar anúncio com IA (e simular falha com a chave errada para ver a cota voltar), registrar e cancelar venda, importar planilha de vendas.

### Testes do PR A (SQL, dentro de `begin ... rollback`)

Script novo `supabase/tests/seguranca.sql`, que simula dois usuários com `set local role authenticated` e `set local request.jwt.claims`:

- B insere em `produto_variacoes` com produto de A: erro.
- B insere em `produto_fotos` e `venda_itens` com produto de A: erro.
- A continua inserindo variação e foto no próprio produto.
- B faz `delete from ia_geracoes`: 0 linhas.
- B faz `update vendas set created_at = '2020-01-01'`: o valor não muda.
- `vitrine_publica` não devolve linha de outro dono.

Rodar primeiro num branch do Supabase ou num banco local. Em produção só com autorização, e sempre com rollback.

---

## PR B (P2): caminho de arquivo sempre na pasta do dono (A4)

### Migration 0033_caminhos_storage.sql

```sql
create or replace function caminho_do_dono(p text, dono uuid) returns boolean
language sql immutable as $$ select starts_with(p, dono::text || '/') and position('..' in p) = 0 $$;

create or replace function caminhos_do_dono(ps text[], dono uuid) returns boolean
language sql immutable as $$ select coalesce(bool_and(caminho_do_dono(x, dono)), true) from unnest(ps) x $$;

alter table produto_fotos add constraint produto_fotos_path_do_dono check (caminho_do_dono(path, owner_id)) not valid;
alter table vitrines add constraint vitrines_banner_do_dono check (caminhos_do_dono(banner_paths, owner_id)) not valid;
-- depois de limpar o que a etapa 0 achar:
alter table produto_fotos validate constraint produto_fotos_path_do_dono;
alter table vitrines validate constraint vitrines_banner_do_dono;
```

O logo fica em `user_metadata`, que o banco não consegue restringir. Então `recibo_publico` (e `vitrine_publica`, já ajustada no PR A) só devolvem `logo_path` quando `caminho_do_dono(logo_path, u.id)`.

### Código no PR B

- `src/app/(app)/configuracoes/actions.ts:58` `atualizarLogoEmpresa`: recusar path fora de `${user.id}/` (a checagem real é a do SQL, porque o usuário pode chamar `auth.updateUser` direto).
- `src/lib/vitrine-servidor.ts`, `src/app/r/[token]/page.tsx` e `pdf/route.ts`: antes de assinar, descartar caminho que não passe por um `caminhoDoDono(path, ownerId)`. Para isso as funções públicas passam a devolver o `owner_id` da loja ou do recibo (só usado no servidor, sem ir para o HTML). É uma segunda trava, caso alguma função SQL esqueça o filtro.
- Opcional: ao tirar um produto da vitrine, nada muda no arquivo. O acesso some porque nenhuma loja consegue mais apontar para caminho de outra pasta.

### Aplicar a migration 0029 junto (A7)

Mergear o PR [HenriqueFauri/Marcon#61](https://github.com/HenriqueFauri/Marcon/pull/61), aplicar a 0029 e rodar o advisor de segurança de novo.

---

## PR C (P3): limite de taxa nos endpoints públicos (A5, A11)

Sem login, a server action da loja roda como `anon`. Então a trava fica na action, que passa a chamar as funções com a chave de serviço, e o banco deixa de aceitar chamada direta.

### Migration 0034_limite_taxa_loja.sql

```sql
create table limites_taxa (
  chave text not null, janela timestamptz not null, n integer not null default 0,
  primary key (chave, janela)
);
alter table limites_taxa enable row level security; -- sem políticas: só service role

create or replace function consumir_limite(p_chave text, p_max integer, p_segundos integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos); v_n integer;
begin
  insert into limites_taxa (chave, janela, n) values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set n = limites_taxa.n + 1 returning n into v_n;
  return v_n <= p_max;
end $$;
revoke execute on function consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function consumir_limite(text, integer, integer) to service_role;

revoke execute on function registrar_evento_vitrine(text, text, uuid) from anon, authenticated;
revoke execute on function validar_cupom_vitrine(text, text) from anon, authenticated;
grant execute on function registrar_evento_vitrine(text, text, uuid) to service_role;
grant execute on function validar_cupom_vitrine(text, text) to service_role;
```

Limpeza: apagar janelas com mais de um dia (no cron diário que já existe, `api/cron/cobrancas`, ou num cron novo).

### Código no PR C

- `src/app/loja/[slug]/actions.ts`: pegar o IP com `headers().get("x-forwarded-for")` (primeiro item); `consumir_limite('evento:'+ip+':'+slug, 60, 600)` e `consumir_limite('cupom:'+ip+':'+slug, 10, 600)`; só então chamar a RPC com `createAdminClient()`.
- Visita: contar no máximo uma por visitante por dia com um cookie anônimo `httpOnly` (`marcon_v_<slug>`).
- Cupom: na tela de cupons, sugerir código com 6 caracteres ou mais (o banco já aceita de 3 a 20).

---

## PR D (P4): endurecimento (A6, A8, A9, A10)

- **A6** `scripts/run-migrations.mjs:38` e `scripts/confirm-test-user.mjs:31`: `ssl: { rejectUnauthorized: true, ca: readFileSync("supabase/prod-ca.crt") }` (certificado baixado do painel do Supabase, em Database Settings). Se o certificado não for informado, falhar com mensagem clara em vez de conectar sem verificar.
- **A8** `src/app/api/cron/cobrancas/route.ts:8`: usar `timingSafeEqual`, igual a `api/asaas/webhook/route.ts:16-22` (dá para extrair um `segredoConfere()` para `src/lib`).
- **A9** `npm i server-only` e `import "server-only"` no topo de `src/lib/supabase/admin.ts`, `src/lib/asaas.ts`, `src/lib/ia-anuncio.ts`, `src/lib/push/send.ts`, `src/lib/indicacao-servidor.ts` e `src/lib/vitrine-servidor.ts`.
- **A10** `next.config.ts`: `async headers()` para `/(.*)` com:
  - `Content-Security-Policy-Report-Only` no primeiro deploy: `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms; img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com https://*.clarity.ms; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.clarity.ms; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Depois de uma semana sem violações relevantes, trocar para `Content-Security-Policy`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - O `'unsafe-inline'` é necessário por causa do script de tema em `layout.tsx` e do `next/script` inline. Remover depois, com nonce, se valer o esforço.
- Conferir depois do deploy: login com Google, loja pública, prévia no WhatsApp, GA e Clarity carregando, recibo em PDF.

---

## Riscos e cuidados

- **Gatilho de posse (0031):** se alguma rotina legítima grava referência cruzada, ela passa a falhar. Pela varredura não há nenhuma: as RPCs sempre usam o próprio dono e a importação liga só a produtos do usuário (`achar_produto_do_item`). Mesmo assim, rodar a etapa 0 e o roteiro de testes antes de aplicar.
- **IA pela chave de serviço:** se `SUPABASE_SERVICE_ROLE_KEY` faltar num ambiente, a escrita com IA fica indisponível ali. Em produção a chave já existe (admin, recibo e loja dependem dela).
- **CHECK de caminho (0033):** criado como `not valid` para não travar a migration se houver linha antiga fora do padrão. Validar só depois da limpeza.
- **Limite de taxa:** atrás de NAT (loja aberta de uma empresa ou escola) várias pessoas dividem o mesmo IP. Os limites (60 eventos e 10 cupons a cada 10 minutos por loja) são folgados para uso normal.
- **Funções recriadas:** `create or replace` mantém as permissões, mas se alguma for recriada com `drop` + `create`, ela volta a nascer executável por anon. Repetir o `revoke` em toda migration que recriar função.

## Critério de pronto

- As consultas da etapa 0 devolvem zero linhas.
- O roteiro `supabase/tests/seguranca.sql` passa inteiro.
- O advisor de segurança do Supabase sem os lints de função definer executável por anon.
- Fluxos principais testados no navegador e no celular (venda, estoque, fotos, IA, loja, recibo, assinatura).
- Issues 1 a 5 do relatório fechadas com o link do PR.
