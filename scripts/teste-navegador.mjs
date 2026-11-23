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
if (!url.includes(REF_STAGING)) {
  console.error("Recusado: o ambiente carregado nao e o Staging.");
  process.exit(1);
}
const arquivo = join(tmpdir(), "marcon-conta-teste.json");
const comando = process.argv[2];

function admin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

if (comando === "criar") {
  const email = `teste.navegador.${Date.now()}@usemarcon.com`;
  const senha = `Tn!${randomBytes(10).toString("hex")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  writeFileSync(arquivo, JSON.stringify({ email, senha, id: data.user.id }));
  console.log(`Conta de teste criada no Staging: ${email} (id ${data.user.id}). Senha guardada so no arquivo temporario.`);
} else if (comando === "entrar") {
  if (!existsSync(arquivo)) {
    console.error("Sem conta de teste. Rode 'criar' antes.");
    process.exit(1);
  }
  // o navegador abre http://127.0.0.1:3998/ e cai em /login com a credencial no fragmento (#),
  // que nao vai ao servidor. A pagina preenche os campos e limpa o fragmento (ver docs/REVISAO.md).
  createServer((_q, r) => {
    const c = JSON.parse(readFileSync(arquivo, "utf8"));
    const carga = Buffer.from(JSON.stringify({ email: c.email, pw: c.senha })).toString("base64");
    r.writeHead(302, { Location: `http://localhost:3000/login#${carga}` });
    r.end();
  }).listen(3998, "127.0.0.1", () => console.log("Pronto: navegue para http://127.0.0.1:3998/"));
} else if (comando === "remover") {
  if (existsSync(arquivo)) {
    const { id } = JSON.parse(readFileSync(arquivo, "utf8"));
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error) console.error(error.message);
    rmSync(arquivo);
    console.log("Conta de teste removida do Staging.");
  }
} else {
  console.error("Uso: criar | entrar | remover");
  process.exit(1);
}
