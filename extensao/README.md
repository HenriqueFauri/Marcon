# Extensão do Marcon para o WhatsApp Web

Painel ao lado do WhatsApp Web que busca os produtos do Marcon e coloca na caixa de mensagem um texto pronto (nome, preço, "Disponível" ou "Sob consulta" e o link da vitrine quando ele vale). **Quem envia é sempre o dono**, com o clique dele: a extensão nunca envia, nunca lê nem guarda conversas, sem resposta automática, disparo ou agendamento.

Na aba **Respostas** ficam as respostas prontas que o dono cria no app (Configurações, Respostas prontas), com as variáveis já preenchidas.

Decisão e regras de negócio: vault, `negocios/usemarcon/extensao-whatsapp.md`. Partes 1 (produtos) e 2 (respostas prontas) de 5.

## Como funciona

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Service worker | `src/sw.ts` | Sessão própria em `chrome.storage.local` (supabase-js, chave anon, PKCE), login por e-mail e senha e Google, renovação, sair (só na extensão), busca e entrega do texto à aba do WhatsApp |
| Busca | `src/busca.ts` | `produtos` com `ilike` em nome, marca, SKU e código de barras (cada palavra), SKU de variação, capa assinada (`produto_capas`), link só para o que `vitrine_publica` devolve |
| Texto | `src/formatar.ts` | Monta a mensagem. Preço único (`preco_varejo` ou preço da variação). Nunca a quantidade |
| Respostas prontas | `src/respostas-db.ts`, `src/respostas.ts` | Lista da conta (`respostas_prontas`, migration 0073, RLS do dono) e dados que preenchem as variáveis: nome do negócio, Pix, endereço e telefone (metadados da conta, lidos com `getUser`) e link da loja só quando `vitrine_publica` devolve a loja. As regras das variáveis, da busca e do atalho vivem em `../src/lib/respostas.ts`, o mesmo arquivo do app |
| Painel | `src/painel.ts`, `painel.css` | Tela do dono no padrão de `docs/DESIGN.md`. No painel lateral do navegador ou, sem ele, embutido na aba do WhatsApp |
| Na aba do WhatsApp | `src/conteudo.ts`, `src/inserir.ts` | Coloca o texto na caixa (evento de colar, depois `execCommand insertText`), confere que entrou, avisa claro se o WhatsApp mudou |
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
npm test                                            # formatador e variáveis das respostas (unitário)
npm run typecheck
node teste/busca-staging.ts ../.env.staging         # login, renovação, busca e sair no Staging, conta de teste
node teste/respostas-staging.ts ../.env.staging     # cria, carrega, preenche, reordena e apaga uma resposta no Staging
node teste/servir.mjs                               # simulação em http://127.0.0.1:4317 (caixa e prévia do painel)
```

A simulação (`teste/simulacao.html`) tem uma caixa parecida com a do WhatsApp com quatro modos (editor que trata o colar, caixa simples, sem conversa aberta e layout mudado) e expõe `window.marcon.inserir()`, `window.marcon.inserirTexto(texto)` e `window.marcon.estado()` (inclui quantos envios aconteceram, que tem de ser sempre 0). `painel.html` na mesma porta é a prévia do painel com respostas falsas.
