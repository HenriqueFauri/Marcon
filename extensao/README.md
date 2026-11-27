# Extensão do Marcon para o WhatsApp Web

Painel ao lado do WhatsApp Web que busca os produtos do Marcon e coloca na caixa de mensagem um texto pronto (nome, preço, "Disponível" ou "Sob consulta" e o link da vitrine quando ele vale). **Quem envia é sempre o dono**, com o clique dele: a extensão nunca envia, nunca lê nem guarda conversas, sem resposta automática, disparo ou agendamento.

Na aba **Respostas** ficam as respostas prontas que o dono cria no app (Configurações, Respostas prontas), com as variáveis já preenchidas.

No topo da aba **Respostas** ficam as **sequências** (app, Configurações, Sequências): passos em ordem, cada um com texto (escrito ou de uma resposta pronta) e/ou um arquivo da biblioteca. **Começar** abre a sequência e mostra "Passo 2 de 4". Cada clique no botão grande faz uma coisa só (Inserir texto ou Anexar foto, PDF ou áudio) e só depois que ela deu certo aponta para a próxima; passo com texto e arquivo leva dois cliques. **Voltar** e **Pular** mudam o passo sem fazer nada. Sem timer: parado, nada anda. Passo que ficou vazio (resposta ou arquivo apagado) sai do roteiro e o rodapé avisa.

Na aba **Vender** o dono registra uma venda rápida à vista sem sair da conversa: produtos (com variação), quantidade, preço editável, forma de pagamento e canal da conta (WhatsApp já escolhido, se existir), cliente opcional. Depois, abre a venda no app ou insere o link do recibo na caixa (sem enviar). Prazo, parcelas, desconto e encomenda ficam no app.

Na aba **Mídia** ficam o gravador de áudio, as **fotos do estoque** (produtos com foto, com busca) e, quando a conta tem arquivo, a biblioteca (app, Configurações, Biblioteca de mídia). Na aba **Produtos**, **Anexar foto** manda a capa do produto e **Fotos** abre as outras para escolher. **Foto e PDF: Anexar só abre a prévia de anexo do próprio WhatsApp**; quem confere e envia, na prévia, é o dono. **Áudio: Enviar áudio de voz** manda uma mensagem de voz (a bolinha com onda) direto na conversa aberta, depois de o dono confirmar o nome dela (ver "Áudio de voz" abaixo).

Decisão e regras de negócio: vault, `negocios/usemarcon/extensao-whatsapp.md`. Partes 1 (produtos), 2 (respostas prontas), 3 (fotos, arquivos e áudios), 4 (sequências) e 5 (venda rápida) de 5.

