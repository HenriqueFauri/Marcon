# Assistente no WhatsApp (teste)

Consulta de estoque, preço e vendas por mensagem. Só leitura. Desligado por padrão.

## Como funciona

1. Em Configurações, o vendedor gera um código (`MARCON-XXXXXX`, vale 15 min, uso único) e manda para o WhatsApp do Marcon.
2. O provedor (Evolution API) chama `POST /api/whatsapp`. A rota valida o segredo, liga o telefone à conta (`whatsapp_vinculos`) e passa a responder as perguntas.
3. A resposta vem do Claude com ferramentas de leitura (`src/lib/whatsapp/ferramentas.ts`). Toda consulta filtra pelo dono da conta, descoberto pelo telefone. O modelo nunca escolhe de quem são os dados.

Só `src/lib/whatsapp/evolution.ts` fala com o provedor. Para trocar pela API oficial da Meta, reescreva `enviarMensagem()` e `extrairMensagem()`.

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `WHATSAPP_ASSISTENTE_ATIVO` | `1` liga tudo. Sem isso o webhook ignora e a tela não aparece |
| `WHATSAPP_EMAILS` | Opcional. E-mails (vírgula) que podem usar. Vazio = qualquer conta |
| `WHATSAPP_NUMERO` | Número do Marcon, só dígitos (ex.: 5551999998888), para o link `wa.me` |
| `WHATSAPP_WEBHOOK_SECRET` | Segredo que a Evolution manda no cabeçalho `x-whatsapp-secret` |
| `WHATSAPP_LIMITE_DIA` | Mensagens por conta por dia (padrão 60) |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | Acesso à Evolution |
| `WHATSAPP_MODELO` | Opcional. Padrão `claude-haiku-5-5` (o mais leve), esforço baixo |
| `ANTHROPIC_API_KEY` | Já usada nos anúncios |

## Webhook da Evolution

```
POST {EVOLUTION_API_URL}/webhook/set/{instancia}   (cabeçalho apikey)
{ "webhook": { "enabled": true, "url": "<URL>/api/whatsapp",
  "headers": { "x-whatsapp-secret": "<WHATSAPP_WEBHOOK_SECRET>" },
  "byEvents": false, "base64": false, "events": ["MESSAGES_UPSERT"] } }
```

Teste local: a Evolution roda no Docker e chama `http://host.docker.internal:3000/api/whatsapp`.

## Limites e segurança

- Número desconhecido recebe no máximo uma orientação por hora.
- Tentativas de código: 10 por hora por número. Evento repetido do provedor é descartado.
- A Evolution usa o WhatsApp Web (não oficial): o número pode ser banido. Serve só para validar.

## Lançar venda (F2)

Desligado por padrão e com chave própria. Variáveis:

| Variável | Para quê |
| --- | --- |
| `WHATSAPP_ESCRITA` | `1` liga o lançamento de venda |
| `WHATSAPP_EMAILS_ESCRITA` | E-mails (vírgula) que podem lançar. Vazio = ninguém |
| `WHATSAPP_LIMITE_VENDAS_DIA` | Vendas lançadas por conta por dia (padrão 30) |

Como funciona:
1. O modelo só chama `preparar_venda`, que valida produto, variação, estoque e preço e grava um rascunho em `whatsapp_acoes`. Quem monta o texto de confirmação é o servidor.
2. Só uma mensagem exatamente `SIM` lança. `NÃO` cancela. O rascunho vale por 10 minutos e há um por número.
3. O lançamento chama `registrar_venda_como` (migration 0040, só `service_role`), que usa a `registrar_venda` do app: estoque, custo, parcelas, caixa e limites do plano valem igual.
4. A execução é reservada de forma atômica (`pendente` para `executando`), então um SIM repetido não lança duas vezes.

Teste do banco: roteiro com rollback (venda de teste, estoque, caixa e permissões), no mesmo padrão de `supabase/tests`.
