# Extensão do Marcon para o WhatsApp Web

Painel ao lado do WhatsApp Web que busca os produtos do Marcon e coloca na caixa de mensagem um texto pronto (nome, preço, "Disponível" ou "Sob consulta" e o link da vitrine quando ele vale). **Quem envia é sempre o dono**, com o clique dele: a extensão nunca envia, nunca lê nem guarda conversas, sem resposta automática, disparo ou agendamento.

Na aba **Respostas** ficam as respostas prontas que o dono cria no app (Configurações, Respostas prontas), com as variáveis já preenchidas.

Na aba **Vender** o dono registra uma venda rápida à vista sem sair da conversa: produtos (com variação), quantidade, preço editável, forma de pagamento e canal da conta (WhatsApp já escolhido, se existir), cliente opcional. Depois, abre a venda no app ou insere o link do recibo na caixa (sem enviar). Prazo, parcelas, desconto e encomenda ficam no app.

Na aba **Mídia** ficam as fotos, PDFs e áudios da biblioteca da conta (app, Configurações, Biblioteca de mídia), com busca e **Anexar**, e o gravador de áudio. Na aba **Produtos**, **Anexar foto** manda a capa do produto e **Fotos** abre as outras para escolher. **Anexar só abre a prévia de anexo do próprio WhatsApp**, com o arquivo; quem confere e envia, na prévia, é o dono.

Decisão e regras de negócio: vault, `negocios/usemarcon/extensao-whatsapp.md`. Partes 1 (produtos), 2 (respostas prontas), 3 (fotos, arquivos e áudios) e 5 (venda rápida) de 5.

## Como funciona

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Service worker | `src/sw.ts` | Sessão própria em `chrome.storage.local` (supabase-js, chave anon, PKCE), login por e-mail e senha e Google, renovação, sair (só na extensão), busca e entrega do texto à aba do WhatsApp |
| Busca | `src/busca.ts` | `produtos` com `ilike` em nome, marca, SKU e código de barras (cada palavra), SKU de variação, capa assinada (`produto_capas`), link só para o que `vitrine_publica` devolve |
| Texto | `src/formatar.ts` | Monta a mensagem. Preço único (`preco_varejo` ou preço da variação). Nunca a quantidade |
| Respostas prontas | `src/respostas-db.ts`, `src/respostas.ts` | Lista da conta (`respostas_prontas`, migration 0073, RLS do dono) e dados que preenchem as variáveis: nome do negócio, Pix, endereço e telefone (metadados da conta, lidos com `getUser`) e link da loja só quando `vitrine_publica` devolve a loja. As regras das variáveis, da busca e do atalho vivem em `../src/lib/respostas.ts`, o mesmo arquivo do app |
| Venda rápida | `src/venda.ts`, `../src/lib/venda-rapida.ts`, rota `../src/app/api/extensao/venda/route.ts` | Formas, canais e clientes da conta (RLS do dono). A venda vai à rota do Marcon com o token do dono (Bearer, conferido no Supabase Auth; CORS só para o ID da extensão), que chama `registrar_venda_unica` (migration 0075) e manda o aviso no celular só quando a venda é nova. Cada tentativa leva uma chave (uuid): repetir a mesma venda (rede caiu, clique de novo) devolve a mesma venda, sem duplicar; mudou qualquer coisa, chave nova. Data no fuso do Brasil, calculada no servidor |
| Painel | `src/painel.ts`, `painel.css` | Tela do dono no padrão de `docs/DESIGN.md`. No painel lateral do navegador ou, sem ele, embutido na aba do WhatsApp |
| Na aba do WhatsApp | `src/conteudo.ts`, `src/inserir.ts` | Coloca o texto na caixa (evento de colar, depois `execCommand insertText`), confere que entrou, avisa claro se o WhatsApp mudou |
| Mídia | `src/midias-db.ts`, `src/anexar.ts`, `src/base64.ts` | Lista da biblioteca (`midias`, migration 0074) e fotos do produto (`produto_fotos`) com URL assinada; baixa só o arquivo que o dono pediu e manda à aba, que abre a prévia de anexo (colar o arquivo e, se não abrir, soltar na conversa). Regras de tipo, tamanho e nome em `../src/lib/midias.ts`, o mesmo arquivo do app |
| Gravador | `src/painel.ts`, `src/microfone.ts` | MediaRecorder em M4A (AAC), até 2 minutos. `microfone.html` abre numa aba para liberar o microfone quando o painel lateral não mostra o pedido |
| Volta do Google pela aba | `src/retorno.ts` | Plano B do login com Google quando o navegador não tem `chrome.identity.launchWebAuthFlow` |

Permissões (mínimas): `storage`, `sidePanel`, `identity` e acesso só a `https://web.whatsapp.com/*`. Nada de chave de serviço: o banco aplica a mesma RLS do site.

ID fixo da extensão: `paecegdlhpfepcjinghnhgghpkidpfna` (campo `key` do manifest, gerado de `chave.json`, que só tem a chave pública).

## Build

Dependências só nesta pasta. O build lê do arquivo de ambiente apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, confere o `ref` (Staging `odgvhqwqyxtnaxgqiynb`, produção `ouvxsfebfegqcvwmdume`) e recusa chave que não seja a anon.

