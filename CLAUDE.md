@AGENTS.md

# Padrão visual

Antes de criar ou mudar qualquer tela, leia `docs/DESIGN.md` (padrão Apple e minimalista do Marcon, decidido pelo dono). Siga as peças e regras de lá; telas fora do padrão são retrabalho.

# Ambientes (Staging e produção)

Leia `docs/AMBIENTES.md` antes de mexer em deploy, migration, variável de ambiente ou banco.

- **Tudo é feito primeiro no Staging e depois passado à produção** (código, migration, configuração). Branch `staging` = projeto Vercel `marcon-staging` + Supabase `Marcon Staging`. Branch `local-work-marcon` = produção.
- Só fazer direto em produção se o dono pedir explicitamente. Nesse caso, levar a mesma mudança ao Staging logo depois, para os dois ficarem no mesmo nível.
- PRs de trabalho abrem contra `staging`. A produção recebe por PR de `staging` para `local-work-marcon`, depois de testado.
- Migration: `node scripts/run-migrations.mjs .env.staging` primeiro, produção depois, mesma ordem. Conferir o `ref` impresso (`odgvhqwqyxtnaxgqiynb` é o Staging, `ouvxsfebfegqcvwmdume` é a produção). Nunca criar objeto no banco sem migration.
- Nunca colocar chave ou URL de produção no `.env.staging` nem o contrário. Nunca colar senhas e chaves no chat.