## Como funciona

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Service worker | `src/sw.ts` | Sessão própria em `chrome.storage.local` (supabase-js, chave anon, PKCE), login por e-mail e senha e Google, renovação, sair (só na extensão), busca e entrega do texto à aba do WhatsApp |
| Busca | `src/busca.ts` | `produtos` com `ilike` em nome, marca, SKU e código de barras (cada palavra), SKU de variação, capa assinada (`produto_capas`), link só para o que `vitrine_publica` devolve |
| Texto | `src/formatar.ts` | Monta a mensagem. Preço único (`preco_varejo` ou preço da variação). Nunca a quantidade |
| Respostas prontas | `src/respostas-db.ts`, `src/respostas.ts` | Lista da conta (`respostas_prontas`, migration 0073, RLS do dono) e dados que preenchem as variáveis: nome do negócio, Pix, endereço e telefone (metadados da conta, lidos com `getUser`) e link da loja só quando `vitrine_publica` devolve a loja. As regras das variáveis, da busca e do atalho vivem em `../src/lib/respostas.ts`, o mesmo arquivo do app |
| Sequências | `src/respostas-db.ts`, `src/painel.ts` (`blocoSequencias`), `../src/lib/sequencias.ts` | `sequencias` e `sequencia_passos` (migration 0076, RLS do dono) chegam junto com as respostas. O roteiro (ordem, variáveis preenchidas, passo vazio fora) e o avanço (uma ação por clique, voltar, pular) vivem no arquivo do app, testados em `teste/sequencias.test.ts` |
| Venda rápida | `src/venda.ts`, `../src/lib/venda-rapida.ts`, rota `../src/app/api/extensao/venda/route.ts` | Formas, canais e clientes da conta (RLS do dono). A venda vai à rota do Marcon com o token do dono (Bearer, conferido no Supabase Auth; CORS só para o ID da extensão), que chama `registrar_venda_unica` (migration 0075) e manda o aviso no celular só quando a venda é nova. Cada tentativa leva uma chave (uuid): repetir a mesma venda (rede caiu, clique de novo) devolve a mesma venda, sem duplicar; mudou qualquer coisa, chave nova. Data no fuso do Brasil, calculada no servidor |
| Painel | `src/painel.ts`, `painel.css` | Tela do dono no padrão de `docs/DESIGN.md`. No painel lateral do navegador ou, sem ele, embutido na aba do WhatsApp |
| Na aba do WhatsApp | `src/conteudo.ts`, `src/inserir.ts` | Coloca o texto na caixa (evento de colar, depois `execCommand insertText`), confere que entrou, avisa claro se o WhatsApp mudou |
| Mídia | `src/midias-db.ts`, `src/anexar.ts`, `src/base64.ts` | Lista da biblioteca (`midias`, migration 0074) e fotos do produto (`produto_fotos`) com URL assinada; baixa só o arquivo que o dono pediu e manda à aba, que abre a prévia de anexo numa tentativa só (foto: colar; PDF: soltar na conversa). Só diz "na prévia" quando a legenda da prévia apareceu; aviso do WhatsApp por cima é recusa. Regras de tipo, tamanho e nome em `../src/lib/midias.ts`, o mesmo arquivo do app |
| Gravador | `src/painel.ts`, `src/microfone.ts` | MediaRecorder em M4A (AAC), até 2 minutos. `microfone.html` abre numa aba para liberar o microfone quando o painel lateral não mostra o pedido |
| Áudio de voz | `src/ogg-opus.ts`, `src/voz.ts`, `src/pagina.ts`, `src/config-wa.ts`, WA-JS (`wa.js`) | O painel converte o áudio (gravado ou da biblioteca) para OGG/Opus mono 48 kHz (WebCodecs + páginas Ogg). A aba pergunta à página o nome da conversa aberta, o painel pede confirmação e só então a página manda UMA mensagem de voz pela WA-JS, se a conversa ainda é a mesma |
| Volta do Google pela aba | `src/retorno.ts` | Plano B do login com Google quando o navegador não tem `chrome.identity.launchWebAuthFlow` |

