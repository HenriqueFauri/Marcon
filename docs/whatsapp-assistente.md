# Assistente no WhatsApp

O vendedor vincula o número dele à conta e conversa com o WhatsApp do Marcon: consulta estoque, preço, vendas, caixa, contas a receber e pedidos da vitrine, e lança vendas com confirmação. Desligado por padrão e liberado por e-mail.

Decisões de negócio (plano, preço, limites comerciais) ficam no vault, em `negocios/usemarcon/assistente-whatsapp.md`. Este documento é técnico.

## Arquitetura

```
Celular do vendedor ──WhatsApp──> chip do Marcon (Evolution API, Docker no PC)
                                        │ webhook MESSAGES_UPSERT + x-whatsapp-secret
                                        v
                      https://www.usemarcon.com/api/whatsapp (Vercel)
                         │ responde 200 na hora e processa em after()
                         ├─ Supabase (chave de serviço, sempre filtrando pelo dono)
                         ├─ Claude Haiku 5.5 com ferramentas (esforço baixo)
                         └─ envio: https://evo.usemarcon.com/message/sendText/usemarcon
                                   (túnel Cloudflare, só esse caminho) ──> Evolution ──> WhatsApp
```

| Peça | Onde |
| --- | --- |
| Webhook, vínculo, memória, ajuda, limites | `src/app/api/whatsapp/route.ts` |
| Provedor (único ponto que fala com a Evolution) | `src/lib/whatsapp/evolution.ts` |
| Assistente (prompt, laço de ferramentas, calendário) | `src/lib/whatsapp/assistente.ts` |
| Consultas (só leitura) | `src/lib/whatsapp/ferramentas.ts` |
| Rascunho comum a tudo que se lança (tipos, SIM e NÃO, `abrirAcao`) | `src/lib/whatsapp/rascunho.ts` |
| Resolver o SIM ou NÃO e executar o lançamento | `src/lib/whatsapp/acoes.ts` |
| Lançar venda (preparar, executar, aviso) | `src/lib/whatsapp/venda.ts` |
| Lançar produto, estoque e caixa (desligado por padrão) | `src/lib/whatsapp/lancamentos.ts` |
| Código de vínculo | `src/lib/whatsapp/vinculo.ts` |
| Tela | `src/app/(app)/configuracoes/whatsapp-card.tsx` e `whatsapp-actions.ts` |
| Teste de segurança do banco | `supabase/tests/whatsapp.sql` |

Para trocar a Evolution pela API oficial da Meta, reescreva só `enviarMensagem()` e `extrairMensagem()`.

## Fluxos

**Vínculo.** Em Configurações o vendedor gera `MARCON-XXXXXX` (6 caracteres sem 0, 1, I e O, 15 minutos, uso único, um aberto por conta) e manda para o chip. O webhook troca o código pelo vínculo `whatsapp_vinculos` (um número por conta e uma conta por número). Um vínculo novo apaga a memória e cancela rascunhos daquele número, que podiam ser de outra conta.

**Consulta.** Número vinculado e liberado manda texto livre. O modelo escolhe as ferramentas; toda consulta filtra por `owner_id` do dono do vínculo, nunca escolhido pelo modelo.

**Memória.** Últimas 8 mensagens do número, até 6 horas (`whatsapp_conversas`). `limpar` reinicia. Só texto de pergunta e resposta, nunca resultado de consulta.

**Comandos sem IA.** `ajuda` (lista de exemplos) e `limpar`. Não gastam tokens.

**Cota (decisão de 2026-10-08).** 600 perguntas por mês e 40 por dia por conta (`src/lib/whatsapp/uso.ts`). Só pergunta que usa IA conta; `ajuda`, `limpar`, `SIM` e `NÃO` não contam, mas passam por um freio geral de 150 mensagens por dia. O uso fica em `limites_taxa` (chave `wa:uso:<conta>`, uma linha por dia; o mês é a soma). Aviso único ao passar de 80% e mensagem clara no limite.

**Tela.** Configurações mostra só uma linha ("Assistente no WhatsApp", Vinculado ou Ativar). A tela `/configuracoes/whatsapp` tem conexão, uso do mês, exemplos que abrem o WhatsApp com a pergunta pronta, o interruptor "Lançar vendas por aqui" (coluna `whatsapp_vinculos.lancar_venda`, migration 0041; o dono só muda essa coluna), apagar a conversa e desvincular (que também apaga a conversa).

