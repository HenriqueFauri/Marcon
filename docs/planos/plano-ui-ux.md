# Plano de melhorias de UI/UX

Feito em 2026-10-11, lendo o código das telas e conferindo contra `docs/DESIGN.md`. É uma proposta: nada aqui está decidido. As telas logadas não foram abertas no navegador nesta rodada, então vale conferir cada item no celular antes de começar.

Esforço: **P** até meio dia, **M** um a dois dias, **G** mais que isso.

## Como ler

- **Agora:** atrapalha quem usa todo dia, ou quebra o padrão do `DESIGN.md`.
- **Depois:** melhora clara, sem urgência.
- **Quando der:** polimento.

## Agora

| # | O quê | Por quê | Onde | Esforço |
|---|---|---|---|---|
| 1 | **Foto pequena em cada produto na tela de venda** (lista e carrinho) | Nome inteiro já resolve o corte, mas a foto é o que faz achar o produto de relance. Hoje o carrinho mostra um ícone de caixa igual para todos | `vendas/novo/produto-seletor.tsx`, `venda-form.tsx` | M |
| 2 | **Tirar a rolagem dentro da rolagem na venda** | A lista de produtos tem altura fixa e rola por dentro da página. No celular o dedo prende na lista. Trocar por busca fixa no topo e lista que rola com a página | `produto-seletor.tsx` (`max-h-[28rem]`) | M |
| 3 | **Abas de canal dos anúncios** | É uma fileira de chips que rola de lado, exatamente o que o `DESIGN.md` proíbe (corta no celular). Com até 4 canais, controle segmentado; com mais, um seletor | `anuncios/[id]/anuncios-editor.tsx` | P |
| 4 | **Frases sob o título dos cartões** | Dez cartões ainda têm frase explicativa em cima (Configurações, Anúncios, Indique, Variações, Assinatura). O padrão é rodapé do grupo ou nada | lista no fim deste arquivo | P |
| 5 | **Confirmação de preço zero na venda** | Usa a caixa `confirm()` do navegador, a única do app. Trocar pelo modal padrão | `venda-form.tsx` | P |
| 6 | **Alvos de toque pequenos** | Botões de mais e menos do carrinho têm 34 px, a estrela de destaque 36 px. O mínimo confortável no iPhone é 44 px | `venda-form.tsx`, `vitrine/produtos-da-vitrine.tsx` | P |
| 7 | **Interruptor "Na vitrine" dentro do cadastro do produto** | Com a vitrine agora separada, o cadastro deveria só mostrar o estado e levar para Vitrine, Produtos | `produtos/_components/produto-form.tsx` | P |

## Depois

| # | O quê | Por quê | Onde | Esforço |
|---|---|---|---|---|
| 8 | **Cadastro rápido de produto** | O formulário tem 4 cartões e mais de 12 campos. Abrir só com nome, preço, estoque e foto, e o resto em "Mais detalhes" | `produto-form.tsx` | M |
| 9 | **Barra de baixo do celular** | Tem Início, Vendas, Produtos e Anúncios. Vitrine, Contas a receber e Caixa ficam a dois toques, no menu do avatar. Opções: trocar Anúncios por "Mais", ou deixar o vendedor escolher os atalhos | `components/app-nav.tsx` | M |
| 10 | **Selo de pedido novo da vitrine na navegação** | Pedido novo só aparece dentro da Vitrine. Um número vermelho na barra e no menu evita pedido esquecido | `app-nav.tsx`, `(app)/layout.tsx` | P |
| 11 | **Busca que acha tudo** | A lupa do topo só busca produtos. Achar também cliente e venda (por nome ou valor) | `app-nav.tsx`, tela nova | M |
| 12 | **Primeiros passos no Início** | A Vitrine tem lista de primeiros passos; o app não. Conta nova deveria ver: cadastre um produto, registre uma venda, ligue os avisos | `(app)/page.tsx` | M |
| 13 | **"Desfazer" no lugar de confirmar** | Marcar parcela como paga e tirar da vitrine podem ter aviso com "Desfazer" em vez de pergunta antes | `contas-a-receber`, `components/toaster.tsx` | M |
| 14 | **Prévia de verdade do produto na Vitrine** | A tela nova mostra o cartão. O próximo passo é a folha do produto como o cliente vê, usando a prévia que já existe em Personalizar | `vitrine/produtos/[id]`, `previa-da-loja` | M |
| 15 | **Listas de importação com rolagem própria** | Mesmo problema do item 2 | `importar/importador.tsx` | P |

## Quando der

| # | O quê | Esforço |
|---|---|---|
| 16 | Arrastar para ordenar as fotos direto na tela do produto da Vitrine (hoje só escolhe a capa) | M |
| 17 | Atalhos de teclado na venda no computador (barra para buscar, Enter para adicionar) | P |
| 18 | Aviso de "sem internet" e de "salvando" no app instalado | P |
| 19 | Revisão de contraste e leitor de tela nas telas mais usadas (venda, produtos, contas a receber) | M |
| 20 | Animações curtas de entrada e saída nas listas (item adicionado ao carrinho, parcela paga) | P |

## O que já saiu nesta rodada

- Nome do produto inteiro na lista e no carrinho da venda, e na tela da venda (antes cortava com reticências).
- Vitrine separada dos Anúncios: tela do produto dentro da Vitrine com capa, fotos e texto.

## Cartões com frase sob o título (item 4)

- `anuncios/[id]/anuncios-editor.tsx`: "Títulos e descrições"
- `anuncios/[id]/fotos-section.tsx`: "Fotos"
- `assinatura/assinatura-painel.tsx`: "Seu uso"
- `configuracoes/page.tsx`: "Dados da empresa", "Importar dados", "Canais de venda", Notificações
- `indique/indique-cliente.tsx`: "Seu link", "Sacar"
- `produtos/[id]/page.tsx` e `produtos/_components/produto-form.tsx`: "Variações"
- `fluxo-de-caixa/page.tsx`: frase sob o título da página
