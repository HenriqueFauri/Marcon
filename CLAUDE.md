@AGENTS.md

# Marcon: contexto e decisões

Gestão de vendas, estoque e caixa para lojas pequenas, como PWA. Next.js 16 (App Router, Server Actions), Supabase (Postgres, Auth, Storage, RLS por `owner_id`) e Tailwind 4. O `README.md` explica como rodar e o detalhe técnico de cada área; este arquivo guarda **o porquê** e as regras que não dá para deduzir do código.

O dono (Henrique Fauri) fala português e o app é todo em português. Textos de interface, mensagens de erro do banco e commits seguem em português.

## Produto e posicionamento

- O dono usava o VendaMax e parou: sistema poluído, bugs, pouca praticidade para cadastrar produto e vender no dia a dia, e informações do produto misturadas com a gestão (o que atrapalha fazer anúncios). O VendaMax também tem estoque, a prazo e parcelas: **o diferencial é UI/UX e facilidade de uso**, não uma lista de funções a mais.
- Ideias de diferencial em estudo: "cadastrou, está pronto para anunciar" (anúncios por canal com fotos), galeria de fotos e títulos/descrições integrados, e **importar tudo de outro sistema** (o VendaMax não exporta planilha, só relatórios em PDF).
- Nunca usar a palavra **"fiado"** na interface nem no marketing. Usar "a prazo" e "parcelado".
- Divulgação: prova social em grupos de networking de vendedores (foto da entrega + print da notificação de venda) e conversa individual com influenciadores do nicho. O VendaMax paga 20% de comissão a quem indica.

## Planos e cobrança

- **Um plano pago só**, "Marcon": R$ 15,90 por mês, **só cartão**, cobrado pelo Asaas. Pix foi considerado e descartado. Textos e preço em `src/lib/planos.ts`.
- **Teste de 14 dias** desde a criação da conta, sem cartão. Depois, quem não assina cai no plano grátis.
- O Asaas é a fonte da verdade da assinatura; a tabela `assinaturas` só espelha, atualizada pelo webhook (`/api/asaas/webhook`).
- Os limites existem por **espaço no banco**: não adianta 500 usuários no grátis ocuparem o espaço que o assinante vai precisar. Anúncios por canal e lembrete de cobrança ficam nos **dois** planos, para o lojista criar o hábito e crescer com o Marcon.

| | Teste e Marcon | Grátis |
| --- | --- | --- |
| Vendas por mês | sem limite | 30 |
| Produtos | sem limite | 50 |
| Fotos por produto e por variação | 10 | 3 |
| Importar vendas e extrato de caixa | sim | não (produtos sim) |

- Plano pago = assinatura `ativa` ou `atrasada`. `pendente` e `cancelada` voltam ao grátis.
- Os limites são **impostos pelo banco** (gatilhos `BEFORE INSERT`), não só pela tela. A fonte única dos números é a função SQL `limites_do_plano`; `planos.ts` só tem os textos. **Ao mudar um limite, mude nos dois lugares.**
- **Nada é apagado nem escondido** ao cair no grátis: os gatilhos só barram registros novos. Vendas contam pelo mês em que foram **registradas** (fuso de Brasília), não pela data digitada; cancelar não devolve a cota.
- Descartado: limite de histórico de 3 meses no grátis. Ainda em aberto: teto de espaço total por conta.

## Regras de segurança e operação

- **Nunca** pedir nem receber no chat chave do Asaas, service role do Supabase ou token de webhook, e nunca imprimir esses valores. Segredos ficam em `.env.local` (fora do git) e nas variáveis da Vercel.
- No `.env.local`, a chave do Asaas precisa do `$` escapado (`\$aact_...`), porque o Next expande `$` ao ler o arquivo. Na Vercel vai sem a barra.
- Nenhum dado de cartão passa pelo Marcon: o pagamento abre em outra aba, na página do Asaas. O redirecionamento de volta não funcionou, então a tela consulta o estado a cada 3 s (até 5 min) até o webhook confirmar.
- A rota `/api/asaas/webhook` e as rotas de cron ficam fora do middleware (`src/proxy.ts`). O webhook confere o token e ignora evento repetido.
- Produção do Asaas ainda **não** está ligada (`ASAAS_ENV=sandbox`). Antes de cobrar de verdade: chave de produção, `ASAAS_ENV=producao`, webhook novo com token novo e rotacionar o token antigo do sandbox.
- **Forma jurídica em aberto:** MEI não pode licenciar software; avaliar PF ou outra empresa com contador. Não afirmar a forma jurídica em textos.
- Hospedagem hoje nos planos grátis da Vercel e do Supabase. Vercel Hobby é só uso não comercial e o Supabase grátis pausa em 7 dias sem uso e não faz backup: **migrar para planos pagos antes de cobrar clientes reais**. Enquanto isso, um cron diário mantém o projeto ativo.

