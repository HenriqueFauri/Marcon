# Revisão de código e trava de risco

Criado em 2026-11-20. Vale para qualquer pessoa ou agente que mexa no código do UseMarcon.

## Princípio

Toda mudança passa por três filtros antes de chegar à produção: CI (máquina), revisão (checklist abaixo) e trava de risco (quem pode aprovar). Staging primeiro, sempre (`docs/AMBIENTES.md`).

## Trava de risco

`npm run risco` (ou o job `guarda-de-risco` do CI) olha os arquivos do PR e classifica.

| Nível | Quando | Quem aprova |
|---|---|---|
| **ALTO** | Toca em migration, `supabase/tests`, Asaas, assinatura, planos, indicação e comissão, admin, auth, `proxy.ts`, cron, WhatsApp, push, cliente Supabase, `vercel.json`, CI, dependências, `.env*` | Dono, sempre. Pode entrar em `staging` depois da revisão, mas o PR `staging` para `main` espera o OK do dono. |
| **BAIXO** | Só texto, estilo, layout, componentes visuais, landing, vitrine visual, relatórios sem regra de negócio | Pode ir à produção sem o dono, se CI verde, revisão sem achado aberto e teste no Staging. |

Regras:

- A lista de caminhos ALTO vive em `scripts/classificar-risco.mjs`. Dúvida entre ALTO e BAIXO: é ALTO.
- O PR `staging` para `main` só é BAIXO se **todos** os commits novos desde o último deploy forem BAIXO. Um commit ALTO no meio torna o PR inteiro ALTO.
- Mudança de preço, plano, limite, texto de Termos ou Privacidade é ALTO mesmo sem tocar em código de cobrança, porque é decisão de negócio.
- Nunca "aproveitar" um PR BAIXO para incluir uma correção ALTO. Separar em outro PR.

## Checklist do revisor

Ler o diff inteiro, não só o resumo. Para cada item, achado vai como comentário no PR com arquivo e linha.

### Sempre

1. Faz o que o PR diz, e só isso (sem arquivo estranho, sem refactor escondido).
2. `npm run lint`, `npm run typecheck` e `npm run build` verdes.
3. Sem segredo, chave, URL de produção ou senha no diff (inclusive em log e em comentário).
4. Sem `console.log` de dado de cliente.
5. Texto na tela sem travessão e sem "-" como pontuação (regra de copy). Nada de "fiado". Sem menção a lojas de app.
6. Tela nova ou alterada segue `docs/DESIGN.md` (peças, espaçamento, cores) e funciona no celular (sem corte horizontal, tabelas no celular conforme o padrão).

### Banco e segurança (ALTO)

7. Todo objeto novo no banco tem migration numerada em sequência, aplicada primeiro no Staging.
8. Tabela nova tem RLS ligada e políticas por dono (`user_id` ou equivalente). Testar com duas contas: a conta B não vê nem altera dado da conta A.
9. Função `security definer` tem `search_path` fixo e confere posse dentro dela.
10. `supabase/tests/seguranca.sql` continua dando "SEGURANCA OK" no Staging.
11. Server action e rota de API conferem o usuário logado e a posse do registro antes de ler ou gravar. Não confiar em id vindo do navegador.
12. Upload no Storage usa o caminho por dono já padronizado.
13. Entrada externa (formulário, webhook, WhatsApp) é validada no servidor.

### Dinheiro e assinatura (ALTO)

14. Valor, ciclo e plano saem do servidor (`src/lib/planos.ts`), nunca do navegador.
15. Webhook do Asaas continua exigindo o token e é idempotente (o mesmo evento duas vezes não cobra nem credita duas vezes).
16. Comissão e vencimento seguem o que está em `docs/AMBIENTES.md`. Testado no Asaas **sandbox**, nunca no real.
17. Arredondamento de centavos: usar inteiros ou o helper existente, nunca somar `float` direto.

### Ambientes

18. Nada novo depende de variável que só existe na produção sem estar descrita em `docs/AMBIENTES.md`.
19. Feature que usa serviço pago (IA, WhatsApp, push) se comporta bem quando a variável não existe (Staging roda sem elas).

## Teste de tela no navegador (testador-marcon)

O revisor só lê código; tela quebrada só aparece usando. **Todo PR que mexe em tela passa pelo agente `testador-marcon` (`.claude/agents/testador-marcon.md`) antes de ir para `main`.** Ele roda o app local contra o Staging, em 375 px (celular), com conta de teste, e devolve passou, falhou e não coberto.

- Vale para: `page.tsx`, componentes, estilo, texto de tela, fluxo de cadastro, venda, caixa, vitrine e planos. Não vale para mudança só de banco, lib sem efeito visível, CI ou docs.
- O que ele confere: fluxo completo (preencher, enviar, ver o resultado), rolagem horizontal, botão atrás da barra de baixo, erro no console, resposta 4xx ou 5xx, texto fora da regra de copy ou em inglês.
- Nunca produção, nunca senha no chat: a conta de teste é criada por `scripts/teste-navegador.mjs` (só roda no Staging) e a senha vai ao navegador pelo fragmento da URL.
- Falha "quebra" ou "confunde" bloqueia o PR. Fora do alcance do testador (pagamento, e-mail, push, WhatsApp, IA, admin): fica listado como "não coberto" no PR para o dono olhar.
- Sem o navegador do app disponível, o PR de tela não vai à produção sem o OK do dono.

## Fluxo de um PR

1. Branch `claude/<assunto>` a partir de `staging`. Commits pequenos.
2. Rodar local: `npm run lint && npm run typecheck`. Para tela, abrir no navegador e olhar no tamanho de celular.
3. `npm run risco` e anotar o nível na descrição do PR.
4. Abrir PR contra `staging` com: o que mudou, nível de risco, como testar, migration (sim ou não).
5. Revisão independente (skill `/revisar-marcon`, que usa o agente `revisor-marcon`). Quem escreveu não é o único revisor. Se o PR mexe em tela, a mesma skill chama o `testador-marcon` (seção acima).
6. CI verde + sem achado aberto: merge em `staging`. Migration, se houver, aplicada no Staging por `node scripts/run-migrations.mjs .env.staging`.
7. Testar no Staging (o que mudou, mais o caminho principal: login, venda, produto, vitrine). Para tela, o `testador-marcon` em 375 px; o relatório dele entra na descrição do PR `staging` para `main`.
8. Para a produção: PR `staging` para `main`. Se BAIXO, pode mergear. Se ALTO, parar e pedir o OK do dono, mostrando o resumo do que muda e do que foi testado.
9. Depois do deploy em produção: conferir o site no ar, ver erros recentes na Vercel e, se teve migration, conferir o `ref` impresso na aplicação (`ouvxsfebfegqcvwmdume` é produção).

## O que fazer quando algo dá errado em produção

1. Reverter no Vercel (promover o deploy anterior) antes de investigar.
2. Migration já aplicada não se desfaz sozinha: criar migration nova que corrige, nunca editar a antiga.
3. Registrar a causa em `Segundo Cerebro\tasks\lessons.md` e, se virar regra, acrescentar um item no checklist acima.
