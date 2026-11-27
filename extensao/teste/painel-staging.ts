// Lista de produtos ao abrir, fotos do estoque, dados da conta (topo e rodapé) e renomear áudio,
// contra o STAGING com a conta de teste do seed. Recusa rodar fora do Staging; não imprime credencial.
// Uso (na pasta extensao), porque conta-db usa o src/lib/assinatura.ts do app (caminhos "@/"):
//   npx esbuild teste/painel-staging.ts --bundle --platform=node --format=esm --packages=external --outfile=teste/dist/painel-staging.mjs
//   node teste/dist/painel-staging.mjs ../.env.staging
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { listarProdutos, produtosComFoto, POR_PAGINA } from "../src/busca.ts";
import { dadosDaConta } from "../src/conta-db.ts";
import { renomearMidia } from "../src/midias-db.ts";

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
  auth: { persistSession: true, autoRefreshToken: false, storage: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => void memoria.set(k, v), removeItem: (k) => void memoria.delete(k) } },
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

await caso("sem login, a lista pede para entrar", async () => {
  assert.equal((await listarProdutos(db, 0, BASE)).ok, false);
  assert.equal((await dadosDaConta(db)).ok, false);
});

await caso("login", async () => {
  assert.equal((await db.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA })).error, null);
});

await caso("busca vazia lista os produtos ativos da conta em ordem de nome", async () => {
  const r = await listarProdutos(db, 0, BASE);
  assert.ok(r.ok, r.ok ? "" : r.erro);
  const { count } = await db.from("produtos").select("id", { count: "exact", head: true }).eq("status", "ativo");
  assert.equal(r.dados.produtos.length, Math.min(count ?? 0, POR_PAGINA));
  assert.equal(r.dados.temMais, (count ?? 0) > POR_PAGINA);
  assert.ok((count ?? 0) > 0, "a conta de teste não tem produto (rode o seed)");
  // a página 1 não repete a 0
  const p1 = await listarProdutos(db, 1, BASE);
  assert.ok(p1.ok);
  const ids0 = new Set(r.dados.produtos.map((p) => p.id));
  assert.ok(p1.dados.produtos.every((p) => !ids0.has(p.id)));
});

await caso("fotos do estoque sem busca traz os produtos com foto", async () => {
  const r = await produtosComFoto(db, "", BASE);
  assert.ok(r.ok, r.ok ? "" : r.erro);
  const { count } = await db.from("produto_capas").select("produto_id", { count: "exact", head: true });
  if ((count ?? 0) > 0) assert.ok(r.dados.length > 0, "tem foto no banco mas a lista veio vazia");
  assert.ok(r.dados.every((p) => p.capa?.startsWith("https://") && p.capaPath));
});

await caso("dados da conta: negócio, dono e selo do plano como no app", async () => {
  const r = await dadosDaConta(db);
  assert.ok(r.ok, r.ok ? "" : r.erro);
  assert.ok(r.dados.nomeNegocio.length > 0);
  assert.ok(r.dados.nome.length > 0);
  assert.ok(r.dados.plano && r.dados.plano.texto.length > 0);
  assert.ok(["neutral", "positive", "warning", "info"].includes(r.dados.plano!.tom));
});

await caso("renomear áudio troca o nome e o nome do arquivo na conversa", async () => {
  const { data: u } = await db.auth.getUser();
  const path = `${u.user!.id}/${randomUUID()}.m4a`;
  const up = await db.storage.from("midias").upload(path, new Blob([new Uint8Array(1000).fill(3)], { type: "audio/mp4" }), { contentType: "audio/mp4" });
  assert.equal(up.error, null, up.error?.message);
  try {
    const { data, error } = await db.from("midias").insert({ tipo: "audio", titulo: "Áudio 27/11", nome_arquivo: "Áudio 27 11.m4a", path, mime: "audio/mp4", tamanho: 1 }).select("id").single();
    assert.equal(error, null, error?.message);
    const r = await renomearMidia(db, data!.id, "  Como funciona a entrega  ");
    assert.ok(r.ok, r.ok ? "" : r.erro);
    const { data: depois } = await db.from("midias").select("titulo, nome_arquivo").eq("id", data!.id).single();
    assert.equal(depois!.titulo, "Como funciona a entrega");
    assert.equal(depois!.nome_arquivo, "Como funciona a entrega.m4a");
    assert.equal((await renomearMidia(db, data!.id, "   ")).ok, false);
  } finally {
    await db.from("midias").delete().eq("path", path);
    await db.storage.from("midias").remove([path]);
  }
});

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
