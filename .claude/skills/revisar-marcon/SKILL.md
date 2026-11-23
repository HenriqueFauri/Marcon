---
name: revisar-marcon
description: Revisa a branch ou PR atual do UseMarcon com o checklist do projeto e a trava de risco. Usar antes de mergear qualquer PR, ou quando o usuário disser "revisa", "pode mergear?" ou "/revisar-marcon".
---

# Revisar mudança do UseMarcon

Argumento opcional: número do PR ou branch. Sem argumento, revisar a branch atual contra `origin/staging`.

1. `git fetch origin` e confirmar que a branch parte de `staging`.
2. Rodar `npm run lint`, `npm run typecheck` e `node scripts/classificar-risco.mjs origin/staging`. Se lint ou typecheck falhar, parar e corrigir antes de pedir revisão.
3. Chamar o agente `revisor-marcon` (Agent tool, `subagent_type: "revisor-marcon"`) com o alvo. Se o agente não estiver disponível, fazer a revisão seguindo `docs/REVISAO.md` na própria sessão.
4. Corrigir os achados "bloqueia" e "corrigir". Rodar de novo o passo 3 até não sobrar achado "bloqueia".
4b. **Se o diff toca tela** (`src/app/**/page.tsx`, componentes visuais, `globals.css`, textos de tela), chamar o agente `testador-marcon` (Agent tool, `subagent_type: "testador-marcon"`) com a lista de telas afetadas. Ele roda o app local contra o Staging em 375 px, loga com conta de teste e percorre as telas. Corrigir o que ele marcar "quebra" ou "confunde" e testar de novo. Se o agente ou o navegador do app não estiver disponível, dizer no veredito "tela não testada no navegador" e não liberar para `main` sem o OK do dono. Diff sem tela (só banco, lib, CI, docs) dispensa o testador.
5. Decidir o próximo passo pelo nível de risco (`docs/REVISAO.md`):
   - Qualquer nível: mergear em `staging` com CI verde e revisão limpa, aplicar migration no Staging se houver, testar lá.
   - Produção: BAIXO pode seguir. ALTO para e pede o OK do dono com o resumo do PR.
6. Responder ao usuário em poucas linhas: nível de risco, veredito, achados que sobraram, resultado do testador (passou, falhou, não coberto) e o que ainda precisa ser testado no Staging.
