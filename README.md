# Gestor

Gestão de vendas, estoque e caixa para pequenos negócios: produtos (com variações, fotos e anúncios por canal), vendas à vista e a prazo, contas a receber, fluxo de caixa, clientes e fornecedores. Funciona como PWA no celular, com notificações push.

Stack: Next.js 16 (App Router, Server Actions), Supabase (Postgres + Auth + Storage, com RLS por dono) e Tailwind CSS 4.

## Rodando localmente

Crie um `.env.local` com:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_DB_PASSWORD=...          # só para o script de migrations

# opcional — notificações push (sem elas o app funciona normalmente)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:voce@exemplo.com

# opcional — lembrete diário de cobrança (só no servidor, nunca no navegador)
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...                   # qualquer texto longo e aleatório
```

```
# opcional — assinatura do Marcon cobrada pelo Asaas (sem elas a tela de assinatura fica fechada)
ASAAS_API_KEY=...                 # chave do Asaas; só no servidor
ASAAS_ENV=sandbox                 # "producao" só quando for cobrar de verdade
ASAAS_WEBHOOK_TOKEN=...           # texto longo e aleatório, o mesmo cadastrado no webhook do Asaas

# opcional — escrita de anúncios com IA (Claude); sem ela o botão não aparece
ANTHROPIC_API_KEY=...             # só no servidor

# opcional — métricas (só carregam se definidos)
NEXT_PUBLIC_GA_ID=...             # Google Analytics 4, formato G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_ID=...        # id do projeto no Microsoft Clarity

