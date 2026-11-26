// Build da extensão. Uso:
//   node build.mjs --amb staging  [--env ../.env.staging]   -> dist/staging
//   node build.mjs --amb producao [--env ../.env.local]     -> dist/producao
//   node build.mjs --simulacao                              -> teste/dist (página de simulação)
// Do arquivo de ambiente só saem NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (dado
// público, o mesmo que o site entrega ao navegador). Nada é impresso. O ref do projeto é conferido
// para nunca misturar Staging e produção.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--simulacao")) {
  const saida = join(aqui, "teste", "dist");
  rmSync(saida, { recursive: true, force: true });
  await build({
    entryPoints: {
      simulacao: join(aqui, "teste", "simulacao.ts"),
      "chrome-falso": join(aqui, "teste", "chrome-falso.ts"),
      painel: join(aqui, "src", "painel.ts"),
    },
    bundle: true,
    format: "iife",
    target: "chrome120",
    outdir: saida,
    // a prévia do painel nunca fala com servidor: valores vazios
    define: { __AMBIENTE__: '"staging"', __SUPABASE_URL__: '""', __SUPABASE_ANON__: '""', __BASE_LOJA__: '"https://marcon-staging.vercel.app"' },
  });
  cpSync(join(aqui, "teste", "simulacao.html"), join(saida, "index.html"));
  cpSync(join(aqui, "src", "painel.css"), join(saida, "painel.css"));
  cpSync(join(aqui, "icones"), join(saida, "icones"), { recursive: true });
  writeFileSync(
    join(saida, "painel.html"),
    readFileSync(join(aqui, "src", "painel.html"), "utf8").replace('<script src="painel.js">', '<script src="chrome-falso.js"></script>\n    <script src="painel.js">'),
  );
  console.log(`Simulação pronta em ${saida}`);
  process.exit(0);
}

const AMBIENTES = {
  staging: { ref: "odgvhqwqyxtnaxgqiynb", env: "../.env.staging", base: "https://marcon-staging.vercel.app", nome: "Marcon (Staging)" },
  producao: { ref: "ouvxsfebfegqcvwmdume", env: "../.env.local", base: "https://www.usemarcon.com", nome: "Marcon" },
};

const amb = arg("amb");
const cfg = AMBIENTES[amb];
if (!cfg) {
  console.error("Use --amb staging ou --amb producao.");
  process.exit(1);
}

const arquivoEnv = resolve(aqui, arg("env") ?? cfg.env);
if (!existsSync(arquivoEnv)) {
  console.error(`Arquivo de ambiente não encontrado: ${arquivoEnv}. Passe --env <caminho>.`);
  process.exit(1);
}
const valores = {};
for (const linha of readFileSync(arquivoEnv, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=(.*)$/);
  if (m) valores[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const url = valores.NEXT_PUBLIC_SUPABASE_URL;
const anon = valores.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("O arquivo de ambiente não tem NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (url.replace(/\/+$/, "") !== `https://${cfg.ref}.supabase.co`) {
  console.error(`O arquivo de ambiente não é do ${amb} (ref esperado ${cfg.ref}). Nada foi gerado.`);
  process.exit(1);
}
// A chave anon é um JWT com role "anon" (ou sb_publishable_). Chave de serviço nunca entra.
if (anon.startsWith("sb_secret_")) throw new Error("Chave secreta recusada.");
if (anon.split(".").length === 3) {
  const corpo = JSON.parse(Buffer.from(anon.split(".")[1], "base64url").toString("utf8"));
  if (corpo.role !== "anon") throw new Error("A chave do arquivo não é a anon. Nada foi gerado.");
}

const { key } = JSON.parse(readFileSync(join(aqui, "chave.json"), "utf8"));
const { version } = JSON.parse(readFileSync(join(aqui, "package.json"), "utf8"));
const saida = join(aqui, "dist", amb);
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

const define = {
  __AMBIENTE__: JSON.stringify(amb),
  __SUPABASE_URL__: JSON.stringify(url.replace(/\/+$/, "")),
  __SUPABASE_ANON__: JSON.stringify(anon),
  __BASE_LOJA__: JSON.stringify(cfg.base),
};

await build({
  entryPoints: { sw: join(aqui, "src", "sw.ts") },
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
  legalComments: "none",
  outdir: saida,
  define,
});
await build({
  entryPoints: {
    painel: join(aqui, "src", "painel.ts"),
    conteudo: join(aqui, "src", "conteudo.ts"),
    retorno: join(aqui, "src", "retorno.ts"),
  },
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
  legalComments: "none",
  outdir: saida,
  define,
});
for (const f of ["painel.html", "painel.css", "retorno.html"]) cpSync(join(aqui, "src", f), join(saida, f));
cpSync(join(aqui, "icones"), join(saida, "icones"), { recursive: true });

const icones = { 16: "icones/icone-16.png", 32: "icones/icone-32.png", 48: "icones/icone-48.png", 128: "icones/icone-128.png" };
const manifesto = {
  manifest_version: 3,
  name: cfg.nome,
  version,
  description: "Busca produtos do Marcon e coloca o texto pronto na conversa do WhatsApp Web. Quem envia é você.",
  key, // ID fixo: o mesmo em todo computador, para a URL de retorno do login não mudar
  icons: icones,
  action: { default_title: cfg.nome, default_icon: icones },
  background: { service_worker: "sw.js", type: "module" },
  side_panel: { default_path: "painel.html" },
  // storage: sessão própria. sidePanel: painel ao lado. identity: login com Google.
  permissions: ["storage", "sidePanel", "identity"],
  // Só o WhatsApp Web: achar a aba para entregar o texto. Nenhum outro site.
  host_permissions: ["https://web.whatsapp.com/*"],
  content_scripts: [{ matches: ["https://web.whatsapp.com/*"], js: ["conteudo.js"], run_at: "document_idle" }],
  web_accessible_resources: [
    // painel embutido, só para o navegador sem painel lateral
    // (só a página: o que ela carrega vem da própria extensão e não precisa ficar exposto)
    { resources: ["painel.html"], matches: ["https://web.whatsapp.com/*"] },
    // volta do login com Google pela aba (plano B)
    { resources: ["retorno.html"], matches: [`${define.__SUPABASE_URL__.slice(1, -1)}/*`, "https://accounts.google.com/*"] },
  ],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};
writeFileSync(join(saida, "manifest.json"), JSON.stringify(manifesto, null, 2));
console.log(`Extensão ${amb} pronta em ${saida}`);
