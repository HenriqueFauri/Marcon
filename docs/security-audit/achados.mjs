// Dados da auditoria de segurança do UseMarcon (2026-10-07).
// O gerador (gerar-relatorio.mjs) monta o PDF a partir daqui: para atualizar o relatório,
// edite este arquivo e rode `npm run gerar` nesta pasta.

export const PROJETO = "UseMarcon";
export const DATA = "07/10/2026";
export const COMMIT = "ef1c099 (branch claude/epic-hamilton-638849, base local-work-marcon)";

export const ESCOPO = [
  "Código da aplicação em src/ (Next.js 16, App Router): 17 arquivos de server actions (60 ações exportadas), 6 route handlers, páginas públicas /loja e /r.",
  "29 migrations em supabase/migrations e o estado real do banco de produção (projeto ouvxsfebfegqcvwmdume), lido só com consultas de leitura: políticas RLS, views, funções SECURITY DEFINER, gatilhos, FKs, CHECKs, privilégios e Storage.",
  "Scripts em scripts/, README.md, vercel.json, next.config.ts, .gitignore e o histórico git completo (155 commits).",
  "Fora do escopo: painel da Vercel, painel do Asaas, configuração de Auth no painel do Supabase e testes dinâmicos contra produção (nada foi escrito no banco).",
];

export const STACK = [
  ["Linguagem", "TypeScript (Node 24), SQL/PLpgSQL"],
  ["Framework", "Next.js 16.3 com App Router, Server Actions e proxy.ts (antigo middleware)"],
  ["Banco e acesso", "Supabase Postgres via @supabase/supabase-js e @supabase/ssr (PostgREST). Sem ORM."],
  ["Autenticação", "Supabase Auth (e-mail e Google), sessão em cookie; admin por lista ADMIN_EMAILS no servidor"],
  ["Isolamento", "RLS por owner_id = auth.uid() em todas as tabelas; funções RPC com filtro manual; cliente service role em pontos específicos"],
  ["Armazenamento", "Supabase Storage, 3 buckets privados com política por pasta do usuário"],
  ["Frontend", "React 19 + Tailwind 4, PWA com push (web-push)"],
  ["Deploy", "Vercel (vercel.json com cron). Sem Docker, Helm, Terraform ou CI no repositório"],
  ["Integrações", "Asaas (cobrança, webhook), Anthropic (IA de anúncios), Google Analytics, Microsoft Clarity"],
];

export const CATEGORIAS = [
  {
    id: 1,
    nome: "Banco sem tranca",
    curto: "Isolamento",
    mapeamento:
      "Mecanismo do projeto: RLS do Postgres com owner_id = auth.uid(). Conferido em produção: RLS ligado e políticas em cada tabela, views com security_invoker, funções SECURITY DEFINER (que ignoram RLS) e os pontos onde o servidor usa a chave de serviço. Também as FKs, porque a checagem de FK ignora RLS.",
  },
  {
    id: 2,
    nome: "Permissão definida no navegador",
    curto: "Permissão",
    mapeamento:
      "Cruzamento de cada gate de interface (menu Admin, recursos do plano pago, cota de IA) com a checagem no servidor ou no banco. Inclui limites de plano cuja contagem depende de dados que o próprio usuário pode alterar pela API REST, o que equivale a confiar no cliente.",
  },
  {
    id: 3,
    nome: "IDOR",
    curto: "IDOR",
    mapeamento:
      "Todas as server actions exportadas (60 funções em 17 arquivos 'use server') e os 6 route handlers, um por um: de onde vem cada ID, qual cliente Supabase é usado (sessão com RLS ou service role) e se a posse do objeto e dos objetos relacionados é conferida.",
  },
  {
    id: 4,
    nome: "Chaves expostas",
    curto: "Segredos",
    mapeamento:
      "Busca por padrões de chave (Anthropic, Supabase JWT, Asaas, AWS, chaves privadas, senhas, defaults ${VAR:-x}) no código, scripts, docs e no histórico git inteiro; variáveis NEXT_PUBLIC_ que entram no bundle; componentes 'use client' que importem módulos com segredo.",
  },
  {
    id: 5,
    nome: "Inputs sem tratamento (XSS)",
    curto: "XSS",
    mapeamento:
      "Busca por dangerouslySetInnerHTML, innerHTML, eval, new Function, srcdoc, window.open e href/src montados com dado do usuário; renderização de markdown/HTML (não há lib); dados do lojista exibidos na loja e no recibo públicos; CHECKs do banco que repetem a validação do formulário.",
  },
];

