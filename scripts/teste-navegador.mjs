// Apoio ao agente testador-marcon: conta de teste no Staging e login no navegador SEM a senha passar pelo chat.
//
//   node --env-file=.env.local scripts/teste-navegador.mjs criar
//   node --env-file=.env.local scripts/teste-navegador.mjs entrar     (fica rodando na porta 3998)
//   node --env-file=.env.local scripts/teste-navegador.mjs remover
//
// .env.local da worktree tem de ser cópia do .env.staging (cp, sem abrir). Recusa rodar fora do Staging.
// Credencial vai para um arquivo na pasta temporária do sistema, nunca para a tela.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REF_STAGING = "odgvhqwqyxtnaxgqiynb";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {}
if (host !== `${REF_STAGING}.supabase.co` || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Recusado: o ambiente carregado nao e o Staging (ou falta a chave de servico).");
  process.exit(1);
}
const PREFIXO = "teste.navegador.";
const arquivo = join(tmpdir(), "marcon-conta-teste.json");
const comando = process.argv[2];

function admin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

if (comando === "criar") {
  if (existsSync(arquivo)) {
    console.error("Ja existe uma conta de teste. Rode 'remover' antes.");
    process.exit(1);
  }
  const email = `${PREFIXO}${Date.now()}@usemarcon.com`;
  const senha = `Tn!${randomBytes(10).toString("hex")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  writeFileSync(arquivo, JSON.stringify({ email, senha, id: data.user.id }), { mode: 0o600 });
  console.log(`Conta de teste criada no Staging: ${email} (id ${data.user.id}). Senha guardada so no arquivo temporario.`);
} else if (comando === "entrar") {
  if (!existsSync(arquivo)) {
    console.error("Sem conta de teste. Rode 'criar' antes.");
    process.exit(1);
  }
  // o navegador abre http://127.0.0.1:3998/ e cai em /login com a credencial no fragmento (#),
  // que nao vai ao servidor. Quem preenche os campos e limpa o fragmento e o agente, por javascript_tool.
  const servidor = createServer((q, r) => {
    if (q.headers.host !== "127.0.0.1:3998") {
      r.writeHead(404).end();
      return;
    }
    const c = JSON.parse(readFileSync(arquivo, "utf8"));
    const carga = Buffer.from(JSON.stringify({ email: c.email, pw: c.senha })).toString("base64");
    r.writeHead(302, { Location: `http://localhost:3000/login#${carga}` });
    r.end();
    servidor.close(); // atende uma vez so
  });
  setTimeout(() => process.exit(0), 5 * 60 * 1000).unref();
  servidor.listen(3998, "127.0.0.1", () => console.log("Pronto: navegue para http://127.0.0.1:3998/ (uma vez, vale 5 min)"));
} else if (comando === "remover") {
  if (existsSync(arquivo)) {
    const { id } = JSON.parse(readFileSync(arquivo, "utf8"));
    const sb = admin();
    const { data: u } = await sb.auth.admin.getUserById(id);
    if (u?.user && !u.user.email?.startsWith(PREFIXO)) {
      console.error("Recusado: a conta do arquivo nao e de teste.");
      process.exit(1);
    }
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    rmSync(arquivo);
    console.log("Conta de teste removida do Staging.");
  }
} else {
  console.error("Uso: criar | entrar | remover");
  process.exit(1);
}
