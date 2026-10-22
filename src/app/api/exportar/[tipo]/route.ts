import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";

// Exporta os dados do próprio usuário em CSV para abrir no Excel (separador ";" e vírgula decimal, como no Brasil).
// O RLS já limita tudo ao dono; sem sessão, 401.
type Celula = string | number | null | undefined;
type Pagina = (de: number, ate: number) => PromiseLike<{ data: Record<string, unknown>[] | null }>;

interface Exportacao {
  arquivo: string;
  colunas: string[];
  buscar: Pagina;
  linha: (r: Record<string, unknown>) => Celula[];
}

const TEXTO = (v: unknown) => (v == null ? "" : String(v));

function celula(v: Celula) {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  // texto que começa com = + - @ viraria fórmula no Excel: o apóstrofo trava isso
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/exportar/[tipo]">) {
  const { tipo } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Faça login para exportar.", { status: 401 });

  const tipos: Record<string, Exportacao> = {
    produtos: {
      arquivo: "produtos",
      colunas: ["Nome", "Categoria", "Marca", "SKU", "Unidade", "Custo", "Preço de venda", "Preço de atacado", "Estoque", "Situação"],
      buscar: (de, ate) => supabase.from("produtos_com_estoque").select("*, categorias(nome)").order("nome").order("id").range(de, ate),
      linha: (p) => [
        TEXTO(p.nome),
        TEXTO((p.categorias as { nome?: string } | null)?.nome),
        TEXTO(p.marca),
        TEXTO(p.sku),
        TEXTO(p.unidade_medida),
        Number(p.custo_min),
        Number(p.preco_varejo),
        p.preco_atacado == null ? null : Number(p.preco_atacado),
        Number(p.estoque_total),
        TEXTO(p.status),
      ],
    },
    vendas: {
      arquivo: "vendas",
      colunas: ["Data", "Cliente", "Canal", "Pagamento", "Tipo", "Total", "Desconto", "Custo", "Lucro", "Situação"],
      buscar: (de, ate) => supabase.from("vendas").select("*").order("data", { ascending: false }).order("id").range(de, ate),
      linha: (v) => [
        TEXTO(v.data),
        TEXTO(v.cliente_nome),
        TEXTO(v.canal),
        TEXTO(v.forma_pagamento),
        v.tipo_pagamento === "a_prazo" ? "A prazo" : "À vista",
        Number(v.valor_total),
        Number(v.desconto ?? 0),
        Number(v.custo_total),
        Number(v.valor_total) - Number(v.custo_total),
        v.status === "cancelada" ? "Cancelada" : "Concluída",
      ],
    },
    clientes: {
      arquivo: "clientes",
      colunas: ["Nome", "Telefone", "E-mail", "CPF/CNPJ", "Observações"],
      buscar: (de, ate) => supabase.from("clientes").select("*").order("nome").order("id").range(de, ate),
      linha: (c) => [TEXTO(c.nome), TEXTO(c.telefone), TEXTO(c.email), TEXTO(c.cpf_cnpj), TEXTO(c.observacoes)],
    },
    caixa: {
      arquivo: "caixa",
      colunas: ["Data", "Tipo", "Categoria", "Descrição", "Valor"],
      buscar: (de, ate) => supabase.from("lancamentos_caixa").select("*").eq("afeta_caixa", true).order("data", { ascending: false }).order("id").range(de, ate),
      linha: (l) => [TEXTO(l.data), l.tipo === "entrada" ? "Entrada" : "Saída", TEXTO(l.categoria), TEXTO(l.descricao), Number(l.valor)],
    },
  };

  const ex = tipos[tipo];
  if (!ex) return new Response("Exportação desconhecida.", { status: 404 });

  // o banco devolve no máximo 1000 linhas por consulta: lê em páginas
  const linhas: string[] = [ex.colunas.map(celula).join(";")];
  for (let de = 0; de < 100_000; de += 1000) {
    const { data } = await ex.buscar(de, de + 999);
    for (const r of data ?? []) linhas.push(ex.linha(r).map(celula).join(";"));
    if ((data?.length ?? 0) < 1000) break;
  }

  // BOM no começo para o Excel reconhecer os acentos
  return new Response("\uFEFF" + linhas.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marcon-${ex.arquivo}-${hojeISO()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
