// Dev helper: confirms a test user's e-mail directly in the DB so we can
// log in without wiring up real e-mail delivery during local testing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { sslDoBanco } from "./db-ssl.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(path.join(root, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const email = process.argv[2];
if (!email) {
  console.error("uso: node scripts/confirm-test-user.mjs <email>");
  process.exit(1);
}

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: sslDoBanco(root, env),
});
await client.connect();
const res = await client.query(
  `update auth.users set email_confirmed_at = now() where email = $1 returning id`,
  [email],
);
console.log(res.rowCount ? `confirmado: ${res.rows[0].id}` : "usuário não encontrado");
await client.end();
