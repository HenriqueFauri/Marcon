# Continuidade: como seguir desenvolvendo sem o dono

Criado em 2026-11-20. Para um agente (ou pessoa) que abre o projeto sem o Henrique por perto.

## O que pode fazer sozinho

- Desenvolver qualquer tarefa do banco **Tarefas da área UseMarcon** no Notion (Início: https://app.notion.com/p/414d1f228fd8811b83e6d26d502ccb86). Pegar primeiro as marcadas "Hoje", depois as de maior prioridade.
- Abrir PR contra `staging`, revisar, mergear em `staging` com CI verde e revisão limpa (`docs/REVISAO.md`).
- Aplicar migration no **Staging**.
- Levar a produção mudanças de risco BAIXO (classificação em `scripts/classificar-risco.mjs`), depois de testadas no Staging.

## O que nunca faz sozinho

- Qualquer coisa de risco ALTO chegar à produção (migration, cobrança, plano, auth, segurança, WhatsApp, cron, dependências, variáveis de ambiente).
- Aplicar migration na produção.
- Mexer em preço, plano, limite, Termos, Privacidade, posicionamento ou copy de venda: é decisão de negócio.
- Mexer em Asaas real, chaves, `.env*`, DNS ou domínio.
- Apagar dados, tabelas ou branches que não criou.
- Decidir algo que o Notion e o vault não respondem. Nesse caso, parar e deixar a pergunta registrada (abaixo).

Dúvida entre pode e não pode: não pode.

## Antes de começar qualquer trabalho

1. Ler `CLAUDE.md`, `AGENTS.md`, `docs/AMBIENTES.md`, `docs/DESIGN.md` e `docs/REVISAO.md`.
2. Next.js desta versão tem mudanças: ler o guia relevante em `node_modules/next/dist/docs/` antes de escrever código.
3. Ler a memória técnica do projeto (`MEMORY.md` e os arquivos que ela aponta) e, se a tarefa tocar posicionamento, preço ou copy, as notas em `Documents\Segundo Cerebro\negocios\usemarcon\`.
4. Consultar no Notion só a área UseMarcon (tarefas, decisões).
5. `git fetch` e partir de `origin/staging`.

## Ciclo de uma tarefa

1. Marcar a tarefa como em andamento no Notion.
2. Branch `claude/<assunto>`, mudança pequena e focada, uma tarefa por PR.
3. Seguir `docs/REVISAO.md` (lint, typecheck, risco, revisão independente, Staging).
4. Mergear e testar no Staging. Para tela, olhar no tamanho de celular.
5. BAIXO: PR de `staging` para `main`, mergear e conferir o site no ar. ALTO: parar no Staging.
6. Marcar a tarefa como Feita no Notion, com o link do PR.
7. Fato técnico novo (armadilha, decisão de implementação) vai para a memória do projeto. Decisão de negócio vai para o vault. Nunca TODO em arquivo do repositório.

## Quando travar ou precisar do dono

Registrar no Notion, na tarefa: o que travou, o que já foi feito, a pergunta exata e as opções com recomendação. Passar para a próxima tarefa que não dependa disso. O dono responde quando voltar; a tarefa travada não bloqueia o resto.

Item ALTO pronto para produção: deixar o PR `staging` para `main` aberto, com resumo (o que muda, o que foi testado, migrations a aplicar, como reverter) e avisar na tarefa do Notion. Não mergear.

## Armadilhas já conhecidas

- Produção e Staging têm bancos e chaves separados. Conferir o `ref` impresso por `run-migrations.mjs`.
- `.env.local` aponta para a produção. Numa worktree apontada para o Staging, o script sem argumento também vai para o Staging.
- A Vercel Hobby tem limite de 2 crons. Não criar um terceiro.
- Supabase Free pausa após 7 dias sem uso: se o Staging não responder, reativar no painel.
- O restante está nos arquivos de memória técnica (segurança, vitrine, WhatsApp, UI, admin).
