// Runs every .sql file in supabase/migrations, in filename order, inside one
// transaction each. Reads connection info from .env.local so the DB password
// never has to be typed on the command line or committed anywhere.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const password = env.SUPABASE_DB_PASSWORD;
if (!projectUrl || !password) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_DB_PASSWORD em .env.local");
  process.exit(1);
}
const ref = new URL(projectUrl).hostname.split(".")[0];

const migrationsDir = path.join(root, "..", "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: "postgres",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log(`Conectado a db.${ref}.supabase.co`);

for (const file of files) {
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  console.log(`\n→ aplicando ${file}...`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`  ok`);
  } catch (err) {
    await client.query("rollback");
    console.error(`  falhou: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("\nTodas as migrations aplicadas.");
