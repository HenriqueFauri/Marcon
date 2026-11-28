// Criar, editar, apagar e ordenar pelo painel, contra o STAGING, pela API de verdade (as mesmas funções
// que o service worker chama: src/gestao-db.ts e src/midias-db.ts).
// Uso (na pasta extensao): node teste/gestao-staging.ts <caminho do .env.staging>
// Conta A = conta de teste do seed. Conta B = criada aqui pela chave de serviço do Staging e apagada no
// fim. Confere: A cria, edita, reordena e apaga resposta, arquivo (sobe do "computador"), sequência e
// passos; o atalho repetido e o passo vazio são recusados; o painel carrega tudo na ordem; B não edita,
// não apaga, não liga e não põe passo no que é de A; anon nada. Apaga o que criou.
// Não imprime e-mail, senha nem chave. Recusa rodar fora do Staging.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  apagarPasso,
  apagarResposta,
  apagarSequencia,
  reordenarPassos,
  reordenarRespostas,
  reordenarSequencias,
  salvarPasso,
  salvarResposta,
  salvarSequencia,
} from "../src/gestao-db.ts";
import { apagarMidia, ligarMidia, salvarMidia, subirMidia } from "../src/midias-db.ts";
import { carregarRespostas } from "../src/respostas-db.ts";
import { paraBase64 } from "../src/base64.ts";
import { ERRO_ATALHO_REPETIDO } from "../src/respostas.ts";
import { BUCKET_MIDIAS } from "../src/midias.ts";

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

const emailB = `teste.gestao.${Date.now()}@usemarcon.com`;
const senhaB = `Ts!${randomBytes(10).toString("hex")}`;
const { data: criadaB, error: erroB } = await admin.auth.admin.createUser({ email: emailB, password: senhaB, email_confirm: true });
if (erroB || !criadaB.user) throw new Error("Não deu para criar a conta B.");

// marca única para achar e apagar o que este teste criou
const marca = `t${Date.now().toString(36)}`;
let resposta1 = "";
let resposta2 = "";
let midia = "";
let pathMidia = "";
let seq1 = "";
let seq2 = "";
const passos: string[] = [];
let ordemOriginal: string[] = [];

