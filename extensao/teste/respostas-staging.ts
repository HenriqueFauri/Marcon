// Respostas prontas contra o STAGING com a conta de teste do seed (scripts/seed-staging.mjs).
// Uso (na pasta extensao): node teste/respostas-staging.ts <caminho do .env.staging>
// Cria uma resposta como o app cria (mesma RLS), carrega como a extensão carrega, confere as
// variáveis e apaga o que criou. Não imprime e-mail, senha nem chave. Recusa rodar fora do Staging.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { carregarRespostas } from "../src/respostas-db.ts";
import { filtrarRespostas, preencherVariaveis } from "../src/respostas.ts";

const REF_STAGING = "odgvhqwqyxtnaxgqiynb";
const arquivo = process.argv[2];
if (!arquivo) throw new Error("Passe o caminho do .env.staging.");
const env: Record<string, string> = {};
for (const l of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
  const m = l.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|STAGING_TESTE_EMAIL|STAGING_TESTE_SENHA)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${REF_STAGING}.supabase.co`) throw new Error("Não é o Staging. Parei.");

const memoria = new Map<string, string>();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    flowType: "pkce",
    storage: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => void memoria.set(k, v), removeItem: (k) => void memoria.delete(k) },
  },
});
const BASE = "https://marcon-staging.vercel.app";
let falhas = 0;
const criadas: string[] = [];
async function caso(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASSOU  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU  ${nome}: ${(e as Error).message}`);
  }
}

await caso("sem login pede para entrar", async () => {
  const r = await carregarRespostas(db, BASE);
  assert.equal(r.ok, false);
});

await caso("anon não lê respostas_prontas", async () => {
  const { data, error } = await db.from("respostas_prontas").select("id").limit(1);
  assert.ok(error || (data ?? []).length === 0);
});

await caso("login", async () => {
  const { error } = await db.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA });
  assert.equal(error, null);
});

const marca = `teste${Date.now().toString(36)}`.slice(0, 20);
await caso("cria resposta como o app (RLS do dono)", async () => {
  const { data: u } = await db.auth.getUser();
  const { data, error } = await db
    .from("respostas_prontas")
    .insert({ owner_id: u.user!.id, titulo: "Teste da extensão", atalho: marca, texto: "Oi! Aqui é da {negocio}.\nChave: {pix}\nLoja: {vitrine}\nVariável {cliente} fica.", ordem: 9999 })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  criadas.push(data!.id as string);
});

await caso("banco recusa texto grande e atalho fora do padrão", async () => {
  const { data: u } = await db.auth.getUser();
  const grande = await db.from("respostas_prontas").insert({ owner_id: u.user!.id, titulo: "x", texto: "x".repeat(2001) });
  assert.ok(grande.error);
  const atalho = await db.from("respostas_prontas").insert({ owner_id: u.user!.id, titulo: "x", texto: "x", atalho: "Com Espaço" });
  assert.ok(atalho.error);
});

await caso("extensão carrega a resposta nova e preenche as variáveis", async () => {
  const r = await carregarRespostas(db, BASE);
  assert.ok(r.ok, r.ok ? "" : r.erro);
  if (!r.ok) return;
  const achada = filtrarRespostas(r.dados.respostas, `/${marca}`)[0];
  assert.ok(achada, "a resposta criada não veio");
  const texto = preencherVariaveis(achada.texto, r.dados.dados);
  console.log(`        dados da conta: ${Object.entries(r.dados.dados).map(([k, v]) => `${k} ${v ? "sim" : "não"}`).join(", ")}`);
  console.log(`        texto: ${JSON.stringify(texto)}`);
  assert.doesNotMatch(texto, /\{(negocio|pix|vitrine)\}/);
  assert.match(texto, /\{cliente\}/);
  if (!r.dados.dados.pix) assert.doesNotMatch(texto, /Chave:/);
  if (r.dados.dados.vitrine) assert.ok(texto.includes(`${BASE}/loja/`));
  else assert.doesNotMatch(texto, /Loja:/);
});

await caso("reordenar pela função do banco", async () => {
  const { error } = await db.rpc("reordenar_respostas_prontas", { p_ids: criadas });
  assert.equal(error, null, error?.message);
  const { data } = await db.from("respostas_prontas").select("ordem").eq("id", criadas[0]).single();
  assert.equal(data?.ordem, 0);
});

await caso("apagar some da próxima carga", async () => {
  const { error } = await db.from("respostas_prontas").delete().in("id", criadas);
  assert.equal(error, null);
  const r = await carregarRespostas(db, BASE);
  assert.ok(r.ok && !r.dados.respostas.some((x) => criadas.includes(x.id)));
  criadas.length = 0;
});

if (criadas.length > 0) await db.from("respostas_prontas").delete().in("id", criadas);
await db.auth.signOut({ scope: "local" });
console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
