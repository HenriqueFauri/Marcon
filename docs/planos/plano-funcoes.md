# Plano de melhorias de funções

Feito em 2026-10-11, a partir do que o código faz hoje. É uma proposta para escolher: nada aqui está decidido, e a ordem é sugestão. O critério foi "o que poupa tempo ou evita prejuízo de quem vende todo dia", não "o que o concorrente tem".

Esforço: **P** até um dia, **M** dois a quatro dias, **G** uma semana ou mais.

## Primeiro: o que evita perder venda ou dinheiro

| # | Função | O que resolve | Já existe hoje | Esforço |
|---|---|---|---|---|
| 1 | **Aviso de pedido novo da vitrine** (push) | Pedido chega e o vendedor só vê se abrir a Vitrine | Pedido é gravado, sem aviso | P |
| 2 | **Aviso de estoque acabando e zerado** (push) | Descobrir que acabou só quando o cliente pede | O campo "avisar quando tiver até" e o filtro Acabando existem; o aviso não | P |
| 3 | **Recebimento parcial de parcela** | Cliente paga R$ 50 de uma parcela de R$ 100. Hoje é tudo ou nada | Só "marcar como paga" | M |
| 4 | **Cobrança com PIX pronto** | Mandar no WhatsApp a mensagem de cobrança já com a chave PIX ou o copia e cola do vendedor | Link do WhatsApp com mensagem existe; PIX do vendedor não | M |
| 5 | **Editar venda** | Errou o preço ou a forma de pagamento: hoje é cancelar e lançar de novo | Só cancelar | M |
| 6 | **Devolução e troca de um item** | Cliente devolve 1 de 3 itens. Hoje só cancela a venda inteira | Cancelar venda devolve tudo ao estoque | M |

## Segundo: o que poupa tempo no dia a dia

| # | Função | O que resolve | Esforço |
|---|---|---|---|
| 7 | **Resumo do dia** (push às 20h, e pelo WhatsApp quando o assistente abrir) | "Hoje: 6 vendas, R$ 540, lucro R$ 210, 2 parcelas vencem amanhã", sem abrir o app | P |
| 8 | **Ler código de barras pela câmera** | Achar o produto na venda e no estoque apontando a câmera. O campo de código de barras já existe no banco e não é usado em nenhuma tela | M |
| 9 | **Lista de reposição** | "O que comprar": produtos acabando, com sugestão de quantidade pelo que vendeu nos últimos 30 dias, pronta para mandar ao fornecedor pelo WhatsApp | M |
| 10 | **Contas a pagar e gastos que se repetem** | Aluguel, internet, boleto do fornecedor: lançar uma vez e o app lembra todo mês. Hoje o caixa só registra o que já saiu | M |
| 11 | **Orçamento ou pedido em aberto** | Montar o carrinho, mandar ao cliente e só virar venda quando ele confirmar, reservando o estoque | M |
| 12 | **Repetir venda** | Cliente que compra sempre a mesma coisa: abrir a última venda dele já preenchida | P |
| 13 | **Venda com entrada** | Parte agora, resto a prazo, na mesma venda | M |
| 14 | **Duplicar produto** | Cadastrar o parecido (Torneira preta, Torneira cromada) sem digitar tudo de novo | P |

## Terceiro: enxergar o negócio

| # | Função | O que mostra | Esforço |
|---|---|---|---|
| 15 | **Relatório de produtos** | Mais vendidos, mais lucrativos, margem por produto e por canal | M |
| 16 | **Dinheiro parado** | Produtos sem venda há 30, 60 e 90 dias e quanto custaram | P |
| 17 | **Clientes** | Total comprado, última compra, quem sumiu há 60 dias (para chamar de volta), quem mais compra | M |
| 18 | **Fechamento do mês** | Uma página (e PDF) com vendas, lucro, gastos por categoria e comparação com o mês anterior, para guardar ou mandar ao contador | M |
| 19 | **Exportar tudo** | Produtos, vendas, clientes e caixa em planilha. Hoje só existe importar | P |
| 20 | **Projeção da meta** | "No ritmo atual você fecha o mês em R$ X; faltam R$ Y por dia" | P |

## Quarto: vitrine e anúncios

| # | Função | O que resolve | Esforço |
|---|---|---|---|
| 21 | **Reserva de estoque no pedido da vitrine** | Dois clientes pedem a última unidade | M |
| 22 | **Status do pedido para o cliente** | Link "seu pedido" com recebido, separado, saiu para entrega | M |
| 23 | **Frete por bairro ou região** | Hoje é um frete fixo ou "a combinar" | M |
| 24 | **Onde o anúncio está publicado** | Guardar o link do anúncio em cada canal e lembrar de renovar (Marketplace derruba anúncio velho) | M |
| 25 | **Arte do produto para status e stories** | Foto com preço e nome da loja, pronta para postar | M |

## Quinto: assistente do WhatsApp

| # | Função | Situação | Esforço |
|---|---|---|---|
| 26 | **Cadastrar produto, entrada e saída de estoque, entrada e saída de caixa** | Base pronta nesta rodada (migration 0044 e `src/lib/whatsapp/lancamentos.ts`), desligada. Falta testar com o WhatsApp de verdade no Staging e ligar | P |
| 27 | **Áudio** | Já previsto (F3): transcrever e repetir "Entendi: ..." antes de agir | M |
| 28 | **Foto do produto vira cadastro** | Mandar a foto e o preço e o assistente cadastra com a foto | M |
| 29 | **Marcar parcela como paga** ("o João pagou") | Mesmo molde do SIM | P |

## Mais para a frente

- **Equipe:** mais de uma pessoa na mesma conta, com permissões (quem vende não vê lucro). **G**
- **Registrar venda sem internet** e enviar quando voltar. **G**
- **Etiquetas de preço** com QR para imprimir. **M**
- **Pedido de compra ao fornecedor** com custo de frete rateado no custo do produto. **M**
- **Nota fiscal:** só avaliar se os clientes pedirem; muda o posicionamento. **G**

## Sugestão de primeira leva

Itens 1, 2 e 7 juntos (três avisos novos, mesmo código das notificações, um PR), depois 3 e 4 (contas a receber), depois 8 (código de barras). São os que mais aparecem no uso diário e os mais baratos de fazer.
