// Busca de produtos do dono. Recebe o cliente Supabase já logado (RLS por owner_id vale como no site).
// Separada do service worker para dar para testar contra o Staging (teste/busca-staging.mjs).
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkDoProduto, termoSeguro, type ProdutoBusca } from "./formatar.ts";
import type { Resposta } from "./mensagens.ts";


interface LinhaProduto {
  id: string;
  nome: string;
  marca: string | null;
  sku: string | null;
  codigo_barras: string | null;
  preco_varejo: number | string;
  estoque_atual: number;
  tem_variacoes: boolean;
  na_vitrine: boolean;
  produto_variacoes: { id: string; nome_combinacao: string; preco_venda: number | string | null; estoque: number; sku: string | null; created_at: string }[];
}

const CAMPOS =
  "id, nome, marca, sku, codigo_barras, preco_varejo, estoque_atual, tem_variacoes, na_vitrine, produto_variacoes(id, nome_combinacao, preco_venda, estoque, sku, created_at)";

// Produtos com link que vale: os que a própria vitrine pública devolve (vitrine ativa, plano pago
// ou teste, produto na vitrine e ativo). Guardado por 2 minutos para não pesar a cada tecla.
let cacheVitrine: { ate: number; slug: string | null; ids: Set<string> } | null = null;
export function esquecerVitrine() {
  cacheVitrine = null;
}

// Com erro de rede ou do banco, não guarda nada: devolve sem link e com conferida = false, para o
// painel não afirmar que a loja está fora do ar.
async function produtosComLink(db: SupabaseClient): Promise<{ slug: string | null; ids: Set<string>; conferida: boolean }> {
  if (cacheVitrine && cacheVitrine.ate > Date.now()) return { ...cacheVitrine, conferida: true };
  let slug: string | null = null;
  const ids = new Set<string>();
  const semConferir = { slug: null, ids: new Set<string>(), conferida: false };
  const { data: vt, error: erroVitrine } = await db.from("vitrines").select("slug, ativa").maybeSingle();
  if (erroVitrine) return semConferir;
  if (vt?.ativa && vt.slug) {
    const { data, error } = await db.rpc("vitrine_publica", { p_slug: vt.slug });
    if (error) return semConferir;
    const lista = (data as { produtos?: { id: string }[] } | null)?.produtos ?? [];
    if (lista.length > 0) {
      slug = vt.slug;
      for (const p of lista) ids.add(p.id);
    }
  }
  cacheVitrine = { ate: Date.now() + 2 * 60 * 1000, slug, ids };
  return { ...cacheVitrine, conferida: true };
}

interface Capa {
  url: string;
  path: string;
  total: number;
}

async function capas(db: SupabaseClient, ids: string[]): Promise<Map<string, Capa>> {
  const capas = new Map<string, Capa>();
  if (ids.length === 0) return capas;
  const { data } = await db.from("produto_capas").select("produto_id, path, total_fotos").in("produto_id", ids);
  const caminhos = [...new Set((data ?? []).map((c) => c.path as string))];
  if (caminhos.length === 0) return capas;
  const { data: assinadas } = await db.storage.from("produto-fotos").createSignedUrls(caminhos, 3600);
  const porCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  for (const c of data ?? []) {
    const url = porCaminho.get(c.path as string);
    if (url) capas.set(c.produto_id as string, { url, path: c.path as string, total: Number(c.total_fotos) || 1 });
  }
  return capas;
}

export async function buscarProdutos(db: SupabaseClient, bruto: string, baseLoja: string): Promise<Resposta<ProdutoBusca[]>> {
  const termo = termoSeguro(bruto);
  if (termo.length < 2) return { ok: true, dados: [] };
  const { data: sessao } = await db.auth.getSession();
  if (!sessao.session) return { ok: false, erro: "Sua sessão acabou. Entre de novo." };

  // Cada palavra tem de aparecer em nome, marca, SKU ou código de barras (ilike).
  let consulta = db.from("produtos").select(CAMPOS).eq("status", "ativo");
  for (const palavra of termo.split(" ")) {
    const p = `%${palavra}%`;
    consulta = consulta.or(`nome.ilike.${p},marca.ilike.${p},sku.ilike.${p},codigo_barras.ilike.${p}`);
  }
  const [principal, porVariacao] = await Promise.all([
    consulta.order("nome").limit(20),
    db.from("produto_variacoes").select("produto_id").ilike("sku", `%${termo}%`).limit(20),
  ]);
  if (principal.error) return { ok: false, erro: "Não deu para buscar agora. Tente de novo." };

  const linhas = (principal.data ?? []) as unknown as LinhaProduto[];
  const achados = new Set(linhas.map((l) => l.id));
  const faltam = [...new Set((porVariacao.data ?? []).map((v) => v.produto_id as string))].filter((id) => !achados.has(id));
  if (faltam.length > 0) {
    const { data } = await db.from("produtos").select(CAMPOS).eq("status", "ativo").in("id", faltam);
    linhas.push(...((data ?? []) as unknown as LinhaProduto[]));
  }

  const ids = linhas.map((l) => l.id);
  const [fotos, vitrine] = await Promise.all([capas(db, ids), produtosComLink(db)]);

  const dados: ProdutoBusca[] = linhas.map((l) => {
    const preco = Number(l.preco_varejo) || 0;
    const variacoes = l.tem_variacoes
      ? [...(l.produto_variacoes ?? [])]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((v) => ({
            id: v.id,
            nome: v.nome_combinacao,
            preco: v.preco_venda === null || v.preco_venda === "" ? preco : Number(v.preco_venda),
            estoque: v.estoque,
            sku: v.sku,
          }))
      : [];
    return {
      id: l.id,
      nome: l.nome,
      marca: l.marca,
      sku: l.sku,
      codigoBarras: l.codigo_barras,
      preco,
      estoque: l.estoque_atual,
      naVitrine: l.na_vitrine,
      vitrineConferida: vitrine.conferida,
      capa: fotos.get(l.id)?.url ?? null,
      capaPath: fotos.get(l.id)?.path ?? null,
      totalFotos: fotos.get(l.id)?.total ?? 0,
      variacoes,
      link: vitrine.slug && vitrine.ids.has(l.id) ? linkDoProduto(baseLoja, vitrine.slug, l.id) : null,
    };
  });
  return { ok: true, dados };
}