**Lançar venda.**
1. O modelo chama `preparar_venda`, que só valida: produto (nome exato tem prioridade), variação, estoque, preço (o dito ou o cadastrado), desconto, a prazo (exige cliente), forma de pagamento e canal (casados com o cadastro quando existir). Ambíguo, sem estoque ou sem preço: devolve pergunta ou erro e não grava nada.
2. O servidor grava o rascunho em `whatsapp_acoes` e monta o texto de confirmação (o modelo não reescreve valores). Vale 10 minutos, um por número.
3. A rota resolve `SIM` ou `NÃO` antes do modelo, por regex exata (`sim, mas troca o preço` não confirma). A execução é reservada de forma atômica (`pendente` para `executando`), então SIM repetido não lança duas vezes.
4. `registrar_venda_como()` assume a identidade do dono só dentro da transação e chama a `registrar_venda()` do app: estoque, custo, parcelas, caixa e limites do plano valem igual.
5. Sai o mesmo aviso (push) do app, com as preferências do vendedor. Falha no aviso não desfaz a venda.

**Outros lançamentos (base pronta, desligada).** Produto novo, entrada e saída de estoque, entrada e saída de caixa seguem o mesmo molde da venda: `preparar_produto`, `preparar_estoque` e `preparar_caixa` só validam e abrem o rascunho; o SIM é resolvido por `resolverPendente()` em `acoes.ts`, que escolhe o executor pelo `tipo` do rascunho. Cada grupo só existe para o modelo quando está em `WHATSAPP_LANCAMENTOS` e a conta tem escrita liberada; se o grupo for desligado entre o rascunho e o SIM, o SIM não executa.
- Produto: nome e preço obrigatórios; nome igual a um existente é recusado (vira entrada de estoque); estoque inicial entra sem mexer no caixa; categoria só se já existir no cadastro. Insert direto com o dono (o gatilho de limite do plano lê `new.owner_id`).
- Estoque: entrada usa o valor dito ou o custo do cadastro e sai do caixa, a não ser que o vendedor diga que não pagou; saída exige o motivo (perda, uso ou ajuste) e não mexe no caixa. Usam `registrar_entrada_estoque_como()` e `registrar_saida_estoque_como()`.
- Caixa: descrição e valor obrigatórios, categoria padrão "Outros", data até 60 dias atrás. Mesmos campos do lançamento manual do app.
- Limite: 30 lançamentos por dia por conta, somando os três grupos (`WHATSAPP_LIMITE_LANCAMENTOS_DIA`), separado do limite de vendas.
- **Não testado com o WhatsApp de verdade.** As funções do banco foram testadas no Staging (2026-10-11). Antes de ligar: subir a Evolution apontando para o Staging, ligar `WHATSAPP_LANCAMENTOS` lá e passar por cada tipo. Para lançar algo novo: um tipo em `TipoAcao`, um `preparar` que chame `abrirAcao()` e um executor em `EXECUTORES`.

## Ferramentas do modelo

| Ferramenta | Responde |
| --- | --- |
| `buscar_produtos` | Estoque, preço, custo e variações por nome, marca ou SKU |
| `produtos_por_estoque` | Mais estoque, menos estoque, zerados |
| `resumo_do_estoque` | Produtos, unidades, custo parado, zerados |
| `resumo_de_vendas` | Vendas, valor e lucro de um período |
| `produtos_vendidos` | Ranking de produtos vendidos no período |
| `vendas_por_recorte` | Por canal, forma de pagamento ou cliente |
| `contas_a_receber` | Em aberto, atrasado, quem deve, próximas parcelas |
| `caixa_do_periodo` | Entradas, saídas, maiores saídas, saldo hoje |
| `pedidos_da_vitrine` | Pedidos novos, vendidos ou descartados |
| `preparar_venda` | Só para contas com escrita liberada |
| `preparar_produto`, `preparar_estoque`, `preparar_caixa` | Escrita liberada e grupo ligado em `WHATSAPP_LANCAMENTOS` |

Caixa e contas a receber são calculados no servidor porque `saldo_caixa` e `resumo_caixa` usam `auth.uid()`; as regras espelham as telas.

**Confirmação por tipo (migration 0046).** Em Configurações > Assistente no WhatsApp, "Pedir meu SIM antes de lançar" tem um interruptor para venda e para cada grupo de `WHATSAPP_LANCAMENTOS`. O padrão é pedir (coluna `whatsapp_vinculos.sem_confirmar` vazia). Com o tipo desligado, o modelo continua só preparando o rascunho; logo depois, `confirmarSeDispensado()` (`acoes.ts`) chama `resolverPendente()` como se fosse um SIM e responde com os detalhes e o resultado. Todas as travas valem igual (limite do dia, rascunho único, tipo liberado). Só age se a resposta do modelo for exatamente o resumo do rascunho recém-aberto.

