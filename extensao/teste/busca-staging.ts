// Teste de login e busca contra o STAGING com a conta de teste do seed (scripts/seed-staging.mjs).
// Uso (na pasta extensao): node teste/busca-staging.ts <caminho do .env.staging>
// Lê só a URL, a chave anon e o e-mail e a senha da conta de teste. Não imprime nenhum deles.
// Recusa rodar fora do Staging.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buscarProdutos, esquecerVitrine } from "../src/busca.ts";
import { formatarMensagem } from "../src/formatar.ts";

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
async function caso(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASSOU  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU  ${nome}: ${(e as Error).message}`);
  }
}

await caso("sem login a busca pede para entrar", async () => {
  const r = await buscarProdutos(db, "torneira", BASE);
  assert.equal(r.ok, false);
});

await caso("senha errada é recusada", async () => {
  const { error } = await db.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: "senha-errada-de-proposito" });
  assert.ok(error);
});

await caso("login com e-mail e senha", async () => {
  const { data, error } = await db.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA });
  assert.equal(error, null);
  assert.ok(data.session?.access_token);
});

await caso("renovação da sessão", async () => {
  const antes = (await db.auth.getSession()).data.session?.access_token;
  const { data, error } = await db.auth.refreshSession();
  assert.equal(error, null);
  assert.ok(data.session?.access_token && data.session.access_token !== antes);
});

await caso("busca por nome, várias palavras", async () => {
  const r = await buscarProdutos(db, "torneira preta", BASE);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.dados.length, 1, `veio ${r.dados.length}`);
  assert.match(r.dados[0].nome, /Preta/);
  const p = r.dados[0];
  console.log(`        ${p.nome} | capa ${p.capa ? "sim" : "não"} | vitrine ${p.naVitrine} | link ${p.link ? "sim" : "não"}`);
  console.log(`        texto: ${JSON.stringify(formatarMensagem(p))}`);
  assert.ok(p.link?.startsWith(`${BASE}/loja/loja-de-teste?p=`), "produto na vitrine ativa deveria ter link");
  assert.doesNotMatch(formatarMensagem(p), /\b2\b/, "não pode mostrar a quantidade");
});

await caso("busca em caixa alta acha os parecidos", async () => {
  const r = await buscarProdutos(db, "TORNEIRA", BASE);
  assert.ok(r.ok && r.dados.length >= 2);
});

await caso("produto com variações traz as variações e o preço de cada uma", async () => {
  const r = await buscarProdutos(db, "relógio", BASE);
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = r.dados.find((x) => x.nome === "Relógio Tomi");
  assert.ok(p, "Relógio Tomi não veio");
  assert.ok(p.variacoes.length >= 2);
  console.log(`        texto: ${JSON.stringify(formatarMensagem(p))}`);
  console.log(`        variação: ${JSON.stringify(formatarMensagem(p, p.variacoes[1].id))}`);
});

await caso("produto fora da vitrine não leva link", async () => {
  const r = await buscarProdutos(db, "garrafa", BASE);
  assert.ok(r.ok);
  if (!r.ok) return;
  const g = r.dados.find((x) => x.nome === "Garrafa Térmica 500ml");
  if (!g) {
    console.log("        (Garrafa Térmica 500ml não existe nesta conta; caso pulado)");
    return;
  }
  assert.equal(g.naVitrine, false);
  assert.equal(g.link, null);
});

await caso("busca com caracteres da sintaxe do filtro não quebra", async () => {
  const r = await buscarProdutos(db, "torneira, (preta) %_*", BASE);
  assert.ok(r.ok);
});

await caso("busca sem resultado", async () => {
  const r = await buscarProdutos(db, "zzzz produto que nao existe", BASE);
  assert.ok(r.ok && r.dados.length === 0);
});

await caso("busca por SKU ou código de barras (campos existem no filtro)", async () => {
  const r = await buscarProdutos(db, "7890000", BASE);
  assert.ok(r.ok);
});

await caso("sair (escopo local) e a busca volta a pedir login", async () => {
  await db.auth.signOut({ scope: "local" });
  esquecerVitrine();
  const r = await buscarProdutos(db, "torneira", BASE);
  assert.equal(r.ok, false);
});

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
