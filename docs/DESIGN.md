# Padrão visual do Marcon

Leia antes de criar ou mudar qualquer tela. O padrão foi definido pelo dono em 2026-10-07: **essência Apple, minimalista, nada com cara de genérico**. A tela **Início** (`src/app/(app)/page.tsx`) é a referência: quando houver dúvida, copie o jeito dela.

## Princípios

1. **Ajustes do iPhone, não painel web.** Conteúdo em grupos brancos de cantos bem arredondados sobre o fundo cinza-gelo, com título de seção pequeno em maiúsculas por cima (`text-[13px] uppercase text-ink-muted`, `px-4`).
2. **Pouco texto.** Sem frase explicativa embaixo do título da página ("sobrancelha"): o `PageHeader` só recebe `description` quando ela é um dado (nome do cliente, categoria do produto). Explicação curta, quando precisar, vai no rodapé do grupo (`text-[13px] text-ink-muted`, `px-4`) ou dentro do cartão.
3. **Uma cor de marca.** Terracota só como preenchimento (botão principal, ícone de destaque); como texto, `text-brand-text`. Verde, amarelo e vermelho só para estado (positivo, aviso, perigo), e nunca só pela cor.
4. **Celular primeiro.** Testar em 390 px de largura antes de considerar pronto: nada pode passar da largura nem cortar texto importante.

## Peças a usar

| Precisa de | Use | Onde |
| --- | --- | --- |
| Título da página | `PageHeader` (sem `description`, `back` vira "‹ Anterior" na cor da marca) | `src/components/ui.tsx` |
| Número de destaque | `StatCard` (a dica quebra em 2 linhas, não corta) | `src/components/ui.tsx` |
| Filtro que muda a URL | `Segmentos` (controle segmentado que divide a largura) | `src/components/ui.tsx` |
| Escolha dentro de formulário ou troca de aba sem URL | `Segmentado` | `src/components/ajustes.tsx` |
| Grupo de campos ou lista | `Grupo` (título pequeno em cima, rodapé opcional) | `src/components/ajustes.tsx` |
| Liga/desliga | `Interruptor` (switch verde do iOS, `bg-positive`) | `src/components/ajustes.tsx` |
| Linha que navega | `LinhaLink` (ícone em quadrado colorido, detalhe cinza, `›`) | `src/components/ajustes.tsx` |
| Botões | `btnPrimary` (pílula terracota), `btnSecondary`, `btnGhost` | `src/components/ui.tsx` |
| Explicação de um cartão | prop `rodape` do `Card` (texto embaixo, fora do cartão; nunca `description` com frase) | `src/components/ui.tsx` |
| Borda fina de cartão | utilitário `hairline` (aceita `sm:`) | `src/app/globals.css` |

As peças de `ajustes.tsx` nasceram na vitrine (`vitrine/campos.tsx` só reexporta). Peça nova que servir a mais de uma área vai direto para `src/components/`.

## Regras de layout

- **Filtros e abas:** controle segmentado que divide a largura. Nunca uma fileira de chips com `overflow-x-auto`: corta no celular ("Todo" e "Inativo" cortados foram o motivo desta regra). Rótulos curtos que caibam ("Zerados", não "Sem estoque", com 4 opções).
- **Tabelas:** só em tela larga. No celular, lista agrupada: nome em `text-[17px]`, detalhe em `text-[13px] text-ink-muted`, valor à direita, `›` no fim. Padrão: lista `sm:hidden` + tabela dentro de `hidden sm:block` (Vendas, Produtos), ou cabeçalho `hidden sm:table-header-group` (Clientes).
- **Muitas seções numa área:** no celular, uma tela de entrada com lista agrupada (como o Ajustes) e cada seção com "‹ Voltar"; no computador, abas segmentadas no topo (ver `src/app/(app)/vitrine/abas.tsx`).
- **Ações de um item:** atalhos em fileira com ícone em cima do nome (como Contatos do iPhone), uma ação principal em destaque (`btnPrimary`, largura toda no celular). Ação destrutiva (excluir, cancelar) no **fim da tela**, como texto vermelho discreto, nunca ao lado das ações do dia a dia.
- **Formulários:** campos agrupados por assunto em `Grupo`; botão de salvar com largura toda no celular. Sem caixa cinza dentro de cartão branco (um nível de contêiner só).
- **Selos (`Badge`):** com moderação. Se o mesmo selo aparece em quase todo item, troque por texto discreto na linha de detalhe.
- **Inputs de data:** já corrigidos globalmente para o iPhone em `globals.css`; não dar largura fixa.

## Tipografia e espaçamento

- Geist. Títulos de página `text-[28px] font-bold tracking-tight`; texto de lista `text-[17px]`; detalhe e rótulo `text-[13px]`.
- Grupos separados por `gap-7`; cartões `rounded-3xl`, linhas internas `px-4 py-3` com `divide-y divide-line`.

## Textos (regras de copy)

- Nunca travessão nem hífen como pausa (" - "). Use dois-pontos, vírgula ou ponto.
- Tom próximo e informal ("pra", "Zap", "tá"), valor antes do preço.
- Não usar "pelo celular", "sacoleira", "fiado".
- Detalhes e decisões de marca: vault, `negocios/usemarcon/identidade-visual.md` e `regras-de-copy-e-publico.md`.

## Antes de abrir o PR de uma tela

- [ ] Abriu em 390 px: nada passa da largura, nada importante cortado
- [ ] Sem frase sob o título; explicações no rodapé do grupo
- [ ] Filtros segmentados, listas no celular, destrutivo no fim
- [ ] Tema escuro conferido (tokens, nunca cor fixa)
- [ ] Sem travessão nem hífen como pausa nos textos

## Carregamento

Toda espera tem de aparecer na tela. Peças prontas, sem biblioteca:

- **Navegação:** a barra fina no topo (`BarraDeProgresso`, no layout do app) liga sozinha em qualquer clique em link interno e termina quando o endereço muda. Nada a fazer por tela.
- **Linha que navega:** termine o `Link` com `<SetaLink />` (o "›" vira spinner) e some `linkPendente` à classe do `Link` (a linha escurece). Tem de estar dentro do `Link` (`useLinkStatus`). `LinhaLink` já faz isso.
- **Botão que chama server action:** `useAction()` e `disabled={isPending}`; o texto vai em `<RotuloAcao pendente={isPending} ocupado="Salvando...">Salvar</RotuloAcao>`, que mostra spinner sem mudar a largura do botão.
- **Rota lenta:** crie `loading.tsx` com `EsqueletoLista` ou `EsqueletoDetalhe` (`src/components/esqueleto.tsx`). Sem ele, vale o esqueleto genérico de `(app)/loading.tsx`.
- Movimento respeita `prefers-reduced-motion` (`motion-reduce:`).