// severidade: critica | alta | media | baixa | info
export const ACHADOS = [
  {
    id: "A1",
    cat: 1,
    sev: "alta",
    titulo: "Tabelas filhas aceitam produto de outro dono e a loja pública mostra essas linhas",
    arquivos: [
      {
        ref: "supabase/migrations/0001_fase1_produtos_estoque_caixa.sql:96-97",
        codigo: 'create policy "produto_variacoes_insert_own" on produto_variacoes\n  for insert with check (owner_id = auth.uid());',
      },
      {
        ref: "supabase/migrations/0001_fase1_produtos_estoque_caixa.sql:122-123",
        codigo: 'create policy "produto_fotos_insert_own" on produto_fotos\n  for insert with check (owner_id = auth.uid());',
      },
      {
        ref: "supabase/migrations/0026_vitrine_extras.sql:71 e 75 (vitrine_publica, SECURITY DEFINER, em produção)",
        codigo: "from produto_variacoes v where v.produto_id = p.id\n...\nfrom produto_fotos f where f.produto_id = p.id",
      },
      {
        ref: "supabase/migrations/0011_limite_de_fotos.sql:6-14 (limitar_fotos_produto)",
        codigo: "select count(*) from produto_fotos\nwhere produto_id = new.produto_id\n  and variacao_id is not distinct from new.variacao_id\n) >= 10 then raise exception 'Limite de 10 fotos atingido.';",
      },
    ],
    descricao:
      "As políticas de INSERT/UPDATE conferem só o owner_id da linha nova, nunca se o produto_id pertence ao mesmo dono. As FKs são de coluna única e a checagem de FK ignora RLS, então qualquer conta logada grava em produto_variacoes ou produto_fotos uma linha sua apontando para o produto de outra pessoa. A função vitrine_publica roda como dono do banco e junta variações e fotos só por produto_id.",
    exploracao:
      "Conta grátis basta. O atacante pega o id do produto no HTML de /loja/<slug> ou no link ?p=<id>, e com a anon key (pública no bundle) e o próprio JWT faz POST em /rest/v1/produto_variacoes com nome e preco_venda escolhidos, ou em /rest/v1/produto_fotos com uma imagem da própria pasta. A variação falsa (ex.: preço R$ 1,00) e a foto aparecem na loja da vítima, que não vê nada no app porque o RLS esconde linhas de outro dono. Inserindo 10 fotos, o gatilho de limite passa a recusar fotos novas da própria vítima naquele produto.",
    condicao: "A loja da vítima precisa estar no ar (vitrine ativa e plano pago ou teste de 14 dias).",
    impacto: "Fraude de preço e conteúdo ofensivo na loja de terceiros, dano de reputação, bloqueio do envio de fotos.",
  },
  {
    id: "A2",
    cat: 3,
    sev: "media",
    titulo: "registrarFoto grava foto em qualquer produto_id e com qualquer path",
    arquivos: [
      {
        ref: "src/app/(app)/produtos/actions.ts:494-513",
        codigo:
          "export async function registrarFoto(produtoId: string, path: string, ordem: number, variacaoId: string | null = null) {\n  ...\n  const { error } = await supabase.from(\"produto_fotos\").insert({\n    owner_id: user.id,\n    produto_id: produtoId,\n    variacao_id: variacaoId,\n    path,\n    ordem,\n  });",
      },
      {
        ref: "src/app/(app)/produtos/actions.ts:396-397 (criarVariacao, para comparação)",
        codigo: 'const { data: produto } = await supabase.from("produtos").select(...).eq("id", produtoId).maybeSingle();\nif (!produto) return { ok: false, error: "Produto não encontrado." };',
      },
    ],
    descricao:
      "Server action é rota pública com POST. registrarFoto recebe produtoId e path do cliente e insere sem conferir que o produto é do usuário (criarVariacao confere) nem que o path está na pasta dele. É o caminho pela própria aplicação do problema A1, sem nem precisar da API REST.",
    exploracao: "Chamar a action com o id de produto de outra loja e um path qualquer. Mesmo efeito do A1 na loja pública e alimenta o A4 (path de outra pessoa).",
    condicao: "Usuário logado.",
    impacto: "Mesmo do A1 e do A4.",
  },
  {
    id: "A3",
    cat: 2,
    sev: "alta",
    titulo: "Cota de IA e limite de vendas do plano contados em linhas que o usuário apaga ou edita",
    arquivos: [
      {
        ref: "supabase/migrations/0017_ia_anuncios_e_recibo.sql:29-33",
        codigo:
          'create policy "ia_geracoes_update_own" on ia_geracoes\n  for update using (owner_id = auth.uid());\n-- apagar só para devolver a cota quando a geração falha\ncreate policy "ia_geracoes_delete_own" on ia_geracoes\n  for delete using (owner_id = auth.uid());',
      },
      {
        ref: "função ia_do_mes (produção), usada pelo gatilho aplicar_limites_ia",
        codigo: "select count(*)::integer from ia_geracoes\nwhere owner_id = p_owner\n  and created_at >= (date_trunc('month', ...))",
      },
      {
        ref: "supabase/migrations/0003_clientes_vendas_parcelas.sql:63-64 + vendas_do_mes",
        codigo: 'create policy "vendas_update_own" on vendas\n  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());\n-- conferido: authenticated tem UPDATE na coluna created_at e DELETE na tabela',
      },
      {
        ref: "src/app/(app)/anuncios/actions.ts:120",
        codigo: 'await supabase.from("ia_geracoes").delete().eq("id", registro.id);',
      },
    ],
    descricao:
      "O limite mensal de IA (10 no grátis, 30 no pago) é count(*) em ia_geracoes, e o dono tem DELETE e UPDATE (inclusive em created_at) nessa tabela. O limite de 30 vendas por mês do plano grátis é count(*) em vendas por created_at, coluna que o dono também pode alterar.",
    exploracao:
      "Depois de cada geração, DELETE em /rest/v1/ia_geracoes?id=eq.<id> (ou PATCH created_at para o mês passado) devolve a cota. Em script, gera anúncios sem teto, cada um uma chamada paga à API da Anthropic na conta do UseMarcon. No grátis, PATCH em vendas.created_at libera vendas acima de 30 no mês.",
    condicao: "Usuário logado; para a IA, ANTHROPIC_API_KEY configurada no servidor.",
    impacto: "Custo direto e sem teto na API da Anthropic; o limite do plano grátis deixa de valer, reduzindo o motivo para assinar.",
  },
  {
    id: "A4",
    cat: 1,
    sev: "media",
    titulo: "A chave de serviço assina arquivos do Storage cujo caminho o usuário escolhe",
    arquivos: [
      {
        ref: "src/lib/vitrine-servidor.ts:26-28, 31-32 e 36-38",
        codigo:
          'const paths = [...new Set(bruta.produtos.flatMap((p) => p.fotos.map((f) => f.path)))];\nawait admin.storage.from("produto-fotos").createSignedUrls(paths, 3600);\nawait admin.storage.from("logo-empresa").createSignedUrl(bruta.loja.logo_path, 3600);\nawait admin.storage.from("vitrine-banner").createSignedUrls(bannerBruto.paths, 3600)',
      },
      {
        ref: "src/app/r/[token]/page.tsx:33-36 e src/app/r/[token]/pdf/route.ts:47",
        codigo: 'await admin.storage.from("logo-empresa").createSignedUrl(empresa.logo_path, 3600)',
      },
      {
        ref: "src/app/(app)/configuracoes/actions.ts:58-66",
        codigo: "export async function atualizarLogoEmpresa(path: string | null) {\n  ...\n  await supabase.auth.updateUser({ data: { empresa_logo_path: path } });",
      },
      {
        ref: "src/app/(app)/vitrine/actions.ts:113 (validação só na action)",
        codigo: 'if (!path.startsWith(`${user.id}/`) || path.includes("..")) return { ok: false, error: "Imagem inválida." };',
      },
    ],
    descricao:
      "Os buckets são privados e a política de Storage limita cada usuário à própria pasta. Mas a loja e o recibo assinam, com a service role (que ignora essa política), caminhos vindos de produto_fotos.path (sem CHECK), vitrines.banner_paths (o CHECK só limita a 3 itens) e user_metadata.empresa_logo_path (o próprio usuário edita com auth.updateUser, direto do navegador). A checagem de pasta de adicionarImagemBanner é contornada com PATCH direto em /rest/v1/vitrines.",
    exploracao:
      "Quem conhece o caminho de um arquivo privado de outra conta grava esse caminho na própria loja ou no próprio logo e recebe um link assinado válido por 1 hora, renovável. Os nomes têm Date.now() em milissegundos, então não dá para adivinhar no escuro, mas os caminhos aparecem nas URLs assinadas sempre que a imagem foi pública. Ex.: o vendedor tira um produto da vitrine e as fotos continuam acessíveis para quem guardou o caminho.",
    condicao: "Conhecer o caminho exato do arquivo; para a vitrine, loja própria ativa (o recibo não exige plano).",
    impacto: "Leitura de imagens privadas de outras contas e 'despublicar' que não revoga o acesso.",
  },
  {
    id: "A5",
    cat: 1,
    sev: "baixa",
    titulo: "Métricas da vitrine podem ser infladas por qualquer pessoa, sem limite",
    arquivos: [
      {
        ref: "supabase/migrations/0028_vitrine_cupons_metricas.sql:87-117",
        codigo: "create or replace function registrar_evento_vitrine(p_slug text, p_tipo text, p_produto uuid default null) ... security definer\n...\ngrant execute on function registrar_evento_vitrine(text, text, uuid) to anon, authenticated;",
      },
      {
        ref: "src/app/loja/[slug]/actions.ts:27-35",
        codigo: 'await supabase.rpc("registrar_evento_vitrine", { p_slug: s, p_tipo: tipo, p_produto: produtoId ?? null });',
      },
    ],
    descricao: "A função é pública por desenho (a loja abre sem login), mas não há limite por IP, sessão ou janela de tempo.",
    exploracao: "Um laço chamando /rest/v1/rpc/registrar_evento_vitrine com o slug de qualquer loja soma visitas, pedidos e aberturas de produto à vontade.",
    condicao: "Nenhuma: anon key pública.",
    impacto: "Números de visitas e pedidos na página Vitrine deixam de ser confiáveis; crescimento de tabela.",
  },
  {
    id: "A6",
    cat: 4,
    sev: "baixa",
    titulo: "Scripts conectam como postgres sem verificar o certificado TLS",
    arquivos: [
      { ref: "scripts/run-migrations.mjs:32-38", codigo: 'user: "postgres",\npassword,\ndatabase: "postgres",\nssl: { rejectUnauthorized: false },' },
      { ref: "scripts/confirm-test-user.mjs:25-31", codigo: 'user: "postgres",\npassword: env.SUPABASE_DB_PASSWORD,\nssl: { rejectUnauthorized: false },' },
    ],
    descricao: "A senha do superusuário vem do .env.local (correto, nada hardcoded), mas a conexão aceita qualquer certificado.",
    exploracao: "Quem estiver no meio da rede (Wi-Fi público, proxy) intercepta a conexão e captura a senha do postgres.",
    condicao: "Rodar os scripts numa rede hostil.",
    impacto: "Acesso total ao banco de produção.",
  },
  {
    id: "A7",
    cat: 1,
    sev: "info",
    titulo: "13 funções SECURITY DEFINER executáveis por anon (correção já em PR)",
    arquivos: [
      {
        ref: "produção: proacl de ajustar_estoque, cancelar_venda, excluir_produto, pagar_parcela, registrar_entrada/saida_estoque, registrar_venda, uso_do_plano, aplicar_limites_*",
        codigo: "{=X/postgres,...,anon=X/postgres,authenticated=X/postgres,...}",
      },
      { ref: "supabase/migrations/0029_revogar_execute_anon.sql", codigo: "revoke execute on function ... from public, anon;" },
    ],
    descricao: "Lidas uma a uma: todas barram uid nulo, explicitamente ou porque filtram owner_id = auth.uid(). Não há vazamento hoje; é defesa em profundidade.",
    exploracao: "Nenhuma conhecida. A migration 0029 (PR HenriqueFauri/Marcon#61) revoga, aguardando aplicação em produção.",
    condicao: "-",
    impacto: "Superfície de ataque maior que o necessário.",
  },
  {
    id: "A8",
    cat: 4,
    sev: "info",
    titulo: "CRON_SECRET comparado sem tempo constante",
    arquivos: [{ ref: "src/app/api/cron/cobrancas/route.ts:8", codigo: 'if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {' }],
    descricao: "O webhook do Asaas usa timingSafeEqual; o cron usa !==.",
    exploracao: "Ataque de tempo pela internet é impraticável aqui; registro por consistência.",
    condicao: "-",
    impacto: "Mínimo.",
  },
  {
    id: "A9",
    cat: 4,
    sev: "info",
    titulo: "Cliente service role sem a guarda server-only",
    arquivos: [{ ref: "src/lib/supabase/admin.ts:1-10", codigo: 'import { createClient } from "@supabase/supabase-js";\n// ... Nunca importar em código de cliente.\nexport function createAdminClient() {' }],
    descricao: "Conferido: nenhum componente 'use client' importa o módulo hoje, e a chave não tem prefixo NEXT_PUBLIC_, então não iria para o bundle. A regra está só num comentário.",
    exploracao: "Nenhuma hoje.",
    condicao: "-",
    impacto: "Proteção contra regressão futura.",
  },
  {
    id: "A10",
    cat: 5,
    sev: "info",
    titulo: "Sem Content-Security-Policy nem cabeçalhos de segurança",
    arquivos: [{ ref: "next.config.ts:3-8", codigo: "const nextConfig: NextConfig = {\n  async redirects() { ... },\n};" }],
    descricao: "Nenhum XSS foi encontrado, mas não há CSP, X-Frame-Options/frame-ancestors nem Referrer-Policy que limitem o dano se um aparecer.",
    exploracao: "Nenhuma direta.",
    condicao: "-",
    impacto: "Defesa em profundidade e proteção contra clickjacking no app logado.",
  },
  {
    id: "A11",
    cat: 1,
    sev: "info",
    titulo: "Validação de cupom sem limite de tentativas",
    arquivos: [
      { ref: "supabase/migrations/0028_vitrine_cupons_metricas.sql:39 e 56-57", codigo: "create or replace function validar_cupom_vitrine(p_slug text, p_codigo text) returns jsonb\n...\ngrant execute on function validar_cupom_vitrine(text, text) to anon, authenticated;" },
    ],
    descricao: "Qualquer pessoa testa códigos à vontade. Cupons são feitos para circular, mas um cupom 'secreto' (ex.: para um influenciador) pode ser descoberto por força bruta se for curto.",
    exploracao: "Laço de tentativas em /rest/v1/rpc/validar_cupom_vitrine.",
    condicao: "Cupom curto ou previsível.",
    impacto: "Desconto usado por quem não deveria.",
  },
];

