# Ambientes: Produção e Staging

Criado em 2026-10-11. Custo: zero (Supabase Free, Vercel Hobby, Asaas sandbox).

## Regra de ouro

**Tudo é feito primeiro no Staging e só depois vai para a produção.** Código, migration, configuração, tudo.

- Exceção: só quando o dono pedir explicitamente para fazer direto em produção (correção urgente, por exemplo).
- Mesmo na exceção, **a mudança tem que ser levada ao Staging logo em seguida**, para os dois ambientes ficarem no mesmo nível (mesmo código, mesmo schema, mesma configuração). Staging atrás da produção invalida o teste.
- Antes de dizer que algo está "no ar", conferir em qual ambiente está.

## Mapa

| | Produção | Staging |
|---|---|---|
| Vercel | projeto `marcon` | projeto `marcon-staging` |
| Branch (Production Branch na Vercel) | `main` | `staging` |
| Supabase | `UseMarcon` (`ouvxsfebfegqcvwmdume`) | `Marcon Staging` (`odgvhqwqyxtnaxgqiynb`) |
| Asaas | ambiente real (`ASAAS_ENV=producao`) | sandbox (`ASAAS_ENV=sandbox`) |
| Rotinas diárias (cobrança às 8h, resumo às 20h) | ligadas (`CRON_SECRET`) | desligadas (sem `CRON_SECRET`) |
| Notificações push | ligadas (chaves VAPID) | desligadas (sem `VAPID_*`; ver `docs/NOTIFICACOES.md`) |
| IA nos anúncios | ligada (`ANTHROPIC_API_KEY`) | desligada (sem a chave) |
| Assistente do WhatsApp | conforme `WHATSAPP_*` | desligado (sem `EVOLUTION_*` e `WHATSAPP_*`) |
| Domínio | www.usemarcon.com | URL da Vercel do `marcon-staging` |

O app não sabe em que ambiente está: lê só as variáveis do projeto da Vercel. Por isso os dois ambientes rodam o mesmo código. Nada criado no Staging (usuários, produtos, vendas, pagamentos) chega à produção.

## Fluxo de trabalho

1. Desenvolver em branch `claude/...` a partir da `staging`.
2. Abrir PR para `staging`. Ao mergear, a Vercel `marcon-staging` publica.
3. Aplicar as migrations novas no banco de Staging (abaixo) e testar lá, de preferência no celular.
4. Passou: abrir PR de `staging` para `main`. Ao mergear, a produção publica.
5. Aplicar as mesmas migrations na produção, na mesma ordem.

Se algo for feito direto na produção (a pedido do dono), depois levar a mesma mudança para a `staging` (merge de `main` na `staging`) e aplicar a migration no banco de Staging.

## Migrations

Ordem: **Staging primeiro, produção depois**. Toda migration passa pelos dois bancos, na mesma ordem. Se o schema divergir, o código novo quebra num deles.

```bash
node scripts/run-migrations.mjs .env.staging   # Staging
node scripts/run-migrations.mjs                # usa .env.local (produção)
```

- O script lê o arquivo de ambiente passado como argumento e aplica o que falta em `supabase/migrations`, registrando em `public.schema_migrations`.
- Na produção, as migrations também podem ser aplicadas com `execute_sql` mais um `insert` em `schema_migrations`, como sempre foi feito.
- Confira o `ref` impresso na linha "Conectado a": `odgvhqwqyxtnaxgqiynb` é o Staging, `ouvxsfebfegqcvwmdume` é a produção.
- Não crie função, gatilho ou política direto no banco sem uma migration. Foi o que quebrou a `0035_search_path_funcoes` no primeiro banco novo (a `validar_foto_variacao` só existia na produção; hoje está na `0034_validar_foto_variacao`).
- Conferência de paridade: contar e comparar hash de tabelas, colunas, funções, policies, gatilhos e buckets nos dois bancos. Em 2026-10-11 estavam idênticos (34 tabelas, 322 colunas, 48 funções, 85 policies, 19 gatilhos, 3 buckets).

## Arquivos de ambiente

- `.env.local`: produção. Usado pelo script sem argumento.
- `.env.staging`: Staging. Contém URL, chave anon, service role e senha do banco do Staging, `ASAAS_ENV=sandbox` e `SUPABASE_CA_CERT` apontando para `supabase/prod-ca.crt`. O git ignora `.env*`.
- Nunca colocar chaves de produção no `.env.staging`, nem o contrário.
- `SUPABASE_DB_PASSWORD` e `SUPABASE_CA_CERT` são só do script de migrations: não vão para a Vercel.
- Nunca colar senha de banco ou chaves em chat.

## Projeto `marcon-staging` na Vercel

1. Importar o repositório `HenriqueFauri/Marcon` e dar o nome `marcon-staging`.
2. Preencher as variáveis antes do primeiro deploy.
3. Depois do primeiro deploy da `staging` (como Preview), Settings, Git, Production Branch = `staging`, e Redeploy. A Vercel só aceita como Production Branch uma branch que já tenha deploy.

