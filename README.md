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
```

```bash
npm install
node scripts/run-migrations.mjs   # aplica o que falta em supabase/migrations
npm run dev
```

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
