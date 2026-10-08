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
| Lançar venda (rascunho, SIM ou NÃO, aviso) | `src/lib/whatsapp/venda.ts` |
| Código de vínculo | `src/lib/whatsapp/vinculo.ts` |
| Tela | `src/app/(app)/configuracoes/whatsapp-card.tsx` e `whatsapp-actions.ts` |
| Teste de segurança do banco | `supabase/tests/whatsapp.sql` |

Para trocar a Evolution pela API oficial da Meta, reescreva só `enviarMensagem()` e `extrairMensagem()`.

## Fluxos

**Vínculo.** Em Configurações o vendedor gera `MARCON-XXXXXX` (6 caracteres sem 0, 1, I e O, 15 minutos, uso único, um aberto por conta) e manda para o chip. O webhook troca o código pelo vínculo `whatsapp_vinculos` (um número por conta e uma conta por número). Um vínculo novo apaga a memória e cancela rascunhos daquele número, que podiam ser de outra conta.

**Consulta.** Número vinculado e liberado manda texto livre. O modelo escolhe as ferramentas; toda consulta filtra por `owner_id` do dono do vínculo, nunca escolhido pelo modelo.

**Memória.** Últimas 8 mensagens do número, até 6 horas (`whatsapp_conversas`). `limpar` reinicia. Só texto de pergunta e resposta, nunca resultado de consulta.

**Comandos sem IA.** `ajuda` (lista de exemplos) e `limpar`. Não gastam tokens.

**Lançar venda.**
1. O modelo chama `preparar_venda`, que só valida: produto (nome exato tem prioridade), variação, estoque, preço (o dito ou o cadastrado), desconto, a prazo (exige cliente), forma de pagamento e canal (casados com o cadastro quando existir). Ambíguo, sem estoque ou sem preço: devolve pergunta ou erro e não grava nada.
2. O servidor grava o rascunho em `whatsapp_acoes` e monta o texto de confirmação (o modelo não reescreve valores). Vale 10 minutos, um por número.
3. A rota resolve `SIM` ou `NÃO` antes do modelo, por regex exata (`sim, mas troca o preço` não confirma). A execução é reservada de forma atômica (`pendente` para `executando`), então SIM repetido não lança duas vezes.
4. `registrar_venda_como()` assume a identidade do dono só dentro da transação e chama a `registrar_venda()` do app: estoque, custo, parcelas, caixa e limites do plano valem igual.
5. Sai o mesmo aviso (push) do app, com as preferências do vendedor. Falha no aviso não desfaz a venda.

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

Caixa e contas a receber são calculados no servidor porque `saldo_caixa` e `resumo_caixa` usam `auth.uid()`; as regras espelham as telas.

## Banco

| Migration | O quê | Acesso |
| --- | --- | --- |
| `0038_whatsapp.sql` | `whatsapp_vinculos`, `whatsapp_codigos` | Dono lê e apaga o vínculo e cria código; vínculo só nasce pelo webhook |
| `0039_whatsapp_conversas.sql` | `whatsapp_conversas` | RLS sem política: só a chave de serviço |
| `0040_whatsapp_vendas.sql` | `whatsapp_acoes` e `registrar_venda_como()` | Tabela sem política; função só para `service_role` |

Retenção (o que a política de privacidade promete), apagada a cada mensagem respondida: conversa 24 horas, código vencido 1 hora depois, `whatsapp_acoes` 90 dias.

As migrations são rastreadas em `public.schema_migrations`. Todas já aplicadas em produção.

## Variáveis de ambiente (Vercel, Production)

| Variável | Para quê |
| --- | --- |
| `WHATSAPP_ASSISTENTE_ATIVO` | `1` liga. Sem isso o webhook responde 200 e ignora, e o cartão não aparece |
| `WHATSAPP_EMAILS` | Contas que podem usar (vírgula). Vazio = qualquer conta |
| `WHATSAPP_ESCRITA` | `1` liga o lançamento de venda |
| `WHATSAPP_EMAILS_ESCRITA` | Contas que podem lançar. Vazio = ninguém |
| `WHATSAPP_NUMERO` | Número do chip, só dígitos, para o link `wa.me` |
| `WHATSAPP_WEBHOOK_SECRET` | Segredo do cabeçalho `x-whatsapp-secret` |
| `WHATSAPP_LIMITE_DIA` | Mensagens por conta por dia (padrão 60) |
| `WHATSAPP_LIMITE_VENDAS_DIA` | Vendas lançadas por conta por dia (padrão 30) |
| `WHATSAPP_MODELO` | Opcional. Padrão `claude-haiku-5-5` |
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