Variáveis do Staging:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://odgvhqwqyxtnaxgqiynb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon do Staging |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do Staging |
| `ASAAS_ENV` | `sandbox` |
| `ASAAS_API_KEY` | chave do **sandbox** do Asaas |
| `ASAAS_WEBHOOK_TOKEN` | o mesmo token do webhook do sandbox |
| `ADMIN_EMAILS` | e-mail do dono, para ver `/admin` |

Deixar de fora de propósito: `CRON_SECRET`, `ANTHROPIC_API_KEY`, `EVOLUTION_*`, `WHATSAPP_*` e qualquer chave de produção. Mudou variável na Vercel: fazer Redeploy.

## Supabase Staging

- Authentication, URL Configuration: Site URL e Redirect URLs com a URL do Staging (o mesmo ajuste que o domínio de produção exige).
- Login com Google no Staging exige cadastrar a URL do Staging também no OAuth do Google. Sem isso, usar e-mail e senha.
- Plano Free: o projeto pausa após 7 dias sem uso. Reativar no painel (os dados ficam). O limite é de 2 projetos ativos por pessoa, somando todas as organizações.

## Asaas sandbox

Integrações, Webhooks, no painel do **sandbox**:

| Campo | Valor |
|---|---|
| Nome | `Marcon Staging` |
| URL | `https://URL-DO-STAGING/api/asaas/webhook` |
| Versão da API | v3 |
| Token de autenticação | o mesmo de `ASAAS_WEBHOOK_TOKEN` (Vercel do Staging) |
| Tipo de envio | Sequencial |
| Eventos | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` |

A rota responde 401 se o token for diferente. Nunca cadastrar a URL de produção no sandbox nem a do Staging no Asaas real. A chave de API do sandbox é criada no próprio painel do sandbox.

### Assinatura mensal e anual

Plano Marcon: R$ 15,90 por mês ou R$ 149 por ano (decisão de 2026-10-24), só no cartão. Valores e ciclos em `src/lib/planos.ts` (`CICLOS`).

- A tela Assinatura tem a escolha Mensal ou Anual. `assinarPlano` (`src/app/(app)/assinatura/actions.ts`) cria a assinatura no Asaas com `cycle: MONTHLY` e 15,90, ou `cycle: YEARLY` e 149. O valor sai do servidor, nunca do navegador.
- O ciclo fica em `assinaturas.ciclo` (`mensal` ou `anual`, migration 0063). Linhas de antes da 0063 ficam `mensal`.
- Assinatura pendente de outro ciclo é cancelada no Asaas e outra é criada; do mesmo ciclo, reaproveita o link.
- Webhook: os mesmos eventos para os dois ciclos. No pagamento confirmado, `proximo_vencimento` = vencimento pago + 1 mês (mensal) ou + 12 meses (anual).
- Indique e ganhe: a comissão é a porcentagem do afiliado sobre o valor de cada cobrança paga. No anual, 30% de 149 (R$ 44,70) uma vez por ano.
- Cancelar marca a assinatura como cancelada na hora e a conta volta ao grátis, também no anual (sem devolução pelo período em andamento, como dizem os Termos).

## Conta de teste e dados de exemplo

```bash
node scripts/seed-staging.mjs
```

Cria (ou reaproveita) a conta de teste do Staging e carrega produtos (com nomes longos e parecidos, e um com variações), fotos, anúncios, vendas, gastos e uma vitrine no ar (`/loja/loja-de-teste`). Rodar de novo não duplica. O script confere o `ref` e se recusa a rodar fora do Staging. O e-mail e a senha ficam no `.env.staging` (`STAGING_TESTE_EMAIL` e `STAGING_TESTE_SENHA`), nunca no git nem no chat.

Para rodar o app local contra o Staging: copie o `.env.staging` para `.env.local` na worktree e `npm run dev`. Atenção: nessa worktree o `run-migrations.mjs` sem argumento também passa a apontar para o Staging.

## O que testar só no Staging

Assinatura e comissão do Indique e ganhe com o Asaas sandbox (os tokens de produção não têm sandbox), cadastro novo, migrations novas e telas novas no celular.

## Pendências

- Conferir no painel do Supabase Staging o Site URL e as Redirect URLs com a URL do `marcon-staging`.
- Registrar a `0034_validar_foto_variacao.sql` em `schema_migrations` da produção (a definição é idêntica à que já existe lá).

## Histórico

- 2026-10-13: a branch de produção `local-work-marcon` foi renomeada para `main` (renomeada no GitHub, que redireciona PRs e a branch padrão). O projeto `marcon` na Vercel precisa ter `main` como Production Branch (Settings, Git). Quem ainda tem clone ou worktree com o nome antigo: `git fetch origin --prune` e `git branch -u origin/main`.
