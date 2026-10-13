# Notificações do Marcon: todos os modelos

Gerado a partir de `src/lib/notificacoes.ts` em 2026-10-12. Se as frases mudarem lá, este arquivo precisa ser gerado de novo.

## Como funciona

- São avisos push (celular e computador, com o app instalado como PWA e a permissão dada).
- Cada aviso tem um **título** (a frase descontraída, sorteada) e um **corpo** (os dados).
- As frases giram: dentro de uma rodada nenhuma se repete, a ordem muda a cada rodada e por conta, e a primeira de uma rodada nunca é a última da anterior.
- O vendedor não escolhe a frase. Em Configurações ele só liga ou desliga cada grupo e escolhe quais dados aparecem.
- Tocar no aviso abre a tela indicada em cada grupo.
- Hoje **não há** aviso para: fim do teste grátis e assinatura atrasada.
- A inscrição é **por aparelho e por endereço do app**. Se o endereço muda (foi o caso de usemarcon.vercel.app para www.usemarcon.com) ou o app é reinstalado, é preciso ativar de novo. O Início mostra um lembrete discreto ("Os avisos estão desligados neste aparelho") em aparelho que suporta push e está sem inscrição; dá para dispensar, e ele volta se a inscrição for feita e sumir depois.
- Falha de envio vai para o log do servidor (Vercel, Logs, busca por `[push]`): código de resposta, serviço (Apple, Google, Mozilla) e a conta. Inscrição que o serviço diz não existir mais (404 ou 410) é apagada e também fica registrada. Sem as chaves VAPID no ambiente, sai um aviso `[push] chaves VAPID ausentes` e nada é enviado.

## Resumo

| Grupo (o que o vendedor liga) | Aviso | Quando sai | Frases |
|---|---|---|---|
| Vendas | Venda registrada | Na hora, a cada venda registrada (pela tela ou pelo assistente do WhatsApp) | 30 |
| Pedidos da vitrine | Pedido novo da vitrine | Na hora, quando o cliente envia um pedido pela loja | 16 |
| Estoque acabando | Estoque acabando | Uma vez, quando uma venda faz o produto cruzar o limite "avisar quando tiver até" | 12 |
| Estoque acabando | Estoque zerado | Uma vez, quando uma venda zera o produto ou uma variação | 12 |
| Meta batida | Meta batida | Uma vez, quando uma venda faz o mês cruzar a meta de vendas ou a meta de lucro | 14 |
| Marcos de faturamento | Marco de R$ 1 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 1 | 12 |
| Marcos de faturamento | Marco de R$ 5 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 5 | 12 |
| Marcos de faturamento | Marco de R$ 10 mil no mês | Uma vez, quando o faturamento do mês passa de R$ 10 | 12 |
| Lembrete de cobrança | Lembrete de cobrança | Todo dia às 8h (Brasília), só se houver parcela vencendo hoje ou atrasada | 16 |
| Resumo do dia | Resumo do dia | Todo dia entre 20h e 20h59 (Brasília), só para quem vendeu no dia | 14 |

Total: **150 frases** em 10 tipos de aviso, 7 grupos.

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

## Pedido novo da vitrine

- **Quando:** Na hora em que o cliente toca em "Enviar pedido" na loja e o pedido é gravado. Pedido recusado pelo banco (loja fora do ar, itens sem estoque) não avisa. O pedido de teste feito pelo próprio dono também avisa.
- **Corpo (dados):** Uma linha: primeiro produto (com `+N` se houver mais itens), total do pedido e nome do cliente, se ele informou.
- **Exemplo de corpo:** Tênis Casual +1 · R$ 189,90 · Maria Souza
- **Ao tocar, abre:** O pedido (`/vitrine/pedidos/<id>`)
- **Liga e desliga em:** Configurações, grupo "Pedidos da vitrine"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Pedido novo na vitrine! 🛍️ |  |
| 2 | Chegou pedido 👀 |  |
| 3 | Tem cliente querendo comprar 🙋 |  |
| 4 | A vitrine trabalhou por você 😎 |  |
| 5 | Olha o pedido aí! 📬 |  |
| 6 | Pedido fresquinho 🔔 |  |
| 7 | Alguém encheu o carrinho 🛒 |  |
| 8 | Sua loja recebeu um pedido 🏪 |  |
| 9 | Corre lá no Zap, tem pedido 📲 |  |
| 10 | Mais um pedido chegando 🙌 |  |
| 11 | Pediram pela vitrine! 🎉 |  |
| 12 | Cliente na porta 🚪 |  |
| 13 | Pedido novo, bora responder 💬 |  |
| 14 | A vitrine não para 🔥 |  |
| 15 | Tem carrinho fechado te esperando 🧾 |  |
| 16 | Pedido na área ⚡ |  |

## Estoque acabando

- **Quando:** Uma vez, logo depois de uma venda (pela tela ou pelo assistente do WhatsApp) que faz o estoque do produto cruzar o limite do campo "avisar quando tiver até". Produto sem limite preenchido não avisa. Em produto com variações o limite vale para a soma das variações.
- **Como não repete:** não há nada guardado. O aviso compara o estoque de antes da venda (o de agora mais o que ela tirou) com o de depois, e só sai se foi aquela venda que cruzou o limite. As vendas seguintes já partem de baixo do limite e não avisam. Se o estoque for reposto acima do limite, o próximo cruzamento avisa de novo. Saída manual de estoque e ajuste não avisam.
- **Corpo (dados):** Um produto por linha com quanto resta, até 3, e `e mais N`.
- **Exemplo de corpo:** Tênis Casual: restam 2
- **Ao tocar, abre:** O produto (`/produtos/<id>`) ou, com mais de um, a lista filtrada em Acabando (`/produtos?filtro=baixo`)
- **Liga e desliga em:** Configurações, grupo "Estoque acabando"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Tá acabando! ⏳ |  |
| 2 | Estoque no finalzinho 👀 |  |
| 3 | Hora de repor 📦 |  |
| 4 | Vendeu tanto que tá acabando 🔥 |  |
| 5 | Últimas unidades 🚨 |  |
| 6 | Bora falar com o fornecedor? 📞 |  |
| 7 | Estoque pedindo reforço 💪 |  |
| 8 | Quase no fim 📉 |  |
| 9 | Olho no estoque 👁️ |  |
| 10 | Restam poucos ⚠️ |  |
| 11 | Sucesso de vendas, estoque curto 😅 |  |
| 12 | Repor antes que acabe 🛒 |  |

