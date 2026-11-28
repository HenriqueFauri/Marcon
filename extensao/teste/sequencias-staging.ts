// Sequências contra o STAGING, pela API de verdade (mesma RLS do app e da extensão).
// Uso (na pasta extensao): node teste/sequencias-staging.ts <caminho do .env.staging>
// Conta A = conta de teste do seed. Conta B = criada aqui pela chave de serviço do Staging e apagada
// no fim. Confere: A cria sequência com passos (texto, resposta pronta, arquivo), a extensão carrega
// e monta o roteiro na ordem; reordena; B não lê, não altera, não apaga, não reordena nem aponta para
// o que é de A; anon nada; o banco recusa passo vazio e o 21º passo. Apaga o que criou.
// Não imprime e-mail, senha nem chave. Recusa rodar fora do Staging.
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { carregarRespostas } from "../src/respostas-db.ts";
import { preencherVariaveis } from "../src/respostas.ts";
import { INICIO, acaoAtual, depoisDaAcao, montarRoteiro, rotuloDaAcao, rotuloProgresso, terminou } from "../src/sequencias.ts";

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

const emailB = `teste.sequencias.${Date.now()}@usemarcon.com`;
const senhaB = `Ts!${randomBytes(10).toString("hex")}`;
const { data: criadaB, error: erroB } = await admin.auth.admin.createUser({ email: emailB, password: senhaB, email_confirm: true });
if (erroB || !criadaB.user) throw new Error("Não deu para criar a conta B.");
const idB = criadaB.user.id;

let idA = "";
let seqA = "";
let respostaA = "";
let midiaA: string | null = null;
let pathA = "";
const passosA: string[] = [];

