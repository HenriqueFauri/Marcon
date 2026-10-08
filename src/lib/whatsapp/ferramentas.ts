import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeISO, somarDias } from "@/lib/format";
import { prepararVenda } from "./venda";

// Ferramentas que o assistente pode chamar. REGRA DE SEGURANÇA: o servidor passa o owner (dono da
// conta, descoberto pelo telefone vinculado) e toda consulta filtra por ele. O modelo nunca escolhe
// de quem são os dados e só tem ferramentas de leitura. Aqui usamos a chave de serviço (ignora o RLS),
// então um .eq("owner_id", owner) esquecido vazaria dados de outra conta: toda consulta tem que ter.

export interface Contexto {
  owner: string;
  telefone: string;
  escrita: boolean; // conta liberada para lançar venda
}

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
  {
    name: "produtos_vendidos",
    description:
      "Lista os produtos vendidos em um período, do mais vendido ao menos, com unidades, valor e lucro de cada um. Só vendas concluídas.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Primeiro dia, AAAA-MM-DD" },
        ate: { type: "string", description: "Último dia, AAAA-MM-DD (inclusive)" },
        limite: { type: "integer", description: "Máximo de produtos na lista (padrão 15, máximo 30)" },
      },
      required: ["de", "ate"],
    },
  },
  {
    name: "contas_a_receber",
    description:
      "Vendas a prazo que ainda não foram pagas (parcelas abertas): quanto há a receber, quanto está atrasado e quem deve. Pode filtrar por cliente e por vencimento.",
    input_schema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Parte do nome do cliente (opcional)" },
        ate: { type: "string", description: "Só parcelas que vencem até esta data, AAAA-MM-DD (opcional)" },
        limite: { type: "integer", description: "Máximo de parcelas na lista (padrão 10, máximo 20)" },
      },
    },
  },
  {
    name: "caixa_do_periodo",
    description:
      "Fluxo de caixa: entradas, saídas, resultado do período, as maiores categorias de saída e o saldo em caixa até hoje.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Primeiro dia, AAAA-MM-DD" },
        ate: { type: "string", description: "Último dia, AAAA-MM-DD (inclusive)" },
      },
      required: ["de", "ate"],
    },
  },
  {
    name: "vendas_por_recorte",
    description:
      "Vendas concluídas de um período separadas por canal de venda, forma de pagamento ou cliente, com quantidade, valor e lucro de cada grupo.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Primeiro dia, AAAA-MM-DD" },
        ate: { type: "string", description: "Último dia, AAAA-MM-DD (inclusive)" },
        por: { type: "string", enum: ["canal", "pagamento", "cliente"], description: "Como agrupar" },
        limite: { type: "integer", description: "Máximo de grupos (padrão 10, máximo 20)" },
      },
      required: ["de", "ate", "por"],
    },
  },
  {
    name: "pedidos_da_vitrine",
    description:
      "Pedidos recebidos pela vitrine online (link da loja). Por padrão os novos, que ainda não viraram venda nem foram descartados.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["novo", "vendido", "descartado"], description: "Padrão: novo" },
        limite: { type: "integer", description: "Máximo de pedidos (padrão 5, máximo 10)" },
      },
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

