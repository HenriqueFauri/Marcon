# Notificações do Marcon: todos os modelos

Gerado a partir de `src/lib/notificacoes.ts` em 2026-10-11. Se as frases mudarem lá, este arquivo precisa ser gerado de novo.

## Como funciona

- São avisos push (celular e computador, com o app instalado como PWA e a permissão dada).
- Cada aviso tem um **título** (a frase descontraída, sorteada) e um **corpo** (os dados).
- As frases giram: dentro de uma rodada nenhuma se repete, a ordem muda a cada rodada e por conta, e a primeira de uma rodada nunca é a última da anterior.
- O vendedor não escolhe a frase. Em Configurações ele só liga ou desliga cada grupo e escolhe quais dados aparecem.
- Tocar no aviso abre a tela indicada em cada grupo.
- Hoje **não há** aviso para: pedido novo da vitrine, estoque baixo, estoque zerado, resumo do dia, fim do teste grátis, assinatura atrasada. Estão no plano de melhorias de funções.

## Resumo

| Grupo (o que o vendedor liga) | Aviso | Quando sai | Frases |
|---|---|---|---|
| Vendas | Venda registrada | Na hora, a cada venda registrada (pela tela ou pelo assistente do WhatsApp) | 30 |
| Meta batida | Meta batida | Uma vez, quando uma venda faz o mês cruzar a meta de vendas ou a meta de lucro | 14 |
| Marcos de faturamento | Marco de R$ 1 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 1 | 12 |
| Marcos de faturamento | Marco de R$ 5 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 5 | 12 |
| Marcos de faturamento | Marco de R$ 10 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 10 | 12 |
| Lembrete de cobrança | Lembrete de cobrança | Todo dia às 8h (Brasília), só se houver parcela vencendo hoje ou atrasada | 16 |

Total: **96 frases** em 6 tipos de aviso, 4 grupos.

## Venda registrada

- **Quando:** Na hora, a cada venda registrada (pela tela ou pelo assistente do WhatsApp).
- **Corpo (dados):** Uma linha com o que o vendedor escolheu mostrar: produto (com `+N` se houver mais itens), valor, lucro, cliente e canal. Padrão: produto, valor e lucro.
- **Exemplo de corpo:** Tênis Casual +1 · R$ 189,90 · lucro R$ 72,40
- **Ao tocar, abre:** A venda (`/vendas/<id>`)
- **Liga e desliga em:** Configurações, grupo "Vendas"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Caiu mais uma! 💸 |  |
| 2 | Vendeu! 🎉 |  |
| 3 | Tem venda nova aí 👀 |  |
| 4 | Ka-ching! 🤑 |  |
| 5 | Mais uma pra conta 🙌 |  |
| 6 | O caixa agradece 💰 |  |
| 7 | Cliente feliz, caixa feliz 😄 |  |
| 8 | Boa! Vendeu de novo 🔥 |  |
| 9 | Fechou negócio 🤝 |  |
| 10 | Mais um pra lista de entregas 📦 |  |
| 11 | Dinheiro no bolso 😎 |  |
| 12 | Tá vendendo, hein? 👏 |  |
| 13 | Mais uma saiu! 🚀 |  |
| 14 | Pix na área 📲 |  |
| 15 | Bora embalar! 🎁 |  |
| 16 | O estoque diminuiu e o caixa cresceu 📈 |  |
| 17 | Negócio fechado ✅ |  |
| 18 | Mais um cliente atendido 🙌 |  |
| 19 | Isso aí, campeão! 🏅 |  |
| 20 | Tá rendendo hoje 🔥 |  |
| 21 | Venda feita, próxima! 💪 |  |
| 22 | Alguém aí tá bombando 😏 |  |
| 23 | Mais uma no histórico 📒 |  |
| 24 | Dia bom pra vender 🌟 |  |
| 25 | Entrou mais uma! 🎯 |  |
| 26 | Quem diria, hein? Vendeu 😄 |  |
| 27 | Missão de hoje: vender. Cumprida ✔️ |  |
| 28 | Olha o dinheirinho entrando 🤑 |  |
| 29 | Seguiu o fluxo: vendeu! 🌊 |  |
| 30 | Mais um pedido pra conta 🧾 |  |

## Meta batida

- **Quando:** Uma vez, quando uma venda faz o mês cruzar a meta de vendas ou a meta de lucro.
- **Corpo (dados):** `Vendas do mês: R$ X` ou `Lucro do mês: R$ X`.
- **Exemplo de corpo:** Vendas do mês: R$ 10.120,00
- **Ao tocar, abre:** O Início (`/`)
- **Liga e desliga em:** Configurações, grupo "Meta batida"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Meta batida! 🎯 | Missão cumprida. |
| 2 | Meta no bolso 🏆 |  |
| 3 | Bateu a meta! 🥳 |  |
| 4 | Meta fechada, pode comemorar 🎉 |  |
| 5 | Objetivo do mês: concluído ✅ |  |
| 6 | Chegou lá! 🚀 | A meta ficou pra trás. |
| 7 | Era só uma meta, né? 😎 |  |
| 8 | Meta cumprida, parabéns! 👏 |  |
| 9 | Você passou da meta 🔥 |  |
| 10 | Mais uma meta no currículo 📋 |  |
| 11 | Meta alcançada, e agora? 😏 |  |
| 12 | Deu certo! Meta batida 🙌 |  |
| 13 | Planejou, vendeu, bateu 💪 |  |
| 14 | Meta no papel e no bolso 💰 |  |

## Marco de R$ 1 mil no mês