// O que foi verificado e está correto
export const PONTOS_FORTES = [
  { cat: 1, texto: "RLS ligado em 100% das 30 tabelas do schema public, com políticas owner_id = auth.uid() e WITH CHECK nos UPDATEs (conferido em produção, não só nas migrations)." },
  { cat: 1, texto: "As duas views (produtos_com_estoque, parcelas_com_status) têm security_invoker=true: respeitam o RLS de quem consulta." },
  { cat: 1, texto: "Buckets logo-empresa, produto-fotos e vitrine-banner privados, com política por pasta (storage.foldername(name))[1] = auth.uid()." },
  { cat: 1, texto: "Funções públicas (vitrine_publica, vitrine_banner, validar_cupom_vitrine) só respondem para loja ativa e plano pago/teste e não expõem custo, estoque exato nem dados de cliente; recibo_publico exige token UUID aleatório (gen_random_uuid) e devolve só campos do recibo." },
  { cat: 1, texto: "Tabelas financeiras sensíveis (assinaturas, comissoes, saques, indicacoes, asaas_eventos) só têm SELECT do dono ou nenhuma política: escrita só pela service role ou por função definer (pedir_saque confere uid e saldo com lock)." },
  { cat: 2, texto: "Admin decidido no servidor por ADMIN_EMAILS + e-mail confirmado, nunca por user_metadata (src/lib/admin.ts:13-17). O menu esconde o link (layout.tsx:24) e o backend repete a checagem em /admin (page.tsx:49), /admin/indicacoes (page.tsx:28) e em todas as ações (admin/actions.ts:18 e 97)." },
  { cat: 2, texto: "Recursos do plano pago (importar histórico, fotos extras, vitrine, banner, cupons) barrados no banco por gatilho ou na função pública, não só na interface." },
  { cat: 3, texto: "Todas as server actions usam o cliente da sessão: update/delete por id passam pelo RLS (clientes, fornecedores, lançamentos, cupons, variações, fotos, anúncios, canais, formas de pagamento)." },
  { cat: 3, texto: "As RPCs de escrita (registrar_venda, cancelar_venda, pagar_parcela, estoque, excluir_produto, novo_link_recibo, salvar_anuncio_versao) filtram owner_id = auth.uid() em toda leitura e escrita." },
  { cat: 3, texto: "Usos da service role têm escopo fixo: assinatura sempre .eq('owner_id', user.id); /indique só consulta ids que o RLS já devolveu; webhook e cron não recebem ids de usuário." },
  { cat: 3, texto: "Webhook do Asaas exige token com timingSafeEqual e é idempotente; cron fechado sem CRON_SECRET; callback de auth só redireciona para caminho interno (bloqueia // e prefixa a origem)." },
  { cat: 4, texto: "Nenhum segredo no código, scripts, README ou nos 155 commits do histórico; .env* no .gitignore; scripts leem a senha do .env.local." },
  { cat: 4, texto: "Só vão para o bundle variáveis públicas por natureza (URL e anon key do Supabase, chave pública VAPID, ids de GA e Clarity). Nenhum componente 'use client' importa módulo com segredo. Sem defaults ${VAR:-x} nem arquivos de Docker/CI." },
  { cat: 5, texto: "Único dangerouslySetInnerHTML é um script estático de tema (layout.tsx:37-41). Ids de GA e Clarity validados por regex antes de entrar no script (analytics.tsx:8-9)." },
  { cat: 5, texto: "Sem renderizador de markdown/HTML; todo texto do lojista e do cliente passa pelo escape do React; o PDF do recibo usa texto do pdf-lib." },
  { cat: 5, texto: "Links com dado do usuário têm prefixo fixo (https://wa.me/, https://instagram.com/) e o banco repete a validação com CHECK (whatsapp só dígitos, instagram [A-Za-z0-9._], cor #RRGGBB, slug)." },
];