**Mensagem de voz.** A Evolution manda `audioMessage`; com `base64: true` no webhook da instância (`POST /webhook/set/usemarcon`, o mesmo que já leva o segredo; recriar a instância apaga isso), o áudio vem no próprio evento (`data.message.base64`), sem abrir mais nenhuma rota no túnel. `extrairMensagem()` devolve `audio`; a rota transcreve (`transcricao.ts`, OpenAI `gpt-4o-mini-transcribe`, trocável por `TRANSCRICAO_MODELO`) só depois do vínculo e da conta liberada, e o resto do fluxo é o do texto. A resposta começa com "🎤 _\"o que entendi\"_", para o vendedor ver se a transcrição errou um número. Por voz o SIM nunca é dispensado (`ctx.porAudio`), mesmo com a confirmação desligada. O SIM ou NÃO falado vale, porque o rascunho aparece escrito. Limite de duração em `WHATSAPP_AUDIO_MAX_SEGUNDOS` (padrão 60). Cada áudio entendido conta como pergunta na cota, como o texto.

**Entender certo com muitos vendedores (migration 0047).** Três peças, nenhuma depende de ajuste por cliente:
- *Busca de produto tolerante a erro.* `buscar_produtos_parecidos()` dá a cada produto ativo do dono uma nota de 0 a 1 (sem acento, sem pontuação, trigramas, palavras em qualquer ordem). `produtos.ts` decide com regra fixa: um vencedor (nota 0,55 ou mais e 0,15 à frente do segundo), vários (pergunta qual) ou nenhum (sugere os de 0,45 ou mais). É o único lugar que escolhe produto, usado por `buscar_produtos`, `preparar_venda` e `preparar_estoque`. Produto achado só por semelhança marca o rascunho com `aproximado`, e aí o SIM nunca é dispensado.
- *Registro do sistema.* A cada pergunta, `carregarFatos()` lê `whatsapp_acoes` das últimas 6 horas e entrega ao modelo o que foi gravado, cancelado ou falhou. O modelo só afirma lançamento que está nesse registro. Sem isso ele desmentia uma venda lançada, porque não distingue o que o servidor gravou do que ele mesmo disse.
- *Confiança da voz.* A transcrição pede `logprobs` (só nos modelos `gpt-4o`; se o provedor recusar, segue sem). Palavra com probabilidade abaixo de 0,5 vai ao modelo como "em dúvida", junto de um aviso de que o texto veio de voz. Áudio com confiança média abaixo de `WHATSAPP_AUDIO_CONFIANCA_MINIMA` (padrão 0,3) nem chega ao modelo: pede para repetir. O log `[whatsapp] voz:` traz modelo, duração e confiança (nunca o texto), para calibrar esses cortes com uso real.
- O vocabulário enviado à transcrição prioriza o que o dono mais vendeu em 90 dias e depois o resto do cadastro (`vocabularioDoDono()`), até 800 caracteres.

**Resolver rápido e objetivo.**
- *Valor da venda.* `preparar_venda` aceita `valor_total_item` ("vendi 2 por 80", sem "cada", é o total) além de `preco_unitario`. Quem divide é o servidor, e só se a conta fechar em centavos; senão pede o valor de cada unidade. O modelo não faz conta de dinheiro.
- *Venda e pergunta na mesma mensagem.* Venda sozinha devolve o resumo sem gastar outra volta. Se há outra pergunta (mais de uma ferramenta, ou "?" na mensagem), o modelo ainda responde a outra parte, e o resumo da venda vem primeiro, intacto.
- *Cache e paralelismo.* As regras e as ferramentas são um bloco fixo com `cache_control`; data, calendário e o registro do sistema vão num bloco separado. A pergunta típica caiu de uns 12 mil para cerca de 1 mil tokens novos. Consultas independentes rodam juntas; só os `preparar_*` (que gravam rascunho) vão em ordem.
- *Dizer sim e não do jeito natural.* `SIM` e `NAO` aceitam "pode", "esquece", "deixa pra lá", "errei"... Já "ok", "isso", "fechou", "beleza" (`SIM_SUAVE`) só confirmam se a ÚLTIMA fala do assistente foi o resumo do rascunho (`acoes.ts`), para um "ok" dito a outra coisa nunca lançar venda. Frase com mais palavras ("sim, foram 3") não confirma nem cancela: vai ao modelo, que prepara outro rascunho.
- *Exemplos no prompt.* `EXEMPLOS_DE_VENDA` em `assistente.ts` traz o jeito solto de falar (número por extenso, "ontem", "pro João", "saiu um", dois itens em uma frase).

