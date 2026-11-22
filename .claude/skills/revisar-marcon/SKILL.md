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
5. Decidir o próximo passo pelo nível de risco (`docs/REVISAO.md`):
   - Qualquer nível: mergear em `staging` com CI verde e revisão limpa, aplicar migration no Staging se houver, testar lá.
   - Produção: BAIXO pode seguir. ALTO para e pede o OK do dono com o resumo do PR.
6. Responder ao usuário em poucas linhas: nível de risco, veredito, achados que sobraram, o que ainda precisa ser testado no Staging.