## Banco de dados

- Migrations em `supabase/migrations`, aplicadas em ordem por `node scripts/run-migrations.mjs` (registra em `public.schema_migrations`). Estado do banco do dono: 0001 a 0013 aplicadas; **0014 e 0015 pendentes** até rodar o script.
- Toda tabela tem `owner_id` e RLS. Operação em mais de uma tabela é função SQL, tudo ou nada. Excluir cadastro nunca apaga histórico financeiro (referência vira `NULL`, nome fica como snapshot).
- Funções de plano: `plano_do_usuario(uuid)` (sem permissão para as APIs), `limites_do_plano(text)`, `uso_do_plano()` (usa `auth.uid()`).
- Se uma migration depende de outra, ela verifica no começo e falha com mensagem clara (ex.: 0013 exige 0012; 0015 exige 0012).
- Como testar SQL sem sujar o banco: aplicar dentro de uma transação, simular o usuário com `set_config('request.jwt.claim.sub', ...)` e terminar em `ROLLBACK`.

## Fotos

- Compressão no navegador antes do envio (`src/lib/imagem.ts`: lado maior 2048 px, JPEG 0,85; HEIC sem suporte devolve o original). O bucket `produto-fotos` só aceita JPEG, PNG e WebP até 4 MB.
- Limite por produto **e** por variação (cada variação tem cota própria). O banco confere o limite do plano e que a variação da foto pertence ao produto. Ao excluir variação ou produto, os arquivos saem do armazenamento.
- No anúncio entram todas as fotos: as do produto primeiro, depois as das variações.

## Importação (`/importar`)

- **Sem IA, por regras:** IA custa caro e os relatórios têm estrutura previsível. PDF do VendaMax é lido com `unpdf` (texto com posição, colunas por proximidade dos títulos) e conferido com os totais do próprio relatório. Planilha é lida no navegador (CSV e `.xlsx` com `fflate`); o usuário diz se cada linha é venda ou produto e o que é cada coluna.
- Duas etapas: ler e mostrar prévia editável; gravar só depois da confirmação. Gravação por funções SQL, tudo ou nada, em lotes de 500.
- **Não duplica:** produto de mesmo nome é pulado; vendas e lançamentos têm `importado_ref` único por dono, com prefixo da origem (`vendamax:`, `planilha:`).
- Vendas importadas são **histórico**: não mexem no estoque e entram no caixa na data da venda. Do extrato do VendaMax entram só compras de estoque e despesas (as linhas "Venda:" duplicariam o caixa).
- Limitações conhecidas: produto com variações vem do VendaMax só como faixa (entra sem variações, com custo médio); venda a prazo do VendaMax não traz parcelas (não entra por padrão); planilha sem coluna de estoque cria produtos com estoque zero.
- Plano: grátis importa só produtos (até o limite de 50); vendas e caixa pedem o plano Marcon, na tela e no banco.
- Contas a receber do VendaMax ainda não têm importador (falta um PDF de exemplo).

## Vendas

- A variação é escolhida na venda (produtos agrupados, com botões de variação), em vez de uma linha por variação.

## Testes e desenvolvimento

- Interface: páginas temporárias em `/login/teste-*` (o middleware libera `/login*`) para ver telas sem entrar; conferir também em 375 px. **Apagar antes de commitar.**
- Se o servidor de desenvolvimento mostrar código antigo, o service worker (`public/sw.js`) é o suspeito: desregistrar e limpar caches; em `localhost` ele não faz cache. Se o `.next/dev` corromper, apagar a pasta e reiniciar.
- Antes de fechar uma entrega: `npx tsc --noEmit`, `npm run lint` e `npm run build`.
- Ao rodar comandos no Windows, preferir as ferramentas de edição a heredoc/`sed` para textos com acento, aspas ou barras.

## Como trabalhar aqui

- O dono decide junto, aos poucos ("vamos decidindo conforme necessário"). Entregar em PRs pequenos e empilhados, dizer a ordem de merge e o que rodar depois (migrations).
- Explicar em português simples, sem jargão, e dizer honestamente o que não foi testado.
- Antes de propor novas funções, lembrar que o diferencial é simplicidade: não poluir a interface.

## Pendências

- Produção do Asaas e forma jurídica da cobrança (acima).
- Migrar hospedagem para planos pagos antes de cobrar.
- Importador de contas a receber do VendaMax.
- Mostrar a foto da variação no seletor de venda.
- Teto de espaço por conta contra abuso de fotos.
- Galeria de fotos e títulos/descrições integrados (dor relatada por vendedores).
