// Classifica um diff como ALTO ou BAIXO risco, olhando só os caminhos alterados.
// Uso: node scripts/classificar-risco.mjs [base]   (base padrão: origin/staging)
// Saída: imprime a classificação e os arquivos que a causaram.
// ALTO sempre espera o dono. Nunca vai à produção sozinho. Regras em docs/REVISAO.md.
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const base = process.argv[2] || "origin/staging";

const ALTO = [
  [/^supabase\/migrations\//, "migration (banco)"],
  [/^supabase\/tests\//, "teste de banco"],
  [/^src\/app\/api\/asaas\//, "Asaas (cobrança)"],
  [/^src\/app\/\(app\)\/assinatura\//, "assinatura"],
  [/^src\/app\/\(app\)\/indique\//, "indique e ganhe (comissão)"],
  [/^src\/app\/\(app\)\/admin\//, "admin"],
  [/^src\/app\/api\/(cron|whatsapp)\//, "cron ou WhatsApp"],
  [/^src\/app\/auth\//, "autenticação"],
  [/^src\/app\/(login|redefinir-senha)\//, "autenticação"],
  [/^src\/proxy\.ts$/, "middleware (proxy)"],
  [/^src\/lib\/(asaas|assinatura|planos|cortesia|admin|indicacao|indicacao-servidor|uso)\.ts$/, "dinheiro, plano ou permissão"],
  [/^src\/lib\/supabase\//, "cliente Supabase"],
  [/^src\/lib\/whatsapp\//, "assistente WhatsApp"],
  [/^src\/lib\/push\//, "push"],
  [/^vercel\.json$/, "config da Vercel"],
  [/^\.github\//, "CI"],
  [/^scripts\/(run-migrations|db-ssl)\.mjs$/, "script de banco"],
  [/^package(-lock)?\.json$/, "dependências"],
  [/^\.env/, "variáveis de ambiente"],
];

const arquivos = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const motivos = [];
for (const f of arquivos) {
  for (const [re, motivo] of ALTO) {
    if (re.test(f)) {
      motivos.push(`${f}  (${motivo})`);
      break;
    }
  }
}

const nivel = motivos.length ? "ALTO" : "BAIXO";
const linhas = [`RISCO ${nivel}`, `${arquivos.length} arquivo(s) alterado(s).`];
if (motivos.length) {
  linhas.push("Tocou em área de risco (espera o dono, não vai à produção sozinho):");
  for (const m of motivos) linhas.push(`  - ${m}`);
}
console.log(linhas.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${linhas[0]}\n\n${linhas.slice(1).join("\n")}\n`);
}
