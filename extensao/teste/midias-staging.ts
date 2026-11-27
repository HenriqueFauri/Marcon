// Biblioteca de mídia e fotos do produto contra o STAGING, pela API de verdade (Storage e banco).
// Uso (na pasta extensao): node teste/midias-staging.ts <caminho do .env.staging>
// Conta A = conta de teste do seed. Conta B = criada aqui pela chave de serviço do Staging e apagada
// no fim. Confere: A sobe, lista e baixa como a extensão; B não lê, não baixa, não assina, não apaga
// e não grava na pasta de A; anon nada; o bucket recusa tipo e tamanho errados. Apaga o que criou.
// Não imprime e-mail, senha nem chave. Recusa rodar fora do Staging.
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { arquivoDaFoto, arquivoDaMidia, fotosDoProduto, listarMidias, salvarGravacao, urlDaMidia } from "../src/midias-db.ts";
import { carregarRespostas } from "../src/respostas-db.ts";
import { deBase64, paraBase64 } from "../src/base64.ts";

const REF_STAGING = "odgvhqwqyxtnaxgqiynb";
const arquivo = process.argv[2];
if (!arquivo) throw new Error("Passe o caminho do .env.staging.");
const env: Record<string, string> = {};
for (const l of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
  const m = l.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|STAGING_TESTE_EMAIL|STAGING_TESTE_SENHA)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${REF_STAGING}.supabase.co`) throw new Error("Não é o Staging. Parei.");

function cliente(): SupabaseClient {
  const memoria = new Map<string, string>();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => void memoria.set(k, v), removeItem: (k) => void memoria.delete(k) },
    },
  });
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const A = cliente();
const B = cliente();
const anon = cliente();

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

// conta B temporária
const emailB = `teste.midias.${Date.now()}@usemarcon.com`;
const senhaB = `Tm!${randomBytes(10).toString("hex")}`;
const { data: criadaB, error: erroB } = await admin.auth.admin.createUser({ email: emailB, password: senhaB, email_confirm: true });
if (erroB || !criadaB.user) throw new Error("Não deu para criar a conta B.");
const idB = criadaB.user.id;

const caminhosA: string[] = [];
let idA = "";
let midiaA = "";
let pathA = "";
const bytesPdf = new TextEncoder().encode("%PDF-1.4\n% teste do Marcon\n" + "x".repeat(3000));

try {
  await caso("login das duas contas", async () => {
    assert.equal((await A.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA })).error, null);
    assert.equal((await B.auth.signInWithPassword({ email: emailB, password: senhaB })).error, null);
    idA = (await A.auth.getUser()).data.user!.id;
  });

  await caso("A sobe um PDF na própria pasta e registra (tamanho vem do Storage)", async () => {
    pathA = `${idA}/${randomUUID()}.pdf`;
    const up = await A.storage.from("midias").upload(pathA, new Blob([bytesPdf], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert.equal(up.error, null, up.error?.message);
    caminhosA.push(pathA);
    const { data, error } = await A.from("midias")
      .insert({ tipo: "documento", titulo: "Catálogo teste", nome_arquivo: "Catálogo teste.pdf", path: pathA, mime: "application/pdf", tamanho: 1 })
      .select("id, tamanho")
      .single();
    assert.equal(error, null, error?.message);
    midiaA = data!.id;
    assert.equal(Number(data!.tamanho), bytesPdf.length);
  });

  await caso("extensão: lista e baixa o PDF de A para anexar (bytes iguais)", async () => {
    const l = await listarMidias(A);
    assert.ok(l.ok && l.dados.some((m) => m.id === midiaA));
    const r = await arquivoDaMidia(A, midiaA);
    assert.ok(r.ok, r.ok ? "" : r.erro);
    assert.equal(r.dados.mime, "application/pdf");
    assert.equal(r.dados.nome, "Catálogo teste.pdf");
    assert.deepEqual(deBase64(r.dados.base64), bytesPdf);
  });

  await caso("extensão: grava áudio na biblioteca e acha a URL para ouvir", async () => {
    const audio = new Uint8Array(4000).fill(7);
    const r = await salvarGravacao(A, { base64: paraBase64(audio), ext: "m4a", titulo: "Áudio de teste", duracao: 3.4 });
    assert.ok(r.ok, r.ok ? "" : r.erro);
    caminhosA.push(r.dados.path);
    assert.equal(r.dados.origem, "gravacao");
    assert.equal(r.dados.duracao, 3);
    assert.equal(r.dados.mime, "audio/mp4");
    assert.equal(Number(r.dados.tamanho), 4000);
    const u = await urlDaMidia(A, r.dados.id);
    assert.ok(u.ok && u.dados.includes("/midias/"));
  });

  await caso("resposta pronta mostra a mídia ligada", async () => {
    const { data: rp } = await A.from("respostas_prontas").insert({ titulo: "Teste mídia", texto: "Segue o catálogo" }).select("id").single();
    try {
      const { error } = await A.from("midias").update({ resposta_id: rp!.id }).eq("id", midiaA);
      assert.equal(error, null);
      const r = await carregarRespostas(A, "https://marcon-staging.vercel.app");
      assert.ok(r.ok && r.dados.midias?.some((m) => m.id === midiaA && m.resposta_id === rp!.id));
    } finally {
      await A.from("respostas_prontas").delete().eq("id", rp!.id);
    }
  });

  await caso("B não lê o registro nem o arquivo de A", async () => {
    const { data } = await B.from("midias").select("id").eq("id", midiaA);
    assert.equal((data ?? []).length, 0);
    const baixa = await B.storage.from("midias").download(pathA);
    assert.ok(baixa.error, "B baixou o arquivo de A");
    const assina = await B.storage.from("midias").createSignedUrl(pathA, 60);
    assert.ok(assina.error || !assina.data?.signedUrl, "B assinou o arquivo de A");
    const pelaExtensao = await arquivoDaMidia(B, midiaA);
    assert.equal(pelaExtensao.ok, false);
  });

  await caso("B não apaga nem sobrescreve o arquivo de A", async () => {
    await B.storage.from("midias").remove([pathA]);
    await B.storage.from("midias").upload(pathA, new Blob(["INVADIDO"], { type: "application/pdf" }), { upsert: true });
    const ainda = await A.storage.from("midias").download(pathA);
    assert.equal(ainda.error, null);
    assert.equal(ainda.data!.size, bytesPdf.length);
  });

  await caso("B não grava na pasta de A", async () => {
    const up = await B.storage.from("midias").upload(`${idA}/${randomUUID()}.pdf`, new Blob([bytesPdf], { type: "application/pdf" }));
    assert.ok(up.error, "B gravou na pasta de A");
  });

  await caso("B não baixa foto de produto de A pela extensão", async () => {
    const { data: foto } = await A.from("produto_fotos").select("path").limit(1).maybeSingle();
    if (!foto) throw new Error("conta A sem foto de produto (rode o seed)");
    const r = await arquivoDaFoto(B, foto.path, "x");
    assert.equal(r.ok, false);
    const direto = await B.storage.from("produto-fotos").download(foto.path);
    assert.ok(direto.error);
  });

  await caso("extensão: fotos do produto de A e anexo da foto", async () => {
    const { data: foto } = await A.from("produto_fotos").select("produto_id, path").limit(1).maybeSingle();
    const f = await fotosDoProduto(A, foto!.produto_id);
    assert.ok(f.ok && f.dados.length > 0 && f.dados.every((x) => x.url.startsWith("https://")));
    const r = await arquivoDaFoto(A, f.dados[0].path, "Produto: teste/1");
    assert.ok(r.ok, r.ok ? "" : r.erro);
    assert.ok(r.dados.mime.startsWith("image/"));
    assert.ok(r.dados.base64.length > 100);
    assert.ok(!r.dados.nome.includes("/"));
  });

  await caso("anon não lista, não baixa e não sobe", async () => {
    const { data } = await anon.from("midias").select("id").limit(1);
    assert.equal((data ?? []).length, 0);
    assert.ok((await anon.storage.from("midias").download(pathA)).error);
    assert.ok((await anon.storage.from("midias").upload(`${idA}/${randomUUID()}.pdf`, new Blob([bytesPdf], { type: "application/pdf" }))).error);
  });

  await caso("bucket recusa tipo fora da lista e arquivo acima de 10 MB", async () => {
    const html = await A.storage.from("midias").upload(`${idA}/${randomUUID()}.pdf`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
    assert.ok(html.error, "aceitou text/html");
    const grande = await A.storage
      .from("midias")
      .upload(`${idA}/${randomUUID()}.pdf`, new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert.ok(grande.error, "aceitou arquivo acima de 10 MB");
  });

  await caso("registro sem arquivo no Storage é recusado", async () => {
    const { error } = await A.from("midias").insert({
      tipo: "documento",
      titulo: "Fantasma",
      nome_arquivo: "f.pdf",
      path: `${idA}/${randomUUID()}.pdf`,
      mime: "application/pdf",
      tamanho: 10,
    });
    assert.ok(error && error.message.includes("não encontrado"), error?.message);
  });
} finally {
  // limpeza: registros e arquivos de A criados aqui, depois a conta B
  for (const p of caminhosA) await A.from("midias").delete().eq("path", p);
  if (caminhosA.length) await A.storage.from("midias").remove(caminhosA);
  await admin.auth.admin.deleteUser(idB);
}

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