export const PONTOS_FRACOS = [
  "O RLS protege a linha, mas não a relação: nenhuma política nem FK garante que o produto_id de uma linha filha é do mesmo dono, e funções SECURITY DEFINER públicas confiam nessa relação (A1, A2).",
  "Limites que custam dinheiro (IA) e que sustentam o plano pago (vendas/mês) são contados em tabelas que o próprio usuário apaga e edita (A3).",
  "A service role assina caminhos de arquivo que vêm de colunas e metadados editáveis pelo usuário, sem conferir a pasta do dono (A4). Validações feitas só na server action são contornadas pela API REST.",
  "Endpoints públicos sem limite de taxa (métricas e cupons) e pequenos endurecimentos pendentes (A5 a A11).",
];

export const RECOMENDACOES = [
  { p: "P1", titulo: "Amarrar produto_id ao dono no banco", texto: "Políticas WITH CHECK (ou gatilho) que exigem o produto do mesmo owner_id em produto_variacoes, produto_fotos, produto_anuncios e ia_geracoes; filtrar v.owner_id/f.owner_id = p.owner_id em vitrine_publica; checar posse em registrarFoto; limpar linhas cruzadas existentes. (A1, A2)" },
  { p: "P1", titulo: "Tirar do usuário o controle da contagem dos limites", texto: "Remover DELETE/UPDATE de ia_geracoes para authenticated (devolução de cota por função definer ou pela service role) e impedir alteração de vendas.created_at. (A3)" },
  { p: "P2", titulo: "Conferir a pasta antes de assinar", texto: "CHECK de prefixo owner_id/ em produto_fotos.path e vitrines.banner_paths; as funções públicas só devolvem logo_path dentro da pasta do dono; validação de path em atualizarLogoEmpresa e registrarFoto. (A4)" },
  { p: "P2", titulo: "Aplicar a migration 0029", texto: "Revoga execute de anon nas 13 funções SECURITY DEFINER (PR HenriqueFauri/Marcon#61). (A7)" },
  { p: "P3", titulo: "Limite de taxa nos endpoints públicos", texto: "Limite por IP/sessão em registrar_evento_vitrine e validar_cupom_vitrine. (A5, A11)" },
  { p: "P4", titulo: "Endurecimento", texto: "TLS verificado nos scripts, comparação em tempo constante no cron, import 'server-only' no cliente admin, CSP e cabeçalhos de segurança. (A6, A8, A9, A10)" },
];

