import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, somarDias } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { EmptyState, ErrorMessage, PageHeader } from "@/components/ui";
import { ListaReposicao, type GrupoReposicao } from "./lista-reposicao";

export const metadata: Metadata = { title: "Repor estoque" };

const PAGINA = 1000;

export default async function ReposicaoPage() {
  const supabase = await createClient();
  const desde = somarDias(hojeISO(), -30);

  const [produtosRes, fornecedoresRes] = await Promise.all([
    supabase
      .from("produtos_com_estoque")
      .select("id, nome, fornecedor_id, fornecedor_nome, estoque_total, alerta_estoque_baixo")
      .eq("status", "ativo")
      .order("nome")
      .limit(5000),
    supabase.from("fornecedores").select("id, nome, telefone"),
  ]);

  // o PostgREST corta em 1000 linhas: lê as vendas dos últimos 30 dias página a página
  const vendidos = new Map<string, number>();
  let erroVendas: string | null = null;
  for (let de = 0; de < 50 * PAGINA; de += PAGINA) {
    const { data, error } = await supabase
      .from("venda_itens")
      .select("produto_id, quantidade, vendas!inner(data, status)")
      .gte("vendas.data", desde)
      .neq("vendas.status", "cancelada")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) {
      erroVendas = error.message;
      break;
    }
    for (const it of data ?? []) {
      if (it.produto_id) vendidos.set(it.produto_id, (vendidos.get(it.produto_id) ?? 0) + Number(it.quantidade));
    }
    if (!data || data.length < PAGINA) break;
  }

  const erro = produtosRes.error?.message ?? fornecedoresRes.error?.message ?? erroVendas;
  if (erro) {
    return (
      <div>
        <PageHeader title="Repor estoque" back={{ href: "/fornecedores", label: "Fornecedores" }} />
        <ErrorMessage>Não foi possível montar a lista: {erro}</ErrorMessage>
      </div>
    );
  }

  const fornecedores = new Map((fornecedoresRes.data ?? []).map((f) => [f.id as string, f]));
  const grupos = new Map<string, GrupoReposicao>();

  for (const p of produtosRes.data ?? []) {
    const estoque = Number(p.estoque_total);
    const alerta = p.alerta_estoque_baixo as number | null;
    if (situacaoEstoque({ estoque_total: estoque, alerta_estoque_baixo: alerta }) === "ok") continue;

    const vendido30 = vendidos.get(p.id as string) ?? 0;
    // repõe o que se vende em 30 dias (ou o dobro do alerta, se vendeu menos) menos o que sobrou
    const sugestao = Math.max(Math.max(vendido30, (alerta ?? 0) * 2) - Math.max(estoque, 0), 1);

    const f = p.fornecedor_id ? fornecedores.get(p.fornecedor_id as string) : undefined;
    const nomeManual = (p.fornecedor_nome as string | null)?.trim();
    const chave = f ? f.id : nomeManual ? `nome:${nomeManual.toLowerCase()}` : "sem";
    const grupo: GrupoReposicao =
      grupos.get(chave) ?? {
        chave,
        fornecedorId: f ? (f.id as string) : null,
        nome: f ? (f.nome as string) : (nomeManual ?? "Sem fornecedor"),
        telefone: f ? ((f.telefone as string | null) ?? null) : null,
        itens: [],
      };
    grupo.itens.push({ id: p.id as string, nome: p.nome as string, estoque, vendido30, sugestao });
    grupos.set(chave, grupo);
  }

  // fornecedor com mais itens acabando primeiro; "Sem fornecedor" por último
  const lista = [...grupos.values()].sort(
    (a, b) => (a.chave === "sem" ? 1 : 0) - (b.chave === "sem" ? 1 : 0) || b.itens.length - a.itens.length || a.nome.localeCompare(b.nome),
  );

  return (
    <div>
      <PageHeader title="Repor estoque" back={{ href: "/fornecedores", label: "Fornecedores" }} />
      {lista.length === 0 ? (
        <EmptyState
          title="Nada acabando"
          description="Produto acabando ou zerado aparece aqui, já com a quantidade pra repor."
        />
      ) : (
        <ListaReposicao grupos={lista} />
      )}
    </div>
  );
}