# opcional — quem vê a tela /admin (e-mails separados por vírgula; exige SUPABASE_SERVICE_ROLE_KEY)
ADMIN_EMAILS=voce@exemplo.com
```

```bash
npm install
node scripts/run-migrations.mjs   # aplica o que falta em supabase/migrations
npm run dev
```

## Notificações

Os avisos são descontraídos e **mudam de frase a cada vez** (venda, meta batida, marcos de faturamento de R$ 1 mil, 5 mil e 10 mil no mês, e lembrete de cobrança). As frases ficam em `src/lib/notificacoes.ts` e não aparecem em Configurações, para manter a surpresa. Lá o usuário só escolhe **o que receber** e **quais dados mostrar** (venda: produto, valor, lucro, cliente, canal; cobrança: valor total e quem deve). Um botão manda um aviso de exemplo para conferir se chega.

Os avisos de venda, meta e marco saem na hora, ao registrar a venda; meta e marco são avisados uma vez, quando o mês cruza o valor. A frase da venda é sorteada pelo id da venda e a de cobrança percorre a lista dia após dia, então nunca repete a de ontem.

O lembrete de cobrança precisa de um agendador: `vercel.json` já chama `GET /api/cron/cobrancas` todo dia às 11h UTC (8h em Brasília). A rota exige `Authorization: Bearer $CRON_SECRET` (a Vercel envia sozinha quando `CRON_SECRET` está definido). Em outra hospedagem, agende essa mesma chamada.

## Anúncios com IA

Em Anúncios, "Nova versão com IA" e "Escrever com IA" mandam ao Claude (modelo em `MODELO_IA`, `src/lib/ia-anuncio.ts`; hoje o Haiku 4.5, em teste) o cadastro do produto, a variação escolhida, até 3 fotos e uma dica opcional do vendedor. A resposta volta como título e descrição dentro do limite de caracteres do canal; nada é salvo até o usuário salvar a versão. As instruções proíbem inventar estado, garantia, medidas ou frete.

Cada geração é gravada em `ia_geracoes` (com os tokens, para acompanhar o custo) **antes** de chamar a IA, e o gatilho da migration `0017` barra quem passou da cota do mês (`ia_mes` em `limites_do_plano`). Se a IA falhar, o registro é apagado e a cota volta. Sem `ANTHROPIC_API_KEY` os botões não aparecem.

## Recibo

Cada venda tem um código secreto (`vendas.recibo_token`). Na tela da venda, o lojista manda o link `/r/<código>` pelo WhatsApp do cliente, copia ou compartilha. A página abre sem login e mostra a empresa (dados e logo de Configurações), os itens, o total e as parcelas com a situação do dia. Os dados vêm de `recibo_publico()`, que devolve só o que o cliente deve ver (nada de custo, lucro ou observações). "Desativar este link" troca o código e o link antigo para de abrir. O logo é assinado com a chave de serviço; sem `SUPABASE_SERVICE_ROLE_KEY` o recibo sai sem logo.

## Vendas: outros gastos

Ao registrar uma venda, "Outros gastos" (motoboy, embalagem, taxa) é dinheiro que o lojista gasta para entregar aquela venda. Entra em `vendas.custo_total` (baixa o lucro em todas as telas), fica separado em `vendas.outros_gastos` para a tela da venda mostrar, e sai do caixa na data da venda (categoria "Outros gastos da venda"). O total do cliente não muda. Cancelar a venda desfaz tudo: devolve o que o cliente pagou e também lança de volta esse gasto no caixa (migration `0018`).

## Fluxo de caixa: períodos

Além do mês, aceita os últimos 30, 60, 90 e 120 dias e datas livres (até 2 anos). Tudo na URL: `?mes=AAAA-MM`, `?dias=90` ou `?de=AAAA-MM-DD&ate=AAAA-MM-DD` (`src/lib/periodo.ts`).

### Regras do caixa (migration `0022`)

- **Datas em Brasília:** o banco roda em UTC, então datas geradas no SQL usam `hoje_br()`, nunca `current_date`. Vale para o estorno de venda cancelada, o pagamento de parcela, o "atrasado" das parcelas e o recibo.
- **Totais no banco:** entradas, saídas e as maiores saídas por categoria vêm de `resumo_caixa()` e valem para o período todo, com ou sem o filtro de tipo. A tela lista só os 300 lançamentos mais recentes, com um aviso quando há mais. O saldo continua em `saldo_caixa()`.
- **Parcela paga uma vez só:** `pagar_parcela` trava a parcela e `lancamentos_caixa_parcela_uk` impede dois lançamentos para a mesma parcela. O índice só é criado se não houver duplicata antiga (a migration avisa).
- **Estoque que já era seu:** no cadastro de produto e de variação, "Esse estoque já era meu" chama `registrar_entrada_estoque` com `p_afeta_caixa = false`: entra estoque e custo médio, nada sai do caixa. Sem a marca, o estoque inicial continua saindo do caixa como compra.

## Assinatura (Asaas)

O Asaas é a fonte da verdade: a tabela `assinaturas` só espelha o estado. O teste grátis de 14 dias conta a partir da criação da conta e não exige cartão. A tela fica em `/assinatura`, com o estado do plano sempre à vista no menu ("Seu plano"). Há um plano pago só, o Marcon (R$ 15,90 por mês, só cartão), e o plano grátis que sobra depois do teste; os textos e o preço ficam em `src/lib/planos.ts`. Ao assinar, o pagamento abre em outra aba, na página do Asaas, onde o usuário digita o cartão; nenhum dado de cartão passa pelo Marcon, e a tela atualiza sozinha quando o webhook confirma.

### Limites do plano

| | Teste (14 dias) e Marcon | Grátis |
| --- | --- | --- |
| Vendas por mês | sem limite | 30 |
| Produtos | sem limite | 50 |
| Fotos por produto e por variação | 10 | 3 |
| Importar vendas e extrato de caixa | sim | não (só produtos) |
| Anúncios escritos com IA por mês | 100 | 10 |

Os limites são **impostos pelo banco** (migration `0013`: gatilhos `BEFORE INSERT` em `vendas`, `produtos`, `produto_fotos` e `lancamentos_caixa`), então quem chama a API direto também passa por eles. A função `limites_do_plano` é a fonte única; o app lê o uso em `uso_do_plano()` (`src/lib/uso.ts`) só para explicar e antecipar (faixa quando faltam 5, bloqueio explicado no limite, barras em `/assinatura`). Se a migration ainda não foi aplicada, as telas seguem funcionando sem os avisos.

- **Nada é apagado nem escondido:** os gatilhos só barram registros novos. Quem cai no grátis com 80 produtos continua vendo os 80.
- **Vendas contam pelo mês em que foram registradas** (fuso de Brasília), não pela data digitada, para não dar para burlar datando para trás. Cancelar uma venda não devolve a cota.
- **Plano pago** = assinatura `ativa`, `atrasada` (o Asaas ainda tenta cobrar) ou `cortesia` (liberada pelo admin); `pendente` e `cancelada` voltam ao grátis. O **teste** vale por 14 dias desde a criação da conta.
- Ao mudar um limite, mude em `limites_do_plano` (SQL) e nos textos de `planos.ts`.

Para testar no sandbox:

1. Crie a chave de API no sandbox do Asaas e defina `ASAAS_API_KEY`, `ASAAS_ENV=sandbox` e `ASAAS_WEBHOOK_TOKEN`. `SUPABASE_SERVICE_ROLE_KEY` também é necessária.
2. Em Integrações > Webhooks do Asaas, cadastre `https://SEU-DOMINIO/api/asaas/webhook` com o mesmo token e os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED`. Para testar localmente, exponha o `localhost` com um túnel (ngrok, Cloudflare Tunnel).
3. Rode as migrations (`0010_assinaturas.sql`) e assine em Configurações.