export const ISSUES = [
  {
    titulo: "[Segurança] Outra conta consegue injetar variações e fotos na loja pública de um vendedor",
    labels: ["security", "alta"],
    achados: ["A1", "A2"],
    problema:
      "As políticas RLS de `produto_variacoes` e `produto_fotos` conferem só `owner_id = auth.uid()` da linha nova. Não conferem se o `produto_id` pertence ao mesmo dono, e a FK (coluna única) ignora RLS. A função pública `vitrine_publica` (SECURITY DEFINER) junta variações e fotos só por `produto_id`. A server action `registrarFoto` também insere sem conferir posse.\n\nQualquer conta logada (grátis serve) pega o id de um produto no HTML de `/loja/<slug>`, chama `POST /rest/v1/produto_variacoes` com a anon key e o próprio JWT, e a variação aparece na loja da vítima com nome e preço escolhidos pelo atacante. O mesmo vale para fotos. Com 10 fotos inseridas, o gatilho `limitar_fotos_produto` passa a recusar fotos da própria vítima.",
    evidencia: [
      "`supabase/migrations/0001_fase1_produtos_estoque_caixa.sql:96-97` e `:122-123`\n```sql\ncreate policy \"produto_variacoes_insert_own\" on produto_variacoes\n  for insert with check (owner_id = auth.uid());\ncreate policy \"produto_fotos_insert_own\" on produto_fotos\n  for insert with check (owner_id = auth.uid());\n```",
      "`supabase/migrations/0026_vitrine_extras.sql:71` e `:75` (vitrine_publica)\n```sql\nfrom produto_variacoes v where v.produto_id = p.id\nfrom produto_fotos f where f.produto_id = p.id\n```",
      "`src/app/(app)/produtos/actions.ts:494-513`\n```ts\nconst { error } = await supabase.from(\"produto_fotos\").insert({\n  owner_id: user.id, produto_id: produtoId, variacao_id: variacaoId, path, ordem,\n});\n```",
      "`supabase/migrations/0011_limite_de_fotos.sql:6-14`: o limite de 10 conta fotos por `produto_id`, de qualquer dono.",
    ],
    impacto: "Fraude de preço e conteúdo ofensivo na loja de terceiros, dano de reputação para o vendedor e para o UseMarcon, bloqueio do envio de fotos.",
    correcao:
      "1. Migration nova trocando os WITH CHECK de INSERT e UPDATE em `produto_variacoes`, `produto_fotos`, `produto_anuncios` e `ia_geracoes` para:\n   ```sql\n   with check (\n     owner_id = auth.uid()\n     and exists (select 1 from produtos p where p.id = produto_id and p.owner_id = auth.uid())\n   )\n   ```\n   (ou um gatilho BEFORE INSERT OR UPDATE que compare `owner_id` com o dono do produto, o que também cobre a service role).\n2. Em `vitrine_publica`, filtrar `v.owner_id = p.owner_id` e `f.owner_id = p.owner_id`.\n3. Em `limitar_fotos_produto` e `aplicar_limites_foto`, contar só fotos com `owner_id = new.owner_id`.\n4. Em `registrarFoto`, buscar o produto com o cliente da sessão antes de inserir (como `criarVariacao` já faz).\n5. Limpar o que já existir:\n   ```sql\n   select 'variacao', v.id from produto_variacoes v join produtos p on p.id = v.produto_id where v.owner_id <> p.owner_id\n   union all\n   select 'foto', f.id from produto_fotos f join produtos p on p.id = f.produto_id where f.owner_id <> p.owner_id;\n   ```",
    aceite: [
      "Com o JWT da conta B, `POST /rest/v1/produto_variacoes` com `produto_id` de um produto da conta A é recusado (erro de RLS).",
      "O mesmo para `produto_fotos`, `produto_anuncios` e `ia_geracoes`.",
      "`registrarFoto` com produto de outra conta devolve \"Produto não encontrado.\".",
      "`vitrine_publica` não devolve variação nem foto cujo `owner_id` é diferente do dono do produto.",
      "A consulta de limpeza devolve zero linhas em produção depois da migration.",
      "Cadastro de variação e envio de foto continuam funcionando para o próprio dono.",
    ],
  },
  {
    titulo: "[Segurança] Cota de IA e limite de vendas do plano podem ser zerados pelo próprio usuário",
    labels: ["security", "alta"],
    achados: ["A3"],
    problema:
      "O limite mensal de escritas com IA é `count(*)` em `ia_geracoes` (função `ia_do_mes`), e o dono tem políticas de DELETE e UPDATE nessa tabela, além de privilégio de UPDATE em `created_at`. Basta apagar a linha (ou mudar a data) depois de cada geração para a cota voltar. Cada geração é uma chamada paga à API da Anthropic.\n\nO limite de 30 vendas/mês do plano grátis é `count(*)` em `vendas` por `created_at`, coluna que o dono também pode alterar via `PATCH /rest/v1/vendas`.",
    evidencia: [
      "`supabase/migrations/0017_ia_anuncios_e_recibo.sql:29-33`\n```sql\ncreate policy \"ia_geracoes_update_own\" on ia_geracoes\n  for update using (owner_id = auth.uid());\ncreate policy \"ia_geracoes_delete_own\" on ia_geracoes\n  for delete using (owner_id = auth.uid());\n```",
      "Função `ia_do_mes` (produção): `select count(*)::integer from ia_geracoes where owner_id = p_owner and created_at >= ...`",
      "`supabase/migrations/0003_clientes_vendas_parcelas.sql:63-64`: `vendas_update_own` sem restrição de coluna; `has_column_privilege('authenticated','public.vendas','created_at','UPDATE')` = true.",
      "`src/app/(app)/anuncios/actions.ts:120`: o app apaga a linha para devolver a cota quando a IA falha, motivo da política de DELETE.",
    ],
    impacto: "Custo sem teto na conta da Anthropic do UseMarcon; o limite do plano grátis deixa de valer.",
    correcao:
      "1. `drop policy \"ia_geracoes_delete_own\"` e `drop policy \"ia_geracoes_update_own\"`.\n2. Devolver a cota de outro jeito: função `devolver_cota_ia(p_id uuid)` SECURITY DEFINER que só apaga linha do próprio usuário criada há menos de 2 minutos e ainda sem tokens registrados; gravar os tokens com a service role ou por outra função definer.\n3. Em `vendas` (e `ia_geracoes`), impedir mudança de `created_at`: gatilho BEFORE UPDATE com `new.created_at := old.created_at`, ou `revoke update (created_at)` de authenticated.\n4. Avaliar contar o uso mensal numa tabela de contadores só gravável por função definer, para que apagar vendas também não libere cota.",
    aceite: [
      "Com o JWT do usuário, `DELETE /rest/v1/ia_geracoes?id=eq.<id>` não apaga nada (0 linhas).",
      "`PATCH` em `created_at` de `ia_geracoes` e de `vendas` não muda o valor.",
      "Quando a chamada à IA falha, a cota continua sendo devolvida (teste com chave inválida).",
      "Depois de 10 gerações no plano grátis, a 11ª é recusada mesmo após tentativas de apagar ou editar linhas.",
    ],
  },
  {
    titulo: "[Segurança] Chave de serviço assina arquivos do Storage fora da pasta do dono",
    labels: ["security", "média"],
    achados: ["A4"],
    problema:
      "A loja (`buscarVitrine`) e o recibo (`/r/[token]` e o PDF) assinam com a service role caminhos vindos de `produto_fotos.path`, `vitrines.banner_paths` e `user_metadata.empresa_logo_path`. Os três são editáveis pelo usuário (os metadados pelo próprio `auth.updateUser` no navegador), e nada confere que o caminho começa com o id do dono. A checagem de pasta em `adicionarImagemBanner` existe só na server action e é contornada com `PATCH /rest/v1/vitrines`.\n\nQuem conhece o caminho de um arquivo privado de outra conta (por exemplo, de uma foto que já foi pública e saiu da vitrine) consegue um link assinado novo sempre que quiser.",
    evidencia: [
      "`src/lib/vitrine-servidor.ts:26-28, 31-32, 36-38`\n```ts\nawait admin.storage.from(\"produto-fotos\").createSignedUrls(paths, 3600);\nawait admin.storage.from(\"logo-empresa\").createSignedUrl(bruta.loja.logo_path, 3600);\nawait admin.storage.from(\"vitrine-banner\").createSignedUrls(bannerBruto.paths, 3600)\n```",
      "`src/app/r/[token]/page.tsx:33-36` e `src/app/r/[token]/pdf/route.ts:47`: mesmo padrão com o logo.",
      "`src/app/(app)/configuracoes/actions.ts:66`: `updateUser({ data: { empresa_logo_path: path } })` sem validar o path.",
      "`src/app/(app)/vitrine/actions.ts:113`: `` path.startsWith(`${user.id}/`) `` só na action. No banco, `vitrines_banner_paths_check` só limita a 3 itens.",
    ],
    impacto: "Leitura de imagens privadas de outras contas; tirar um produto da vitrine não revoga o acesso a quem guardou o caminho.",
    correcao:
      "1. CHECK em `produto_fotos`: `path like owner_id::text || '/%' and path not like '%..%'`.\n2. CHECK (ou gatilho) em `vitrines`: todo item de `banner_paths` começa com `owner_id::text || '/'`.\n3. Em `vitrine_publica` e `recibo_publico`, devolver `logo_path` só se `starts_with(logo_path, owner_id::text || '/')`. Melhor ainda: mover o logo de `user_metadata` para uma coluna de tabela com CHECK.\n4. Validar o prefixo também em `atualizarLogoEmpresa` e `registrarFoto`.\n5. Rodar uma consulta para achar caminhos atuais fora da pasta do dono.",
    aceite: [
      "Inserir em `produto_fotos` um path de outra pasta é recusado pelo banco.",
      "`PATCH /rest/v1/vitrines` com `banner_paths` de outra pasta é recusado.",
      "Logo apontado (via `auth.updateUser`) para arquivo de outra conta não aparece no recibo nem na loja.",
      "Envio de fotos, banner e logo continua funcionando para o dono.",
    ],
  },
  {
    titulo: "[Segurança] Métricas da vitrine e validação de cupom sem limite de taxa",
    labels: ["security", "baixa"],
    achados: ["A5", "A11"],
    problema:
      "`registrar_evento_vitrine` e `validar_cupom_vitrine` são públicas por desenho, mas não têm limite de chamadas. Qualquer pessoa infla visitas, pedidos e aberturas de produto de qualquer loja, e testa códigos de cupom por força bruta.",
    evidencia: [
      "`supabase/migrations/0028_vitrine_cupons_metricas.sql:87-117` (registrar_evento_vitrine, grant para anon na linha 117)",
      "`supabase/migrations/0028_vitrine_cupons_metricas.sql:39` e `:56-57` (validar_cupom_vitrine, grant para anon)",
      "`src/app/loja/[slug]/actions.ts:11-35`: as actions só validam formato.",
    ],
    impacto: "Métricas não confiáveis na página Vitrine; cupom restrito descoberto e usado por terceiros.",
    correcao:
      "1. Revogar execute de anon nas duas funções e chamá-las só pelas server actions (que rodam no servidor).\n2. Nas actions, limitar por IP (cabeçalho `x-forwarded-for` da Vercel) e por slug numa janela curta, com tabela de contagem ou KV.\n3. Contar visita no máximo uma vez por visitante por dia (cookie anônimo).\n4. Orientar no app que cupom restrito tenha 8 caracteres ou mais.",
    aceite: [
      "Chamada direta a `/rest/v1/rpc/registrar_evento_vitrine` com a anon key é recusada.",
      "100 chamadas seguidas da mesma origem à action contam no máximo o limite definido.",
      "Validação de cupom bloqueia temporariamente após N tentativas erradas por IP.",
    ],
  },
  {
    titulo: "[Segurança] Endurecimento: TLS nos scripts, comparação do CRON_SECRET, server-only e CSP",
    labels: ["security", "baixa"],
    achados: ["A6", "A8", "A9", "A10"],
    problema:
      "Pequenos ajustes de defesa em profundidade, agrupados para não gerar várias issues:\n- Os scripts de banco conectam como `postgres` com `ssl: { rejectUnauthorized: false }`: numa rede hostil a senha do superusuário pode ser capturada.\n- O cron compara o segredo com `!==` (o webhook já usa `timingSafeEqual`).\n- O cliente service role não importa `server-only`; a regra está só num comentário.\n- Não há CSP nem cabeçalhos como `frame-ancestors`/`X-Frame-Options` e `Referrer-Policy`.",
    evidencia: [
      "`scripts/run-migrations.mjs:38` e `scripts/confirm-test-user.mjs:31`: `ssl: { rejectUnauthorized: false }`",
      "`src/app/api/cron/cobrancas/route.ts:8`: `` request.headers.get(\"authorization\") !== `Bearer ${segredo}` ``",
      "`src/lib/supabase/admin.ts:1-10`: sem `import \"server-only\"`",
      "`next.config.ts:3-8`: só `redirects()`, sem `headers()`",
    ],
    impacto: "Baixo hoje; reduz o dano de erros futuros e o risco de vazar a senha do banco.",
    correcao:
      "1. Nos scripts, usar `ssl: { rejectUnauthorized: true, ca: <certificado do Supabase> }` ou a connection string do pooler com `sslmode=verify-full`.\n2. No cron, comparar com `timingSafeEqual`, igual ao webhook.\n3. Adicionar o pacote `server-only` e `import \"server-only\"` em `src/lib/supabase/admin.ts`, `src/lib/asaas.ts` e `src/lib/ia-anuncio.ts`.\n4. Em `next.config.ts`, `headers()` com `Content-Security-Policy` (scripts próprios, GA, Clarity; `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin` e `X-Content-Type-Options: nosniff`. Começar em `Content-Security-Policy-Report-Only`.",
    aceite: [
      "Scripts falham ao conectar se o certificado não for o do Supabase.",
      "Cron usa comparação em tempo constante.",
      "Importar `@/lib/supabase/admin` num componente `'use client'` quebra o build.",
      "Resposta das páginas traz CSP (report-only no primeiro deploy) sem quebrar GA, Clarity e a loja.",
    ],
  },
];