Permissões (mínimas): `storage`, `sidePanel`, `identity` e acesso só a `https://web.whatsapp.com/*`. Nada de chave de serviço: o banco aplica a mesma RLS do site. A conta (e-mail e Sair) fica na bolinha com a inicial, no rodapé do painel, como no site.

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
node teste/sequencias-staging.ts ../.env.staging    # sequências pela API: A cria e percorre, conta B (criada e apagada aqui) e anon não leem nem mexem, limite de 20 passos
node teste/midias-staging.ts ../.env.staging        # mídia pela API: conta A sobe e baixa, conta B (criada e apagada aqui) e anon não leem nada de A
node teste/servir.mjs                               # simulação em http://127.0.0.1:4317 (caixa e prévia do painel)
```

A simulação (`teste/simulacao.html`) tem uma caixa parecida com a do WhatsApp com quatro modos (editor que trata o colar, caixa simples, sem conversa aberta e layout mudado) e expõe `window.marcon.inserir()`, `window.marcon.inserirTexto(texto)` e `window.marcon.estado()` (inclui quantos envios aconteceram, que tem de ser sempre 0). `painel.html` na mesma porta é a prévia do painel com respostas e sequências falsas; `window.marconUltimo.acoes` lista cada inserir e anexar que o painel pediu (um por clique).

A mesma página simula a prévia de anexo do WhatsApp (por cima da conversa, com Enviar que só o clique envia) em três modos: abre ao colar, só ao soltar, não abre. `window.marcon.anexar(nome, mime, tamanho)` passa pelo mesmo `anexarArquivo` da extensão; `estado()` traz `naPrevia` e `enviosDeArquivo` (sempre 0).

## Áudio de voz (27/11/2026, pedido do dono depois do teste no WhatsApp real)

No teste do dono, o M4A colado e solto foi recusado pelo WhatsApp ("não é compatível"), nos dois caminhos. Áudio agora vai como **mensagem de voz** (PTT), não como arquivo:

1. O painel converte o áudio para OGG/Opus (`src/ogg-opus.ts`: `AudioEncoder` do navegador e páginas Ogg montadas à mão, testadas em `teste/ogg-opus.test.ts` e decodificadas de volta no navegador na simulação).
2. Pergunta à aba qual conversa está aberta e mostra **"Enviar áudio de voz? Para: <nome>"**. Cancelar não manda nada.
3. Só no clique em **Enviar** da confirmação, a página manda UMA mensagem de voz por `WPP.chat.sendFileMessage(..., { type: "audio", isPtt: true, delay: 0 })` (WA-JS), e só se a conversa aberta ainda for a confirmada. Sem fila, sem atraso, sem "gravando..." simulado, sem envio em massa; um segundo clique enquanto o primeiro vai é recusado.

**Riscos que o dono precisa saber:**

- **Usa funções internas do WhatsApp Web** pela biblioteca WA-JS (`@wppconnect/wa-js`, Apache 2.0, a mesma base de várias extensões do mercado). Quando o WhatsApp atualiza, isso pode parar até a WA-JS ser atualizada e um build novo da extensão sair. Sintoma: "O WhatsApp ainda está carregando" ou "não aceitou o envio" sempre. Texto, foto e PDF continuam funcionando (não dependem da WA-JS).
- **Termos do WhatsApp:** mexer nas funções internas do WhatsApp Web não é permitido pelos termos dele. Uso pessoal, um clique por mensagem, tem risco baixo, mas não zero, de o WhatsApp restringir a conta.
- A WA-JS fica carregada na aba do WhatsApp como `window.WPP`: outra extensão instalada no mesmo navegador também conseguiria usá-la. Instale só extensões de confiança.
- Telemetria da WA-JS desligada (`src/config-wa.ts`: sem Google Analytics, sem os servidores de prévia de link de terceiros).
- O painel lê **só o nome da conversa aberta**, para a confirmação. Nenhuma mensagem é lida.

## Mídia: o que o pico técnico mostrou (27/11/2026)

Como pôr um arquivo na conversa sem enviar: o WhatsApp Web abre a **prévia de anexo** quando recebe um arquivo colado (Ctrl+V de um print) ou solto na conversa. A extensão faz o mesmo com evento sintético: `ClipboardEvent("paste")` com um `DataTransfer` que leva o `File`, na caixa de mensagem; se em 2 s a caixa não ficou coberta pela prévia, `dragenter`, `dragover` e `drop` no meio da conversa. Nunca aperta Enter nem clica em Enviar.

Conferido na simulação (Chromium 156): o evento chega à página com o arquivo (nome, tipo e tamanho certos; `isTrusted` falso), a prévia abre nos dois caminhos, o arquivo entra uma vez só, prévia já aberta não recebe outro, e envios = 0. O MediaRecorder grava `audio/mp4` (AAC), não grava OGG; WebM fica de fora porque o WhatsApp manda como documento.

Atualização depois do teste do dono: anexar agora é **uma tentativa por clique** (foto colando, PDF soltando) e só conta como "na prévia" quando a legenda da prévia aparece; o áudio saiu desse caminho (vai como mensagem de voz, acima).

**Só o dono confirma no WhatsApp de verdade** (sem conta de teste do WhatsApp aqui):

1. Se o WhatsApp aceita o colar sintético (`isTrusted` falso) ou só o soltar. Se nenhum abrir a prévia, o painel avisa e oferece **Baixar** para arrastar à mão.
2. Se a prévia aberta cobre a caixa de mensagem (é o sinal de "abriu"). Se não cobrir, a extensão tenta soltar também e o arquivo pode aparecer duas vezes na prévia: tire um antes de enviar.
3. Áudio: conferir que chega como mensagem de voz (bolinha com onda), que toca no celular e que a confirmação mostra o nome certo da conversa.
4. Se o painel embutido (navegador sem painel lateral) consegue usar o microfone dentro do WhatsApp; se não, use **Liberar microfone** ou grave no celular e suba no app.