**Teste de comportamento (`scripts/eval-assistente.ts`).** É como o assistente é "treinado": um banco de conversas (consulta, venda, voz com ruído, correção no meio, recusa, registro do sistema) que roda o modelo de verdade contra o Staging e confere ferramenta usada, resposta, número de voltas e regras gerais (sem travessão, sem "fiado", sem despejar custo, resposta curta). Só prepara rascunhos e os apaga, nunca manda SIM. Para usar:

```bash
npx --yes tsx --conditions=react-server scripts/eval-assistente.ts [filtro] [--vezes=3]
```

Precisa do `.env.staging` na raiz. Regra de trabalho: todo ajuste de prompt ou de busca só entra se o placar não piorar; todo erro novo visto no WhatsApp vira um caso novo antes de ser corrigido.

## Banco

| Migration | O quê | Acesso |
| --- | --- | --- |
| `0038_whatsapp.sql` | `whatsapp_vinculos`, `whatsapp_codigos` | Dono lê e apaga o vínculo e cria código; vínculo só nasce pelo webhook |
| `0039_whatsapp_conversas.sql` | `whatsapp_conversas` | RLS sem política: só a chave de serviço |
| `0040_whatsapp_vendas.sql` | `whatsapp_acoes` e `registrar_venda_como()` | Tabela sem política; função só para `service_role` |
| `0041_whatsapp_lancar_venda.sql` | `whatsapp_vinculos.lancar_venda` | Dono muda só essa coluna (grant por coluna) |
| `0046_whatsapp_sem_confirmar.sql` | `whatsapp_vinculos.sem_confirmar` (grupos sem SIM) | Dono muda só `lancar_venda` e `sem_confirmar` (grant por coluna) |
| `0047_buscar_produtos_parecidos.sql` | Extensões `pg_trgm` e `unaccent`; `buscar_produtos_parecidos()` | Função só para `service_role` |
| `0044_whatsapp_lancamentos_base.sql` | Tipos novos e `referencia_id` em `whatsapp_acoes`; `registrar_entrada_estoque_como()` e `registrar_saida_estoque_como()` | Funções só para `service_role` |

Retenção (o que a política de privacidade promete), apagada a cada mensagem respondida: conversa 24 horas, código vencido 1 hora depois, `whatsapp_acoes` 90 dias.

As migrations são rastreadas em `public.schema_migrations`. Até a 0041 aplicadas em produção; a 0044 primeiro no Staging (ver `docs/AMBIENTES.md`).

## Variáveis de ambiente (Vercel, Production)

| Variável | Para quê |
| --- | --- |
| `WHATSAPP_ASSISTENTE_ATIVO` | `1` liga. Sem isso o webhook responde 200 e ignora, e o cartão não aparece |
| `WHATSAPP_EMAILS` | Contas que podem usar (vírgula). Vazio = qualquer conta |
| `WHATSAPP_ESCRITA` | `1` liga o lançamento de venda |
| `WHATSAPP_EMAILS_ESCRITA` | Contas que podem lançar. Vazio = ninguém |
| `WHATSAPP_NUMERO` | Número do chip, só dígitos, para o link `wa.me` |
| `WHATSAPP_WEBHOOK_SECRET` | Segredo do cabeçalho `x-whatsapp-secret` |
| `WHATSAPP_COTA_MES` | Perguntas com IA por conta por mês (padrão 600) |
| `WHATSAPP_LIMITE_DIA` | Perguntas com IA por conta por dia (padrão 40) |
| `WHATSAPP_LIMITE_VENDAS_DIA` | Vendas lançadas por conta por dia (padrão 30) |
| `WHATSAPP_LANCAMENTOS` | Grupos de lançamento além da venda, por vírgula: `produto`, `estoque`, `caixa`. Vazio = só venda (como hoje) |
| `WHATSAPP_LIMITE_LANCAMENTOS_DIA` | Lançamentos que não são venda por conta por dia (padrão 30) |
| `WHATSAPP_MODELO` | Opcional. Padrão `claude-haiku-5-5` |
| `TRANSCRICAO_API_KEY` | Chave da OpenAI para transcrever voz. Sem ela o assistente responde "ainda não entendo áudio" |
| `TRANSCRICAO_MODELO` | Opcional. Padrão `gpt-4o-mini-transcribe` (o `gpt-4o-transcribe` erra menos número e nome, custa o dobro) |
| `WHATSAPP_AUDIO_MAX_SEGUNDOS` | Opcional. Duração máxima do áudio (padrão 60) |
| `WHATSAPP_AUDIO_CONFIANCA_MINIMA` | Opcional. Confiança média mínima do áudio, de 0 a 1 (padrão 0,3) |
| `WHATSAPP_ESFORCO` | Opcional. `low` (padrão), `medium` ou `high`: quanto o modelo pensa antes de responder |
| `WHATSAPP_ORIENTAR` | `1` responde número desconhecido (só em chip dedicado) |
| `EVOLUTION_API_URL` | `https://evo.usemarcon.com` |
| `EVOLUTION_API_KEY` | Chave da Evolution |
| `EVOLUTION_INSTANCE` | `usemarcon` |
| `ANTHROPIC_API_KEY` | A mesma dos anúncios |