```bash
cd extensao
npm install
node build.mjs --amb staging  --env ../.env.staging   # dist/staging
node build.mjs --amb producao --env ../.env.local     # dist/producao
```

As duas versões têm o mesmo ID: instale uma de cada vez no mesmo navegador.

## Instalar no Brave (modo desenvolvedor)

1. Gere a pasta (acima). Para o uso do dia a dia, `dist/producao`.
2. No Brave, abra `brave://extensions`.
3. Ligue **Modo do desenvolvedor** (canto de cima, à direita).
4. **Carregar sem compactação** e escolha a pasta `extensao/dist/producao`.
5. Fixe o ícone do Marcon na barra (ícone de quebra-cabeça, alfinete).
6. Abra `https://web.whatsapp.com`, clique no ícone do Marcon e entre com e-mail e senha ou Google.
7. Abra uma conversa, busque o produto e clique em **Inserir**. Revise o texto na caixa e envie você mesmo.

Respostas: crie no app em Configurações, Respostas prontas. No painel, aba **Respostas**, busque por título, texto ou `/atalho` e clique em **Inserir** (ou **Copiar**). A lista recarrega ao abrir a aba, ao voltar ao painel e no botão **Atualizar**. Linha com variável sem dado na conta (ex.: `Chave: {pix}` sem Pix cadastrado) sai do texto.

Atualizar depois de um build novo: em `brave://extensions`, botão de recarregar do card do Marcon, e recarregue a aba do WhatsApp (F5).

## Login com Google (Supabase)

Precisa de duas Redirect URLs no Supabase, Staging primeiro e produção depois. Passo a passo em `docs/AMBIENTES.md`, seção "Extensão do WhatsApp Web". E-mail e senha funcionam sem isso.

## Testes

```bash
npm test                                            # formatador, variáveis das respostas e regras de mídia (unitário)
npm run typecheck
node teste/busca-staging.ts ../.env.staging         # login, renovação, busca e sair no Staging, conta de teste
node teste/respostas-staging.ts ../.env.staging     # cria, carrega, preenche, reordena e apaga uma resposta no Staging
node teste/venda-staging.ts ../.env.staging <conta-b.json> [--rota]   # venda sem duplicar, estoque, caixa, conta B, sem login; --rota testa a rota no ar
node teste/midias-staging.ts ../.env.staging        # mídia pela API: conta A sobe e baixa, conta B (criada e apagada aqui) e anon não leem nada de A
node teste/servir.mjs                               # simulação em http://127.0.0.1:4317 (caixa e prévia do painel)
```

A simulação (`teste/simulacao.html`) tem uma caixa parecida com a do WhatsApp com quatro modos (editor que trata o colar, caixa simples, sem conversa aberta e layout mudado) e expõe `window.marcon.inserir()`, `window.marcon.inserirTexto(texto)` e `window.marcon.estado()` (inclui quantos envios aconteceram, que tem de ser sempre 0). `painel.html` na mesma porta é a prévia do painel com respostas falsas.

A mesma página simula a prévia de anexo do WhatsApp (por cima da conversa, com Enviar que só o clique envia) em três modos: abre ao colar, só ao soltar, não abre. `window.marcon.anexar(nome, mime, tamanho)` passa pelo mesmo `anexarArquivo` da extensão; `estado()` traz `naPrevia` e `enviosDeArquivo` (sempre 0).

## Mídia: o que o pico técnico mostrou (27/11/2026)

Como pôr um arquivo na conversa sem enviar: o WhatsApp Web abre a **prévia de anexo** quando recebe um arquivo colado (Ctrl+V de um print) ou solto na conversa. A extensão faz o mesmo com evento sintético: `ClipboardEvent("paste")` com um `DataTransfer` que leva o `File`, na caixa de mensagem; se em 2 s a caixa não ficou coberta pela prévia, `dragenter`, `dragover` e `drop` no meio da conversa. Nunca aperta Enter nem clica em Enviar.

Conferido na simulação (Chromium 156): o evento chega à página com o arquivo (nome, tipo e tamanho certos; `isTrusted` falso), a prévia abre nos dois caminhos, o arquivo entra uma vez só, prévia já aberta não recebe outro, e envios = 0. O MediaRecorder grava `audio/mp4` (AAC), não grava OGG; WebM fica de fora porque o WhatsApp manda como documento.

**Só o dono confirma no WhatsApp de verdade** (sem conta de teste do WhatsApp aqui):

1. Se o WhatsApp aceita o colar sintético (`isTrusted` falso) ou só o soltar. Se nenhum abrir a prévia, o painel avisa e oferece **Baixar** para arrastar à mão.
2. Se a prévia aberta cobre a caixa de mensagem (é o sinal de "abriu"). Se não cobrir, a extensão tenta soltar também e o arquivo pode aparecer duas vezes na prévia: tire um antes de enviar.
3. Como o áudio chega: **arquivo de áudio com play, não mensagem de voz** (é o esperado e o aceito; nada de disfarçar áudio pronto como gravado na hora). Conferir que o M4A gravado no painel toca no celular do cliente.
4. Se o painel embutido (navegador sem painel lateral) consegue usar o microfone dentro do WhatsApp; se não, use **Liberar microfone** ou grave no celular e suba no app.