## Estoque zerado

- **Quando:** Uma vez, logo depois de uma venda que zera o produto ou uma variação dele. Mesma regra de não repetir do aviso de estoque acabando. Se o produto zera, sai só este aviso (não o de acabando). Não depende do limite preenchido.
- **Corpo (dados):** Os nomes dos produtos, até 3, e `e mais N`. Variação aparece como `Produto (Variação)`.
- **Exemplo de corpo:** Meia Esportiva
- **Ao tocar, abre:** O produto (`/produtos/<id>`) ou, com mais de um, a lista filtrada em Zerados (`/produtos?filtro=sem`)
- **Liga e desliga em:** Configurações, grupo "Estoque acabando"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Acabou! 🚫 |  |
| 2 | Estoque zerado 📭 |  |
| 3 | Vendeu tudo! 🎉 |  |
| 4 | Esse esgotou 🔥 |  |
| 5 | Prateleira vazia 🕳️ |  |
| 6 | Zerou o estoque 😮 |  |
| 7 | Não sobrou nenhum 👏 |  |
| 8 | Esgotado! Hora de repor 📦 |  |
| 9 | Foi o último 🏁 |  |
| 10 | Saiu a última unidade 👋 |  |
| 11 | Acabou, e isso é bom sinal 😎 |  |
| 12 | Sem estoque por aqui ⚠️ |  |

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

## Resumo do dia

- **Quando:** Todo dia às 20h de Brasília (`/api/cron/resumo`, 23h UTC), só para quem registrou pelo menos uma venda com a data de hoje. No plano Hobby da Vercel a rotina sai em qualquer minuto entre 20h e 20h59. Dia sem venda não tem resumo, mesmo com parcela vencendo amanhã (o lembrete de cobrança da manhã seguinte cobre).
- **Corpo (dados):** Primeira linha: quantidade de vendas, valor e lucro do dia. Segunda linha, só se houver: parcelas que vencem amanhã e o valor. Segue o que o vendedor escolheu esconder: valor e lucro seguem os dados do aviso de venda, e o valor das parcelas segue o "Valor total" do lembrete de cobrança.
- **Exemplo de corpo:** 6 vendas · R$ 540,00 · lucro R$ 210,00 / 2 parcelas vencem amanhã · R$ 450,00
- **Ao tocar, abre:** O Início (`/`)
- **Liga e desliga em:** Configurações, grupo "Resumo do dia"

| # | Título | Linha extra antes dos dados |
|---|---|---|
| 1 | Fechou o dia! 🌙 |  |
| 2 | Resumo de hoje 📊 |  |
| 3 | Como foi o seu dia 👇 |  |
| 4 | Dia encerrado, olha só 👀 |  |
| 5 | O placar de hoje 🏆 |  |
| 6 | Hora de ver o resultado 💰 |  |
| 7 | Seu dia em números 🔢 |  |
| 8 | Balanço do dia ⚖️ |  |
| 9 | Mais um dia de vendas 🙌 |  |
| 10 | Fim de expediente 🌆 |  |
| 11 | Hoje rendeu! 📈 |  |
| 12 | O dia passou e deixou isso 💸 |  |
| 13 | Boa noite, olha o seu dia 😴 |  |
| 14 | Caixa do dia fechado ✅ |  |

## Rotinas agendadas

| Rota | Horário (UTC) | Horário (Brasília) | O que faz |
|---|---|---|---|
| `/api/cron/cobrancas` | `0 11 * * *` | 8h | Lembrete de cobrança |
| `/api/cron/resumo` | `0 23 * * *` | 20h | Resumo do dia |

Ficam em `vercel.json` e exigem `CRON_SECRET` (sem ele respondem 401). Plano Hobby da Vercel, conferido na documentação em 2026-10-12: até 100 rotinas por projeto, cada uma no máximo uma vez por dia, com precisão de uma hora (a das 20h sai entre 20h e 20h59). Expressão que rode mais de uma vez por dia derruba o deploy.

## Outras mensagens que o Marcon manda

Não são push, mas chegam ao vendedor:

- **Parcela recebida:** ao marcar uma parcela como paga sai um push fixo "Parcela recebida" (em `src/app/(app)/contas-a-receber/actions.ts`). Não tem frases em rotação nem grupo para desligar.
- **Aviso de exemplo:** o botão em Configurações manda um push de teste com dados fictícios (Tênis Casual, Maria Souza), usando uma frase do grupo escolhido.
- **Assistente do WhatsApp:** mensagens fixas de vínculo, ajuda, cota (80% e limite), confirmação com SIM e NÃO e resultado do lançamento. Ficam em `src/app/api/whatsapp/route.ts` e `src/lib/whatsapp/`.
- **E-mails de conta:** confirmação de cadastro e redefinição de senha saem pelo Supabase Auth, com os modelos configurados no painel do Supabase (não estão no código).
- **Cobrança da assinatura:** e-mails e avisos de pagamento saem pelo Asaas, com os modelos do Asaas.