Variável nova só vale depois de um Redeploy.

## Infraestrutura (hoje no PC)

- **Evolution API 2.3.7** em `Desktop\evolution-local` (`docker-compose.yml` e `.env` com a chave e a senha do Postgres). Porta 8080 só em `127.0.0.1`. Postgres e Redis sem porta exposta. Política `unless-stopped`.
- **Versões testadas:** pareamento por código quebra (`Invalid buffer`) na 2.3.6 e 2.3.7; a 2.2.3 não gera QR; a 2.4.0 exige ativação de licença com e-mail e telefone; a 2.3.2 entrega "Aguardando mensagem". Use a 2.3.7 conectando por **QR**.
- **Túnel Cloudflare** `marcon-evolution` (`%USERPROFILE%\.cloudflared\config.yml`): só `^/message/sendText/usemarcon$` passa; o resto dá 404. Sobe com o login do Windows pela tarefa agendada `Cloudflared Marcon Evolution`, que reinicia sozinha.
- **Domínio** `usemarcon.com` registrado na Hostinger com DNS no Cloudflare; o site aponta para a Vercel com nuvem cinza (DNS only).

## Segurança

| Risco | Proteção |
| --- | --- |
| Alguém forjar mensagens no webhook | Segredo no cabeçalho, comparação em tempo constante |
| Consulta vazar dados de outra conta | Toda consulta com `.eq("owner_id")` explícito (a chave de serviço ignora o RLS) |
| Modelo lançar venda sozinho ou com valor errado | Modelo só prepara; SIM exato resolvido por código; texto montado pelo servidor; rascunho congelado |
| Venda dupla | Reserva atômica do rascunho e descarte de evento repetido |
| Usuário logado chamar a função de venda como outra pessoa | `registrar_venda_como` sem `execute` para `anon` e `authenticated` |
| Memória de uma conta aparecer em outra | Vínculo novo apaga conversa e rascunhos do número |
| Resposta para contato qualquer | Número desconhecido em silêncio; erro só avisa número vinculado |
| Adivinhar código de vínculo | 32^6 combinações, 15 minutos, 10 tentativas por hora por número |
| Abuso e custo | 60 mensagens e 30 vendas por dia por conta; texto cortado em 1.000 caracteres |
| Exposição da Evolution | Túnel só com o caminho de envio; chave de 40 caracteres |
| Injeção de instrução em nome de produto ou cliente | Só leitura da própria conta; escrever exige SIM do dono |

**Riscos que continuam:**
- Quem tiver o `WHATSAPP_WEBHOOK_SECRET` consegue se passar por um número vinculado, inclusive mandar um SIM. Trate como senha; troque ao menor sinal de vazamento.
- A Evolution não é oficial: o número pode ser bloqueado pelo WhatsApp. Para virar produto, a API oficial da Meta.
- Tudo para quando o PC desliga.

## Operação

- **Saúde:** `curl https://evo.usemarcon.com/message/sendText/usemarcon` deve dar 401 (chega na Evolution); 404 em `/` é o esperado.
- **Reconectar o chip:** painel local `http://localhost:8080/manager`, instância `usemarcon`, QR.
- **Recriar a instância apaga o webhook:** configure de novo (`POST /webhook/set/usemarcon`, evento `MESSAGES_UPSERT`, URL `https://www.usemarcon.com/api/whatsapp`, cabeçalho `x-whatsapp-secret`) e confira com `/webhook/find/usemarcon`.
- **Trocar o segredo do webhook:** gere um novo, atualize na Vercel (Redeploy) e no webhook da Evolution.
- **Desligar tudo:** `WHATSAPP_ASSISTENTE_ATIVO` vazio na Vercel e Redeploy. Só a escrita: `WHATSAPP_ESCRITA` vazio.
- **Teste do banco:** rodar `supabase/tests/whatsapp.sql` (desfaz tudo; espera `WHATSAPP OK`).
- **Logs:** Vercel, função `/api/whatsapp`, prefixo `[whatsapp]` (voltas, tokens e tamanho do histórico).
