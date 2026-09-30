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

## Assinatura (Asaas)

O Asaas é a fonte da verdade: a tabela `assinaturas` só espelha o estado. O teste grátis de 14 dias conta a partir da criação da conta e não exige cartão. A tela fica em `/assinatura`, com o estado do plano sempre à vista no menu ("Seu plano"). Há um plano pago só, o Marcon (R$ 19,90 por mês, só cartão), e o plano grátis que sobra depois do teste; ambos são definidos em `src/lib/planos.ts`. Ao assinar, o pagamento abre em outra aba, na página do Asaas, onde o usuário digita o cartão; nenhum dado de cartão passa pelo Marcon, e a tela atualiza sozinha quando o webhook confirma. **Os limites do plano grátis ainda não são aplicados**: hoje o app só mostra o estado e não bloqueia nada.

Para testar no sandbox:

1. Crie a chave de API no sandbox do Asaas e defina `ASAAS_API_KEY`, `ASAAS_ENV=sandbox` e `ASAAS_WEBHOOK_TOKEN`. `SUPABASE_SERVICE_ROLE_KEY` também é necessária.
2. Em Integrações > Webhooks do Asaas, cadastre `https://SEU-DOMINIO/api/asaas/webhook` com o mesmo token e os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED`. Para testar localmente, exponha o `localhost` com um túnel (ngrok, Cloudflare Tunnel).
3. Rode as migrations (`0010_assinaturas.sql`) e assine em Configurações.

O webhook confere o token, ignora eventos repetidos (o Asaas entrega "pelo menos uma vez") e não reativa uma assinatura já cancelada por causa de um evento atrasado.

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