export async function executarFerramenta(nome: string, entrada: Entrada, ctx: Contexto): Promise<unknown> {
  const owner = ctx.owner;
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

    case "produtos_vendidos": {
      const de = String(entrada.de ?? "");
      const ate = String(entrada.ate ?? "");
      if (!DATA.test(de) || !DATA.test(ate)) return { erro: "Datas inválidas, use AAAA-MM-DD" };
      const inicio = de < somarDias(ate, -730) ? somarDias(ate, -730) : de;
      const { data, error } = await db
        .from("venda_itens")
        .select("produto_nome, quantidade, preco_unitario, custo_unitario, vendas!inner(data, status)")
        .eq("owner_id", owner)
        .eq("vendas.status", "concluida")
        .gte("vendas.data", inicio)
        .lte("vendas.data", ate)
        .limit(10000);
      if (error) throw error;
      const por = new Map<string, { produto: string; unidades: number; valor: number; lucro: number }>();
      for (const i of data ?? []) {
        const linha = por.get(i.produto_nome) ?? { produto: i.produto_nome, unidades: 0, valor: 0, lucro: 0 };
        linha.unidades += Number(i.quantidade);
        linha.valor += Number(i.quantidade) * Number(i.preco_unitario);
        linha.lucro += Number(i.quantidade) * (Number(i.preco_unitario) - Number(i.custo_unitario));
        por.set(i.produto_nome, linha);
      }
      const max = Math.min(Math.max(Math.floor(Number(entrada.limite)) || 15, 1), 30);
      const lista = [...por.values()]
        .sort((a, b) => b.unidades - a.unidades || b.valor - a.valor)
        .slice(0, max)
        .map((l) => ({ ...l, valor: Math.round(l.valor * 100) / 100, lucro: Math.round(l.lucro * 100) / 100 }));
      return { de: inicio, ate, produtosDiferentes: por.size, produtos: lista };
    }

    case "contas_a_receber": {
      const t = termo(entrada.cliente);
      const ate = String(entrada.ate ?? "");
      let q = db
        .from("parcelas")
        .select("valor, vencimento, numero_parcela, vendas!inner(cliente_nome)")
        .eq("owner_id", owner)
        .neq("status", "pago")
        .order("vencimento", { ascending: true })
        .limit(5000);
      if (t) q = q.ilike("vendas.cliente_nome", `%${t}%`);
      if (DATA.test(ate)) q = q.lte("vencimento", ate);
      const { data, error } = await q;
      if (error) throw error;
      const hoje = hojeISO();
      const lista = data ?? [];
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const nomeDe = (p: { vendas: unknown }) =>
        (p.vendas as { cliente_nome: string | null } | null)?.cliente_nome || "Sem nome";
      const atrasadas = lista.filter((p) => p.vencimento < hoje);
      const porCliente = new Map<string, number>();
      for (const p of lista) porCliente.set(nomeDe(p), (porCliente.get(nomeDe(p)) ?? 0) + Number(p.valor));
      return {
        hoje,
        parcelasEmAberto: lista.length,
        totalAReceber: r2(lista.reduce((s, p) => s + Number(p.valor), 0)),
        totalAtrasado: r2(atrasadas.reduce((s, p) => s + Number(p.valor), 0)),
        quemDeve: [...porCliente.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([cliente, valor]) => ({ cliente, valor: r2(valor) })),
        proximasParcelas: lista.slice(0, Math.min(Math.max(Math.floor(Number(entrada.limite)) || 10, 1), 20)).map((p) => ({
          cliente: nomeDe(p),
          valor: Number(p.valor),
          vencimento: p.vencimento,
          atrasada: p.vencimento < hoje,
        })),
      };
    }

    case "caixa_do_periodo": {
      const de = String(entrada.de ?? "");
      const ate = String(entrada.ate ?? "");
      if (!DATA.test(de) || !DATA.test(ate)) return { erro: "Datas inválidas, use AAAA-MM-DD" };
      const inicio = de < somarDias(ate, -730) ? somarDias(ate, -730) : de;
      const [periodo, acumulado] = await Promise.all([
        db.from("lancamentos_caixa").select("tipo, valor, categoria").eq("owner_id", owner).gte("data", inicio).lte("data", ate).limit(10000),
        // saldo em caixa: o que já aconteceu até hoje e conta no caixa (mesma regra da tela)
        db.from("lancamentos_caixa").select("tipo, valor").eq("owner_id", owner).eq("afeta_caixa", true).lte("data", hojeISO()).limit(50000),
      ]);
      if (periodo.error) throw periodo.error;
      if (acumulado.error) throw acumulado.error;
      let entradas = 0;
      let saidas = 0;
      const categorias = new Map<string, number>();
      for (const l of periodo.data ?? []) {
        if (l.tipo === "entrada") entradas += Number(l.valor);
        else {
          saidas += Number(l.valor);
          categorias.set(l.categoria, (categorias.get(l.categoria) ?? 0) + Number(l.valor));
        }
      }
      const saldo = (acumulado.data ?? []).reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      return {
        de: inicio,
        ate,
        entradas: r2(entradas),
        saidas: r2(saidas),
        resultado: r2(entradas - saidas),
        maioresSaidas: [...categorias.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([categoria, valor]) => ({ categoria, valor: r2(valor) })),
        saldoEmCaixaHoje: r2(saldo),
      };
    }

    case "vendas_por_recorte": {
      const de = String(entrada.de ?? "");
      const ate = String(entrada.ate ?? "");
      const por = entrada.por;
      if (!DATA.test(de) || !DATA.test(ate)) return { erro: "Datas inválidas, use AAAA-MM-DD" };
      if (por !== "canal" && por !== "pagamento" && por !== "cliente") return { erro: "Agrupe por canal, pagamento ou cliente" };
      const inicio = de < somarDias(ate, -730) ? somarDias(ate, -730) : de;
      const { data, error } = await db
        .from("vendas")
        .select("canal, forma_pagamento, cliente_nome, valor_total, custo_total")
        .eq("owner_id", owner)
        .eq("status", "concluida")
        .gte("data", inicio)
        .lte("data", ate)
        .limit(5000);
      if (error) throw error;
      const grupos = new Map<string, { grupo: string; vendas: number; valor: number; lucro: number }>();
      for (const v of data ?? []) {
        const bruto = por === "canal" ? v.canal : por === "pagamento" ? v.forma_pagamento : v.cliente_nome;
        const nome = (bruto as string | null)?.trim() || "Não informado";
        const g = grupos.get(nome) ?? { grupo: nome, vendas: 0, valor: 0, lucro: 0 };
        g.vendas += 1;
        g.valor += Number(v.valor_total);
        g.lucro += Number(v.valor_total) - Number(v.custo_total);
        grupos.set(nome, g);
      }
      const max = Math.min(Math.max(Math.floor(Number(entrada.limite)) || 10, 1), 20);
      return {
        de: inicio,
        ate,
        agrupadoPor: por,
        grupos: [...grupos.values()]
          .sort((a, b) => b.valor - a.valor)
          .slice(0, max)
          .map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100, lucro: Math.round(g.lucro * 100) / 100 })),
      };
    }

    case "pedidos_da_vitrine": {
      const status = entrada.status === "vendido" || entrada.status === "descartado" ? entrada.status : "novo";
      const { data, error } = await db
        .from("vitrine_pedidos")
        .select("codigo, itens, total, cliente_nome, entrega, pagamento, created_at")
        .eq("owner_id", owner)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Math.floor(Number(entrada.limite)) || 5, 1), 10));
      if (error) throw error;
      const { count } = await db
        .from("vitrine_pedidos")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", owner)
        .eq("status", status);
      return {
        status,
        total: count ?? (data ?? []).length,
        pedidos: (data ?? []).map((p) => ({
          codigo: p.codigo,
          cliente: p.cliente_nome,
          total: Number(p.total),
          entrega: p.entrega,
          pagamento: p.pagamento,
          quando: p.created_at,
          itens: Array.isArray(p.itens)
            ? (p.itens as { nome?: string; variacao?: string; quantidade?: number }[]).map(
                (i) => `${i.quantidade ?? 1}x ${i.nome ?? "item"}${i.variacao ? ` (${i.variacao})` : ""}`,
              )
            : [],
        })),
      };
    }

    case "preparar_venda": {
      if (!ctx.escrita) return { erro: "Lançar venda ainda não está liberado para esta conta." };
      return prepararVenda(db, ctx, entrada);
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

export function hojeParaOModelo() {
  return hojeISO();
}
