import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeISO, somarDias } from "@/lib/format";

// Ferramentas que o assistente pode chamar. REGRA DE SEGURANÇA: o servidor passa o owner (dono da
// conta, descoberto pelo telefone vinculado) e toda consulta filtra por ele. O modelo nunca escolhe
// de quem são os dados e só tem ferramentas de leitura. Aqui usamos a chave de serviço (ignora o RLS),
// então um .eq("owner_id", owner) esquecido vazaria dados de outra conta: toda consulta tem que ter.

type Db = NonNullable<ReturnType<typeof createAdminClient>>;
type Entrada = Record<string, unknown>;

export const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_produtos",
    description:
      "Procura produtos do vendedor pelo nome, marca ou código. Devolve estoque, preço de venda e custo, e as variações (cor, tamanho) quando houver.",
    input_schema: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Parte do nome, marca ou SKU. Ex.: panela, mouse, kz" },
        limite: { type: "integer", description: "Máximo de produtos (padrão 8, máximo 15)" },
      },
      required: ["busca"],
    },
  },
  {
    name: "produtos_por_estoque",
    description: "Lista os produtos pelo estoque: os que mais têm ou os que estão zerados ou acabando.",
    input_schema: {
      type: "object",
      properties: {
        ordem: {
          type: "string",
          enum: ["mais", "menos", "zerados"],
          description: "mais = maiores estoques, menos = menores estoques acima de zero, zerados = sem estoque",
        },
        limite: { type: "integer", description: "Máximo de produtos (padrão 5, máximo 15)" },
      },
      required: ["ordem"],
    },
  },
  {
    name: "resumo_do_estoque",
    description: "Totais do estoque: quantidade de produtos, de unidades e quanto custou o estoque parado.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "resumo_de_vendas",
    description:
      "Soma as vendas concluídas de um período: quantidade de vendas, valor vendido e lucro (valor menos o custo dos itens).",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Primeiro dia, AAAA-MM-DD" },
        ate: { type: "string", description: "Último dia, AAAA-MM-DD (inclusive)" },
      },
      required: ["de", "ate"],
    },
  },
];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function limite(v: unknown, padrao: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 15) : padrao;
}

// o texto do vendedor entra em um filtro do PostgREST: tira o que muda o sentido dele
function termo(v: unknown) {
  return String(v ?? "")
    .replace(/[%_,()*\\]/g, " ")
    .trim()
    .slice(0, 60);
}

interface LinhaProduto {
  id: string;
  nome: string;
  marca: string | null;
  estoque_total: number;
  preco_varejo: number;
  custo: number;
  tem_variacoes: boolean;
}

async function comVariacoes(db: Db, owner: string, produtos: LinhaProduto[]) {
  const ids = produtos.filter((p) => p.tem_variacoes).map((p) => p.id);
  const porProduto = new Map<string, { variacao: string; estoque: number; preco: number | null }[]>();
  if (ids.length) {
    const { data } = await db
      .from("produto_variacoes")
      .select("produto_id, nome_combinacao, estoque, preco_venda")
      .eq("owner_id", owner)
      .in("produto_id", ids);
    for (const v of data ?? []) {
      const lista = porProduto.get(v.produto_id) ?? [];
      lista.push({ variacao: v.nome_combinacao, estoque: v.estoque, preco: v.preco_venda == null ? null : Number(v.preco_venda) });
      porProduto.set(v.produto_id, lista);
    }
  }
  return produtos.map((p) => ({
    nome: p.nome,
    marca: p.marca,
    estoque: p.estoque_total,
    preco: Number(p.preco_varejo),
    custo: Number(p.custo),
    variacoes: porProduto.get(p.id),
  }));
}

const COLUNAS = "id, nome, marca, estoque_total, preco_varejo, custo, tem_variacoes";

export async function executarFerramenta(nome: string, entrada: Entrada, owner: string): Promise<unknown> {
  const db = createAdminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");

  switch (nome) {
    case "buscar_produtos": {
      const t = termo(entrada.busca);
      if (!t) return { erro: "Diga o que procurar" };
      const { data, error } = await db
        .from("produtos_com_estoque")
        .select(COLUNAS)
        .eq("owner_id", owner)
        .eq("status", "ativo")
        .or(`nome.ilike.%${t}%,marca.ilike.%${t}%,sku.ilike.%${t}%`)
        .order("nome")
        .limit(limite(entrada.limite, 8));
      if (error) throw error;
      return { produtos: await comVariacoes(db, owner, (data ?? []) as LinhaProduto[]) };
    }

    case "produtos_por_estoque": {
      const ordem = entrada.ordem;
      let q = db.from("produtos_com_estoque").select(COLUNAS).eq("owner_id", owner).eq("status", "ativo");
      if (ordem === "zerados") q = q.lte("estoque_total", 0).order("nome");
      else if (ordem === "menos") q = q.gt("estoque_total", 0).order("estoque_total", { ascending: true });
      else q = q.order("estoque_total", { ascending: false });
      const { data, error } = await q.limit(limite(entrada.limite, 5));
      if (error) throw error;
      return { produtos: await comVariacoes(db, owner, (data ?? []) as LinhaProduto[]) };
    }

    case "resumo_do_estoque": {
      const { data, error } = await db
        .from("produtos_com_estoque")
        .select("estoque_total, valor_estoque")
        .eq("owner_id", owner)
        .eq("status", "ativo");
      if (error) throw error;
      const lista = data ?? [];
      return {
        produtos: lista.length,
        unidades: lista.reduce((s, p) => s + Math.max(0, Number(p.estoque_total)), 0),
        custoDoEstoque: Math.round(lista.reduce((s, p) => s + Number(p.valor_estoque ?? 0), 0) * 100) / 100,
        semEstoque: lista.filter((p) => Number(p.estoque_total) <= 0).length,
      };
    }

    case "resumo_de_vendas": {
      const de = String(entrada.de ?? "");
      const ate = String(entrada.ate ?? "");
      if (!DATA.test(de) || !DATA.test(ate)) return { erro: "Datas inválidas, use AAAA-MM-DD" };
      // trava o intervalo: 2 anos no máximo, como nas telas do app
      const inicio = de < somarDias(ate, -730) ? somarDias(ate, -730) : de;
      const { data, error } = await db
        .from("vendas")
        .select("valor_total, custo_total")
        .eq("owner_id", owner)
        .eq("status", "concluida")
        .gte("data", inicio)
        .lte("data", ate)
        .limit(5000);
      if (error) throw error;
      const lista = data ?? [];
      const vendido = lista.reduce((s, v) => s + Number(v.valor_total), 0);
      const custo = lista.reduce((s, v) => s + Number(v.custo_total), 0);
      return {
        de: inicio,
        ate,
        vendas: lista.length,
        valorVendido: Math.round(vendido * 100) / 100,
        lucro: Math.round((vendido - custo) * 100) / 100,
      };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

export function hojeParaOModelo() {
  return hojeISO();
}