O webhook confere o token, ignora eventos repetidos (o Asaas entrega "pelo menos uma vez") e não reativa uma assinatura já cancelada por causa de um evento atrasado.

## Administração

A conta de admin é uma conta normal, com o próprio negócio: ela só ganha o item "Administração" no menu. Quem é admin vem de `ADMIN_EMAILS` no servidor (e-mail confirmado), nunca dos metadados do usuário, que o próprio usuário edita. Para quem não é admin, `/admin` responde 404, e cada server action confere de novo.

Em `/admin` aparecem todas as contas, com plano, produtos, vendas do mês e último acesso (função `admin_uso_por_conta`, migration `0014`, que só a chave de serviço executa). Ações:

- **Bloquear / desbloquear:** usa o bloqueio do Supabase Auth. A pessoa não entra, e nada é apagado.
- **Dar / tirar cortesia:** grava a assinatura com status `cortesia`: plano Marcon liberado, sem Asaas. Não vale para quem já paga.

Contas de admin não podem ser bloqueadas pela tela, nem a própria. A cortesia vale para qualquer conta, inclusive a sua (o banco não conhece `ADMIN_EMAILS`, então sem ela a conta de admin cairia nos limites do grátis depois do teste).

## Importar dados (PDF do VendaMax)

Em `/importar` o usuário solta os relatórios em PDF do VendaMax (produtos, vendas e extrato de caixa; o VendaMax não exporta planilha). O PDF tem texto de verdade, então a leitura é por regras, sem IA: `src/lib/importacao` extrai o texto com a posição de cada trecho (`unpdf`), agrupa por colunas e monta os registros. Cada relatório é conferido com os totais que o próprio PDF informa (contagem, total vendido, créditos e débitos, saldo corrente) e o usuário vê a divergência antes de importar.

Fluxo em duas etapas: `POST /api/importar/analisar` só lê e devolve uma prévia; a gravação é feita por três funções SQL (`importar_produtos`, `importar_vendas`, `importar_lancamentos`, migration `0012`), todas tudo ou nada.

- **Não duplica:** produto de mesmo nome é pulado; vendas e lançamentos guardam a referência de origem (`importado_ref`, índice único por dono).
- **Vendas entram como histórico:** não mexem no estoque (o de hoje vem do relatório de produtos) e geram a entrada no caixa na data da venda.
- **Do extrato entram só compras de estoque e despesas.** As linhas "Venda:" são ignoradas, porque as vendas vêm do relatório de vendas e dobrariam o caixa. Compra de estoque não afeta o lucro do mês.
- **Limitações do relatório do VendaMax:** produto com variações vem só como faixa de custo (entra sem as variações, com a média); venda a prazo não traz as parcelas (não entra por padrão).

## Banco de dados

As migrations ficam em `supabase/migrations` e são aplicadas em ordem pelo `scripts/run-migrations.mjs`, que registra o que já rodou em `public.schema_migrations`.

Regras que valem para todo o schema:

- Toda tabela tem `owner_id` e RLS restringindo ao dono.
- Operações que mexem em mais de uma tabela (venda, entrada de estoque, pagamento de parcela, cancelamento) são funções SQL — tudo ou nada numa transação.
- Excluir um cadastro (produto, cliente, fornecedor) nunca apaga histórico financeiro: as referências viram `NULL` e o nome fica guardado como snapshot.

## Organização do código

- `src/app/(app)/*` — telas autenticadas; cada pasta tem `page.tsx` e um `actions.ts` com as Server Actions.
- `src/components` — UI compartilhada (`ui.tsx`, modal, toasts, navegação, busca, seletor de mês).
- `src/lib` — Supabase, formatação (moeda, datas no fuso de Brasília) e o tipo `ActionResult`.

As Server Actions devolvem `ActionResult` (`{ ok: true }` ou `{ ok: false, error }`) em vez de lançar erro: em produção o Next esconde a mensagem de erros lançados. No cliente, o hook `useAction` transforma o resultado em aviso na tela.