- **Quando:** Uma vez, quando o faturamento do mês passa de R$ 1.000. Se uma venda pular mais de um marco, sai só o mais alto.
- **Corpo (dados):** `Faturamento de <mês>: R$ X`.
- **Exemplo de corpo:** Faturamento de setembro: R$ 1.230,50
- **Ao tocar, abre:** O Início (`/`)
- **Liga e desliga em:** Configurações, grupo "Marcos de faturamento"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Primeiro milhar do mês 🚀 |  |
| 2 | R$ 1 mil no caixa! 💰 |  |
| 3 | Já passou de mil! 🙌 |  |
| 4 | O mês começou bem 😎 |  |
| 5 | Mil reais e contando 🔥 |  |
| 6 | Aquecimento concluído 💪 |  |
| 7 | Mil reais vendidos! 🎉 |  |
| 8 | Passou de mil, bora pra mais 📈 |  |
| 9 | Primeiro mil do mês no bolso 🤑 |  |
| 10 | O mês já tem cara de bom 👀 |  |
| 11 | Mil na conta, segue o jogo ⚡ |  |
| 12 | Mil batidos, tá voando 🛫 |  |

## Marco de R$ 5 mil no mês

- **Quando:** Uma vez, quando o faturamento do mês passa de R$ 5.000.
- **Corpo (dados):** `Faturamento de <mês>: R$ X`.
- **Exemplo de corpo:** Faturamento de setembro: R$ 5.230,50
- **Ao tocar, abre:** O Início (`/`)
- **Liga e desliga em:** Configurações, grupo "Marcos de faturamento"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Cinco mil, sem freio 🔥 |  |
| 2 | R$ 5 mil no mês! 🎊 |  |
| 3 | O ritmo tá forte 💪 |  |
| 4 | Cinco mil batidos 🙌 |  |
| 5 | Isso já é mês bom 😎 |  |
| 6 | Subindo de nível ⭐ |  |
| 7 | Cinco mil e o mês nem acabou 👀 |  |
| 8 | Mês forte, hein? 5 mil vendidos 📈 |  |
| 9 | 5 mil! Respira e continua 😮‍💨 |  |
| 10 | Meio caminho dos 10 mil 🚀 |  |
| 11 | Faturamento de gente grande 🏆 |  |
| 12 | Cinco mil no mês, parabéns! 🥳 |  |

## Marco de R$ 10 mil no mês

- **Quando:** Uma vez, quando o faturamento do mês passa de R$ 10.000.
- **Corpo (dados):** `Faturamento de <mês>: R$ X`.
- **Exemplo de corpo:** Faturamento de setembro: R$ 10.230,50
- **Ao tocar, abre:** O Início (`/`)
- **Liga e desliga em:** Configurações, grupo "Marcos de faturamento"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Dez mil! Respira e comemora 👑 |  |
| 2 | R$ 10 mil no mês! 🏆 |  |
| 3 | Nível lendário desbloqueado ✨ |  |
| 4 | Dez mil batidos, que fase! 🚀 |  |
| 5 | Mês histórico 🥳 |  |
| 6 | Faturamento de respeito 👏 |  |
| 7 | Dez mil! Pode comemorar 🍾 |  |
| 8 | Isso aqui já é empresa 🏢 |  |
| 9 | Cinco dígitos no mês 🔥 |  |
| 10 | Mês de campeão 🥇 |  |
| 11 | Dez mil, e agora mira nos 20 😏 |  |
| 12 | Tá no topo do mês! 🏔️ |  |

## Lembrete de cobrança

- **Quando:** Todo dia às 8h (Brasília), só se houver parcela vencendo hoje ou atrasada. Um aviso por conta, com o resumo.
- **Corpo (dados):** Primeira linha: quantidade de parcelas e valor total. Segunda linha: até 3 nomes de quem deve, do maior valor para o menor, e `e mais N`. O vendedor pode esconder o valor ou os nomes.
- **Exemplo de corpo:** 2 parcelas · R$ 450,00 / João e Maria
- **Ao tocar, abre:** Contas a receber (`/contas-a-receber`)
- **Liga e desliga em:** Configurações, grupo "Lembrete de cobrança"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Hora do lembrete gentil 🔔 |  |
| 2 | Tem gente te devendo 👀 |  |
| 3 | Dia de receber! 💵 |  |
| 4 | Uma mensagem hoje, dinheiro amanhã 📲 |  |
| 5 | Bora cobrar (com carinho) 😉 |  |
| 6 | Parcelas pedindo atenção ⏰ |  |
| 7 | Não esquece de cobrar 🧠 |  |
| 8 | Dinheiro seu na mão dos outros 😅 |  |
| 9 | Tem parcela esperando você 📬 |  |
| 10 | Que tal um oi no WhatsApp? 💬 |  |
| 11 | Dinheiro parado, hora de buscar 🏃 |  |
| 12 | Cobrar faz parte do negócio 🤝 |  |
| 13 | Lembrete do dia: receber 📌 |  |
| 14 | Uma conversa rápida resolve 😄 |  |
| 15 | Contas a receber chamando 📞 |  |
| 16 | Seu dinheiro quer voltar pra casa 🏠 |  |

## Outras mensagens que o Marcon manda

Não são push, mas chegam ao vendedor:

- **Aviso de exemplo:** o botão em Configurações manda um push de teste com dados fictícios (Tênis Casual, Maria Souza), usando uma frase do grupo escolhido.
- **Assistente do WhatsApp:** mensagens fixas de vínculo, ajuda, cota (80% e limite), confirmação com SIM e NÃO e resultado do lançamento. Ficam em `src/app/api/whatsapp/route.ts` e `src/lib/whatsapp/`.
- **E-mails de conta:** confirmação de cadastro e redefinição de senha saem pelo Supabase Auth, com os modelos configurados no painel do Supabase (não estão no código).
- **Cobrança da assinatura:** e-mails e avisos de pagamento saem pelo Asaas, com os modelos do Asaas.