try {
  await caso("login das duas contas", async () => {
    assert.equal((await A.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA })).error, null);
    assert.equal((await B.auth.signInWithPassword({ email: emailB, password: senhaB })).error, null);
    idA = (await A.auth.getUser()).data.user!.id;
  });

  await caso("A cria sequência, resposta e arquivo como o app", async () => {
    const s = await A.from("sequencias").insert({ owner_id: idA, titulo: "Teste da extensão", ordem: 9999 }).select("id").single();
    assert.equal(s.error, null, s.error?.message);
    seqA = s.data!.id as string;
    const r = await A.from("respostas_prontas").insert({ owner_id: idA, titulo: "Pix teste", texto: "Pode pagar no Pix.\nChave: {pix}", ordem: 9999 }).select("id").single();
    assert.equal(r.error, null, r.error?.message);
    respostaA = r.data!.id as string;
    pathA = `${idA}/${randomUUID()}.pdf`;
    const up = await A.storage.from("midias").upload(pathA, new Blob([new TextEncoder().encode("%PDF-1.4\n% teste\n")], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert.equal(up.error, null, up.error?.message);
    const m = await A.from("midias")
      .insert({ tipo: "documento", titulo: "Catálogo teste", nome_arquivo: "Catálogo.pdf", path: pathA, mime: "application/pdf", tamanho: 1 })
      .select("id")
      .single();
    assert.equal(m.error, null, m.error?.message);
    midiaA = m.data!.id as string;
  });

  await caso("A cria os passos: texto, arquivo, texto com arquivo, resposta", async () => {
    const linhas = [
      { texto: "Oi! Aqui é da {negocio}.", ordem: 0 },
      { midia_id: midiaA, ordem: 1 },
      { texto: "Segue o catálogo:", midia_id: midiaA, ordem: 2 },
      { resposta_id: respostaA, ordem: 3 },
    ];
    for (const l of linhas) {
      const { data, error } = await A.from("sequencia_passos").insert({ owner_id: idA, sequencia_id: seqA, ...l }).select("id").single();
      assert.equal(error, null, error?.message);
      passosA.push(data!.id as string);
    }
  });

  await caso("banco recusa passo vazio e passo com texto e resposta", async () => {
    const vazio = await A.from("sequencia_passos").insert({ owner_id: idA, sequencia_id: seqA });
    assert.ok(vazio.error && /precisa de um texto/.test(vazio.error.message), vazio.error?.message);
    const dois = await A.from("sequencia_passos").insert({ owner_id: idA, sequencia_id: seqA, texto: "x", resposta_id: respostaA });
    assert.ok(dois.error);
  });

  await caso("extensão carrega e percorre a sequência na ordem, um clique por ação", async () => {
    const r = await carregarRespostas(A, BASE);
    assert.ok(r.ok, r.ok ? "" : r.erro);
    if (!r.ok) return;
    const seq = r.dados.sequencias?.find((s) => s.id === seqA);
    assert.ok(seq, "a sequência não veio");
    const roteiro = montarRoteiro(seq, r.dados.passos ?? [], r.dados.respostas, r.dados.arquivos ?? [], (t) => preencherVariaveis(t, r.dados.dados));
    assert.equal(roteiro.passos.length, 4);
    const feitas: string[] = [];
    let pos = INICIO;
    while (!terminou(roteiro, pos)) {
      feitas.push(`${rotuloProgresso(roteiro, pos)}: ${rotuloDaAcao(acaoAtual(roteiro, pos)!)}`);
      pos = depoisDaAcao(roteiro, pos);
    }
    console.log(`        ${feitas.join(" | ")}`);
    assert.deepEqual(feitas, [
      "Passo 1 de 4: Inserir texto",
      "Passo 2 de 4: Anexar PDF",
      "Passo 3 de 4: Inserir texto",
      "Passo 3 de 4: Anexar PDF",
      "Passo 4 de 4: Inserir texto",
    ]);
    const primeiro = roteiro.passos[0].acoes[0];
    assert.ok(primeiro.tipo === "texto" && !primeiro.texto.includes("{negocio}"));
  });

  await caso("A reordena os passos pela função do banco", async () => {
    const nova = [passosA[3], passosA[0], passosA[1], passosA[2]];
    const { error } = await A.rpc("reordenar_passos_sequencia", { p_sequencia: seqA, p_ids: nova });
    assert.equal(error, null, error?.message);
    const { data } = await A.from("sequencia_passos").select("id, ordem").eq("sequencia_id", seqA).order("ordem");
    assert.deepEqual((data ?? []).map((p) => p.id), nova);
  });

  await caso("B não lê, não altera, não apaga e não reordena o que é de A", async () => {
    assert.equal(((await B.from("sequencias").select("id").eq("id", seqA)).data ?? []).length, 0);
    assert.equal(((await B.from("sequencia_passos").select("id").eq("sequencia_id", seqA)).data ?? []).length, 0);
    assert.equal(((await B.from("sequencias").update({ titulo: "INVADIDO" }).eq("id", seqA).select("id")).data ?? []).length, 0);
    assert.equal(((await B.from("sequencia_passos").update({ texto: "INVADIDO" }).eq("id", passosA[0]).select("id")).data ?? []).length, 0);
    assert.equal(((await B.from("sequencia_passos").delete().eq("id", passosA[0]).select("id")).data ?? []).length, 0);
    assert.equal(((await B.from("sequencias").delete().eq("id", seqA).select("id")).data ?? []).length, 0);
    await B.rpc("reordenar_passos_sequencia", { p_sequencia: seqA, p_ids: [passosA[2], passosA[1]] });
    await B.rpc("reordenar_sequencias", { p_ids: [seqA] });
    const { data: s } = await A.from("sequencias").select("titulo, ordem").eq("id", seqA).single();
    assert.equal(s?.titulo, "Teste da extensão");
    assert.equal(s?.ordem, 9999);
    const { data: p } = await A.from("sequencia_passos").select("id").eq("sequencia_id", seqA).order("ordem");
    assert.deepEqual((p ?? []).map((x) => x.id), [passosA[3], passosA[0], passosA[1], passosA[2]]);
  });

  await caso("B não põe passo na sequência de A nem aponta para resposta ou arquivo de A", async () => {
    const naDeA = await B.from("sequencia_passos").insert({ owner_id: idB, sequencia_id: seqA, texto: "INJETADO" });
    assert.ok(naDeA.error && /relacionado/.test(naDeA.error.message), naDeA.error?.message);
    const s = await B.from("sequencias").insert({ owner_id: idB, titulo: "Sequência B" }).select("id").single();
    assert.equal(s.error, null, s.error?.message);
    const resp = await B.from("sequencia_passos").insert({ owner_id: idB, sequencia_id: s.data!.id, resposta_id: respostaA });
    assert.ok(resp.error && /relacionado/.test(resp.error.message), resp.error?.message);
    const arq = await B.from("sequencia_passos").insert({ owner_id: idB, sequencia_id: s.data!.id, midia_id: midiaA });
    assert.ok(arq.error && /relacionado/.test(arq.error.message), arq.error?.message);
    const emNomeDeA = await B.from("sequencias").insert({ owner_id: idA, titulo: "INJETADA" });
    assert.ok(emNomeDeA.error);
  });

  await caso("anon não lê nem grava sequências", async () => {
    const l1 = await anon.from("sequencias").select("id").limit(1);
    assert.ok(l1.error || (l1.data ?? []).length === 0);
    const l2 = await anon.from("sequencia_passos").select("id").limit(1);
    assert.ok(l2.error || (l2.data ?? []).length === 0);
    const g = await anon.from("sequencias").insert({ owner_id: idA, titulo: "ANON" });
    assert.ok(g.error);
    const f = await anon.rpc("reordenar_sequencias", { p_ids: [seqA] });
    assert.ok(f.error);
  });

  await caso("banco para no 20º passo", async () => {
    const mais = Array.from({ length: 16 }, (_, i) => ({ owner_id: idA, sequencia_id: seqA, texto: `p${i}`, ordem: 10 + i }));
    const { error } = await A.from("sequencia_passos").insert(mais);
    assert.equal(error, null, error?.message);
    const vinteUm = await A.from("sequencia_passos").insert({ owner_id: idA, sequencia_id: seqA, texto: "demais" });
    assert.ok(vinteUm.error && /20 passos/.test(vinteUm.error.message), vinteUm.error?.message);
  });

  await caso("apagar o arquivo deixa o passo vazio, a extensão pula", async () => {
    await A.from("midias").delete().eq("id", midiaA!);
    await A.storage.from("midias").remove([pathA]);
    midiaA = null;
    const r = await carregarRespostas(A, BASE);
    assert.ok(r.ok);
    if (!r.ok) return;
    const seq = r.dados.sequencias!.find((s) => s.id === seqA)!;
    const roteiro = montarRoteiro(seq, r.dados.passos ?? [], r.dados.respostas, r.dados.arquivos ?? [], (t) => preencherVariaveis(t, r.dados.dados));
    assert.equal(roteiro.pulados, 1);
    assert.equal(roteiro.passos.length, 19);
  });

  await caso("apagar a sequência leva os passos junto", async () => {
    const { error } = await A.from("sequencias").delete().eq("id", seqA);
    assert.equal(error, null);
    const { data } = await admin.from("sequencia_passos").select("id").eq("sequencia_id", seqA);
    assert.equal((data ?? []).length, 0);
    seqA = "";
  });
} finally {
  if (seqA) await admin.from("sequencias").delete().eq("id", seqA);
  if (respostaA) await admin.from("respostas_prontas").delete().eq("id", respostaA);
  if (midiaA) await admin.from("midias").delete().eq("id", midiaA);
  if (pathA) await admin.storage.from("midias").remove([pathA]);
  await A.auth.signOut({ scope: "local" });
  await B.auth.signOut({ scope: "local" });
  await admin.auth.admin.deleteUser(idB);
}

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