try {
  await caso("login das duas contas", async () => {
    assert.equal((await A.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA })).error, null);
    assert.equal((await B.auth.signInWithPassword({ email: emailB, password: senhaB })).error, null);
  });

  await caso("A cria e edita respostas pelo painel; atalho repetido é recusado", async () => {
    const r1 = await salvarResposta(A, { titulo: `Teste ${marca} um`, texto: "Oi! Aqui é da {negocio}.", atalho: `/${marca}A` });
    assert.ok(r1.ok, !r1.ok ? r1.erro : "");
    resposta1 = r1.ok ? r1.dados.id : "";
    const r2 = await salvarResposta(A, { titulo: `Teste ${marca} dois`, texto: "Chave: {pix}", atalho: "" });
    assert.ok(r2.ok, !r2.ok ? r2.erro : "");
    resposta2 = r2.ok ? r2.dados.id : "";
    const repetido = await salvarResposta(A, { titulo: "Outra", texto: "x", atalho: `${marca}a` });
    assert.deepEqual(repetido, { ok: false, erro: ERRO_ATALHO_REPETIDO });
    const editada = await salvarResposta(A, { id: resposta1, titulo: `Teste ${marca} um editada`, texto: "Oi de novo", atalho: `${marca}a` });
    assert.ok(editada.ok);
    const { data } = await A.from("respostas_prontas").select("titulo, texto, atalho").eq("id", resposta1).single();
    assert.deepEqual(data, { titulo: `Teste ${marca} um editada`, texto: "Oi de novo", atalho: `${marca}a`.toLowerCase() });
    // regra do app: título vazio não chega ao banco
    assert.equal((await salvarResposta(A, { titulo: " ", texto: "x", atalho: "" })).ok, false);
  });

  await caso("A reordena as respostas (a função do banco)", async () => {
    const { data } = await A.from("respostas_prontas").select("id").order("ordem").order("created_at");
    ordemOriginal = (data ?? []).map((x) => x.id as string);
    const nova = [resposta2, resposta1, ...ordemOriginal.filter((id) => id !== resposta1 && id !== resposta2)];
    const r = await reordenarRespostas(A, nova);
    assert.ok(r.ok, !r.ok ? r.erro : "");
    const { data: depois } = await A.from("respostas_prontas").select("id").order("ordem").order("created_at");
    assert.deepEqual((depois ?? []).slice(0, 2).map((x) => x.id), [resposta2, resposta1]);
  });

  await caso("A sobe um PDF do computador, renomeia e liga à resposta", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const r = await subirMidia(A, { base64: paraBase64(pdf.buffer), nome: `catalogo_${marca}.pdf`, mime: "application/pdf", duracao: null });
    assert.ok(r.ok, !r.ok ? r.erro : "");
    if (!r.ok) return;
    midia = r.dados.id;
    pathMidia = r.dados.path;
    assert.equal(r.dados.tipo, "documento");
    assert.equal(r.dados.titulo, `catalogo ${marca}`);
    const s = await salvarMidia(A, midia, `Catálogo ${marca}`, resposta1);
    assert.ok(s.ok, !s.ok ? s.erro : "");
    const { data } = await A.from("midias").select("titulo, nome_arquivo, resposta_id").eq("id", midia).single();
    assert.deepEqual(data, { titulo: `Catálogo ${marca}`, nome_arquivo: `Catálogo ${marca}.pdf`, resposta_id: resposta1 });
    const tirar = await ligarMidia(A, midia, null);
    assert.ok(tirar.ok);
    assert.ok((await ligarMidia(A, midia, resposta2)).ok);
    // tipo que o app não aceita também não passa pelo painel
    const xls = await subirMidia(A, { base64: paraBase64(pdf.buffer), nome: "planilha.xlsx", mime: "application/vnd.ms-excel", duracao: null });
    assert.equal(xls.ok, false);
  });

  await caso("A cria sequência e passos, edita, reordena; passo vazio é recusado", async () => {
    const s1 = await salvarSequencia(A, { titulo: `Seq ${marca} um` });
    const s2 = await salvarSequencia(A, { titulo: `Seq ${marca} dois` });
    assert.ok(s1.ok && s2.ok);
    seq1 = s1.ok ? s1.dados.id : "";
    seq2 = s2.ok ? s2.dados.id : "";
    assert.ok((await salvarSequencia(A, { id: seq1, titulo: `Seq ${marca} um renomeada` })).ok);
    const p1 = await salvarPasso(A, { sequenciaId: seq1, fonte: "escrever", texto: "Oi {negocio}", respostaId: "", midiaId: "" });
    const p2 = await salvarPasso(A, { sequenciaId: seq1, fonte: "resposta", texto: "", respostaId: resposta1, midiaId: midia });
    const p3 = await salvarPasso(A, { sequenciaId: seq1, fonte: "nenhum", texto: "", respostaId: "", midiaId: midia });
    for (const p of [p1, p2, p3]) {
      assert.ok(p.ok, !p.ok ? p.erro : "");
      if (p.ok) passos.push(p.dados.id);
    }
    assert.equal((await salvarPasso(A, { sequenciaId: seq1, fonte: "nenhum", texto: "", respostaId: "", midiaId: "" })).ok, false);
    assert.ok((await salvarPasso(A, { id: passos[0], sequenciaId: seq1, fonte: "escrever", texto: "Oi editado", respostaId: "", midiaId: "" })).ok);
    assert.ok((await reordenarPassos(A, seq1, [passos[2], passos[0], passos[1]])).ok);
    const { data } = await A.from("sequencia_passos").select("id, texto").eq("sequencia_id", seq1).order("ordem");
    assert.deepEqual((data ?? []).map((x) => x.id), [passos[2], passos[0], passos[1]]);
    assert.equal(data?.[1].texto, "Oi editado");
    const { data: todas } = await A.from("sequencias").select("id").order("ordem").order("created_at");
    const ids = (todas ?? []).map((x) => x.id as string);
    const trocada = [seq2, seq1, ...ids.filter((x) => x !== seq1 && x !== seq2)];
    assert.ok((await reordenarSequencias(A, trocada)).ok);
  });

  await caso("o painel carrega o que foi criado, na ordem", async () => {
    const r = await carregarRespostas(A, BASE);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.dados.respostas[0].id, resposta2);
    assert.ok(r.dados.midias?.some((m) => m.id === midia && m.resposta_id === resposta2));
    const doTeste = (r.dados.sequencias ?? []).filter((s) => s.id === seq1 || s.id === seq2).map((s) => s.id);
    assert.deepEqual(doTeste, [seq2, seq1]);
    assert.deepEqual((r.dados.passos ?? []).filter((p) => p.sequencia_id === seq1).map((p) => p.id), [passos[2], passos[0], passos[1]]);
  });

  await caso("B não edita, não apaga, não liga e não põe passo no que é de A", async () => {
    const e1 = await salvarResposta(B, { id: resposta1, titulo: "Invadida", texto: "x", atalho: "" });
    assert.equal(e1.ok, false);
    assert.equal((await apagarResposta(B, resposta1)).ok, false);
    assert.equal((await salvarMidia(B, midia, "Invadido", null)).ok, false);
    assert.equal((await ligarMidia(B, midia, null)).ok, false);
    assert.equal((await apagarMidia(B, midia)).ok, false);
    assert.equal((await salvarSequencia(B, { id: seq1, titulo: "Invadida" })).ok, false);
    assert.equal((await apagarSequencia(B, seq1)).ok, false);
    assert.equal((await apagarPasso(B, passos[0])).ok, false);
    // passo de B dentro da sequência de A, ou passo de B apontando para a resposta de A: o banco recusa
    assert.equal((await salvarPasso(B, { sequenciaId: seq1, fonte: "escrever", texto: "x", respostaId: "", midiaId: "" })).ok, false);
    const sB = await salvarSequencia(B, { titulo: "Seq da B" });
    assert.ok(sB.ok);
    if (sB.ok) {
      assert.equal((await salvarPasso(B, { sequenciaId: sB.dados.id, fonte: "resposta", texto: "", respostaId: resposta1, midiaId: "" })).ok, false);
      assert.equal((await salvarPasso(B, { sequenciaId: sB.dados.id, fonte: "nenhum", texto: "", respostaId: "", midiaId: midia })).ok, false);
    }
    // reordenar com os ids de A não muda nada de A
    await reordenarRespostas(B, [resposta1, resposta2]);
    await reordenarPassos(B, seq1, [passos[1], passos[0], passos[2]]);
    const { data: resp } = await A.from("respostas_prontas").select("titulo").eq("id", resposta1).single();
    assert.equal(resp?.titulo, `Teste ${marca} um editada`);
    const { data: ord } = await A.from("respostas_prontas").select("id").order("ordem").order("created_at").limit(2);
    assert.deepEqual((ord ?? []).map((x) => x.id), [resposta2, resposta1]);
    const { data: ps } = await A.from("sequencia_passos").select("id").eq("sequencia_id", seq1).order("ordem");
    assert.deepEqual((ps ?? []).map((x) => x.id), [passos[2], passos[0], passos[1]]);
    const { count } = await A.from("midias").select("id", { count: "exact", head: true }).eq("id", midia);
    assert.equal(count, 1);
  });

  await caso("sem login nada passa", async () => {
    const r = await salvarResposta(anon, { titulo: "x", texto: "x", atalho: "" });
    assert.deepEqual(r, { ok: false, erro: "Sua sessão acabou. Entre de novo." });
    assert.equal((await apagarMidia(anon, midia)).ok, false);
    assert.equal((await subirMidia(anon, { base64: "JVBERi0=", nome: "a.pdf", mime: "application/pdf", duracao: null })).ok, false);
  });

  await caso("A apaga pelo painel: passo, sequências, arquivo (some do Storage) e respostas", async () => {
    assert.ok((await apagarPasso(A, passos[0])).ok);
    assert.ok((await apagarSequencia(A, seq1)).ok);
    assert.ok((await apagarSequencia(A, seq2)).ok);
    const { count: restantes } = await A.from("sequencia_passos").select("id", { count: "exact", head: true }).eq("sequencia_id", seq1);
    assert.equal(restantes, 0);
    assert.ok((await apagarMidia(A, midia)).ok);
    const baixa = await A.storage.from(BUCKET_MIDIAS).download(pathMidia);
    assert.ok(baixa.error, "o arquivo ainda está no Storage");
    assert.ok((await apagarResposta(A, resposta1)).ok);
    assert.ok((await apagarResposta(A, resposta2)).ok);
    assert.equal((await apagarResposta(A, resposta2)).ok, false);
    seq1 = seq2 = midia = resposta1 = resposta2 = "";
  });
} finally {
  // limpeza do que sobrou (falha no meio)
  if (seq1) await admin.from("sequencias").delete().eq("id", seq1);
  if (seq2) await admin.from("sequencias").delete().eq("id", seq2);
  if (midia) {
    await admin.from("midias").delete().eq("id", midia);
    if (pathMidia) await admin.storage.from(BUCKET_MIDIAS).remove([pathMidia]);
  }
  for (const id of [resposta1, resposta2]) if (id) await admin.from("respostas_prontas").delete().eq("id", id);
  if (ordemOriginal.length) await A.rpc("reordenar_respostas_prontas", { p_ids: ordemOriginal });
  await admin.auth.admin.deleteUser(criadaB.user.id);
  await A.auth.signOut({ scope: "local" });
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
