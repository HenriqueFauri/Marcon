// Venda rápida sem duplicar, contra o STAGING (migration 0075 e rota /api/extensao/venda).
// Uso (na pasta extensao):
//   node teste/venda-staging.ts <.env.staging> <arquivo da conta B> [--rota]
// Conta A: a conta de teste do seed (STAGING_TESTE_EMAIL e STAGING_TESTE_SENHA no .env.staging).
// Conta B: outra conta de teste ({ email, senha } num arquivo, criada só no Staging).
// --rota: testa também a rota no ar em marcon-staging.vercel.app (depois do deploy do Staging).
// Nada de senha nem token na tela. Recusa rodar fora do Staging. Cria produtos "TESTE venda rápida"
// e cancela as vendas no fim (estoque volta, caixa estorna).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enviarVenda } from "../src/venda.ts";

const REF_STAGING = "odgvhqwqyxtnaxgqiynb";
const BASE = "https://marcon-staging.vercel.app";
const [arquivoEnv, arquivoB] = process.argv.slice(2);
const comRota = process.argv.includes("--rota");
if (!arquivoEnv || !arquivoB) throw new Error("Passe o .env.staging e o arquivo da conta B.");
const env: Record<string, string> = {};
for (const l of readFileSync(arquivoEnv, "utf8").split(/\r?\n/)) {
  const m = l.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|STAGING_TESTE_EMAIL|STAGING_TESTE_SENHA)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${REF_STAGING}.supabase.co`) throw new Error("Não é o Staging. Parei.");
const contaB = JSON.parse(readFileSync(arquivoB, "utf8")) as { email: string; senha: string };

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

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const vendasCriadas: { db: SupabaseClient; id: string }[] = [];
const produtosCriados: { db: SupabaseClient; id: string }[] = [];

function vender(db: SupabaseClient, chave: string, produto: string, quantidade: number, preco = 12.5) {
  return db.rpc("registrar_venda_unica", {
    p_chave: chave,
    p_cliente_id: null,
    p_cliente_nome: "TESTE venda rápida",
    p_itens: [{ produto_id: produto, variacao_id: null, quantidade, preco_unitario: preco }],
    p_desconto: 0,
    p_tipo_pagamento: "a_vista",
    p_forma_pagamento: null,
    p_canal: null,
    p_data: hoje,
  });
}

async function novoProduto(db: SupabaseClient, estoque: number): Promise<string> {
  const { data: u } = await db.auth.getUser();
  const { data, error } = await db
    .from("produtos")
    .insert({ owner_id: u.user?.id, nome: `TESTE venda rápida ${Date.now()}`, preco_varejo: 12.5, custo: 5, estoque_atual: estoque, status: "ativo" })
    .select("id")
    .single();
  if (error) throw new Error(`não criou produto: ${error.message}`);
  produtosCriados.push({ db, id: data.id });
  return data.id as string;
}

async function estoque(db: SupabaseClient, id: string) {
  const { data } = await db.from("produtos").select("estoque_atual").eq("id", id).single();
  return data?.estoque_atual as number;
}

const a = cliente();
const b = cliente();
const semLogin = cliente();
let prodA = "";
let prodB = "";
let vendaA = "";
const K1 = randomUUID();

await caso("sem login a venda é recusada", async () => {
  const { error } = await vender(semLogin, randomUUID(), randomUUID(), 1);
  assert.ok(error, "sem erro");
});

await caso("login das contas A e B", async () => {
  const ra = await a.auth.signInWithPassword({ email: env.STAGING_TESTE_EMAIL, password: env.STAGING_TESTE_SENHA });
  assert.equal(ra.error, null);
  const rb = await b.auth.signInWithPassword({ email: contaB.email, password: contaB.senha });
  assert.equal(rb.error, null);
  prodA = await novoProduto(a, 5);
  prodB = await novoProduto(b, 5);
});

await caso("vender cria a venda, baixa o estoque e lança no caixa", async () => {
  const { data, error } = await vender(a, K1, prodA, 2);
  assert.equal(error, null, error?.message);
  const r = data as { venda_id: string; recibo_token: string; criada: boolean };
  assert.equal(r.criada, true);
  assert.ok(r.recibo_token);
  vendaA = r.venda_id;
  vendasCriadas.push({ db: a, id: vendaA });
  assert.equal(await estoque(a, prodA), 3);
  const { data: venda } = await a.from("vendas").select("valor_total, data, chave_idempotencia, recibo_token").eq("id", vendaA).single();
  assert.equal(Number(venda?.valor_total), 25);
  assert.equal(venda?.data, hoje, "data no fuso do Brasil");
  assert.equal(venda?.chave_idempotencia, K1);
  assert.equal(venda?.recibo_token, r.recibo_token);
  const { data: caixa } = await a.from("lancamentos_caixa").select("tipo, valor").eq("venda_id", vendaA);
  assert.equal(caixa?.length, 1);
  assert.equal(caixa?.[0].tipo, "entrada");
  assert.equal(Number(caixa?.[0].valor), 25);
});

await caso("repetir a mesma chave devolve a mesma venda e não duplica", async () => {
  const { data, error } = await vender(a, K1, prodA, 2);
  assert.equal(error, null, error?.message);
  const r = data as { venda_id: string; criada: boolean };
  assert.equal(r.criada, false);
  assert.equal(r.venda_id, vendaA);
  assert.equal(await estoque(a, prodA), 3, "estoque baixou de novo");
  const { count } = await a.from("vendas").select("id", { count: "exact", head: true }).eq("chave_idempotencia", K1);
  assert.equal(count, 1);
  const { data: caixa } = await a.from("lancamentos_caixa").select("id").eq("venda_id", vendaA);
  assert.equal(caixa?.length, 1, "caixa duplicou");
});

await caso("três chamadas ao mesmo tempo com a mesma chave viram uma venda só", async () => {
  const k = randomUUID();
  const rs = await Promise.all([vender(a, k, prodA, 1), vender(a, k, prodA, 1), vender(a, k, prodA, 1)]);
  for (const r of rs) assert.equal(r.error, null, r.error?.message);
  const ids = new Set(rs.map((r) => (r.data as { venda_id: string }).venda_id));
  assert.equal(ids.size, 1);
  assert.equal(rs.filter((r) => (r.data as { criada: boolean }).criada).length, 1);
  vendasCriadas.push({ db: a, id: [...ids][0] });
  assert.equal(await estoque(a, prodA), 2);
});

await caso("estoque insuficiente é recusado com mensagem clara e não baixa nada", async () => {
  const { error } = await vender(a, randomUUID(), prodA, 999);
  assert.match(error?.message ?? "", /estoque insuficiente/i);
  assert.equal(await estoque(a, prodA), 2);
});

await caso("conta B não usa produto da A", async () => {
  const { error } = await vender(b, randomUUID(), prodA, 1);
  assert.match(error?.message ?? "", /produto não encontrado/i);
  assert.equal(await estoque(a, prodA), 2);
});

await caso("conta B com a chave da A cria a venda dela, sem ver a da A", async () => {
  const { data, error } = await vender(b, K1, prodB, 1);
  assert.equal(error, null, error?.message);
  const r = data as { venda_id: string; criada: boolean };
  assert.equal(r.criada, true);
  assert.notEqual(r.venda_id, vendaA);
  vendasCriadas.push({ db: b, id: r.venda_id });
  const { data: daA } = await b.from("vendas").select("id").eq("id", vendaA);
  assert.equal(daA?.length, 0, "B viu a venda da A");
  const { count } = await a.from("vendas").select("id", { count: "exact", head: true }).eq("chave_idempotencia", K1);
  assert.equal(count, 1, "a venda da A mudou");
});

await caso("chave nula é recusada", async () => {
  const { error } = await a.rpc("registrar_venda_unica", {
    p_chave: null,
    p_cliente_id: null,
    p_cliente_nome: null,
    p_itens: [{ produto_id: prodA, variacao_id: null, quantidade: 1, preco_unitario: 1 }],
    p_desconto: 0,
    p_tipo_pagamento: "a_vista",
    p_forma_pagamento: null,
    p_canal: null,
  });
  assert.match(error?.message ?? "", /chave/);
});

if (comRota) {
  const rota = `${BASE}/api/extensao/venda`;
  const corpo = (chave: string, quantidade = 1) => ({
    chave,
    itens: [{ produto_id: prodA, variacao_id: null, quantidade, preco_unitario: 12.5 }],
    formaPagamentoId: null,
    canalId: null,
    clienteId: null,
    clienteNome: "TESTE rota",
  });

  await caso("rota: sem token recusa (401)", async () => {
    const r = await fetch(rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo(randomUUID())) });
    assert.equal(r.status, 401);
  });
  await caso("rota: token falso recusa (401)", async () => {
    const r = await fetch(rota, { method: "POST", headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.falsofalsofalso", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 401);
  });
  await caso("rota: outro site recusa (403) e o CORS só libera a extensão", async () => {
    const r = await fetch(rota, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    const pre = await fetch(rota, { method: "OPTIONS", headers: { Origin: "chrome-extension://paecegdlhpfepcjinghnhgghpkidpfna", "Access-Control-Request-Method": "POST" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "chrome-extension://paecegdlhpfepcjinghnhgghpkidpfna");
    const preMau = await fetch(rota, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    assert.equal(preMau.headers.get("access-control-allow-origin"), null);
  });
  await caso("rota: pedido fora do formato recusa (400)", async () => {
    const token = (await a.auth.getSession()).data.session!.access_token;
    const r = await fetch(rota, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo(randomUUID()), itens: [] }) });
    assert.equal(r.status, 400);
  });
  await caso("rota: vende pela extensão e repetir não duplica", async () => {
    const k = randomUUID();
    const r1 = await enviarVenda(a, BASE, corpo(k));
    assert.ok(r1.ok, r1.ok ? "" : r1.erro);
    if (!r1.ok) return;
    assert.equal(r1.dados.criada, true);
    assert.equal(r1.dados.total, 12.5);
    vendasCriadas.push({ db: a, id: r1.dados.vendaId });
    const r2 = await enviarVenda(a, BASE, corpo(k));
    assert.ok(r2.ok && r2.dados.vendaId === r1.dados.vendaId && r2.dados.criada === false);
    assert.equal(await estoque(a, prodA), 1);
    const recibo = await fetch(`${BASE}/r/${r1.dados.reciboToken}`);
    assert.equal(recibo.status, 200, "recibo não abriu");
  });
  await caso("rota: estoque insuficiente volta claro", async () => {
    const r = await enviarVenda(a, BASE, corpo(randomUUID(), 999));
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.erro, /Estoque insuficiente.*encomenda pelo app/);
  });
  await caso("rota: conta B não vende produto da A", async () => {
    const r = await enviarVenda(b, BASE, corpo(randomUUID()));
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.erro, /produto não encontrado/i);
  });
}

// limpeza: cancela as vendas (estoque volta, caixa estorna) e tenta tirar os produtos de teste
for (const v of vendasCriadas) {
  const { error } = await v.db.rpc("cancelar_venda", { p_venda_id: v.id });
  if (error) console.log(`aviso: não cancelou uma venda de teste: ${error.message}`);
}
for (const p of produtosCriados) {
  const { error } = await p.db.from("produtos").update({ status: "inativo" }).eq("id", p.id);
  if (error) console.log(`aviso: não inativou um produto de teste: ${error.message}`);
}
await a.auth.signOut({ scope: "local" });
await b.auth.signOut({ scope: "local" });

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
