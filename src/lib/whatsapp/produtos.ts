import "server-only";
import type { Db } from "./rascunho";

// Único lugar que decide QUAL produto o vendedor quis dizer. A nota vem do banco
// (buscar_produtos_parecidos, migration 0047), que tolera erro de voz, digitação e acento.
// A decisão é do servidor, com regra fixa: o modelo nunca escolhe produto por semelhança.

export interface ProdutoAchado {
  id: string;
  nome: string;
  marca: string | null;
  estoque_total: number;
  preco_varejo: number;
  custo: number;
  tem_variacoes: boolean;
  pontos: number; // 1 = o termo aparece inteiro no nome, marca ou código; menos que isso = parecido
  exato: boolean;
}

const ACEITA = 0.55; // abaixo disso não é o mesmo produto
const EMPATE = 0.15; // diferença de nota que separa um vencedor dos outros
const SUGERE = 0.45; // "você quis dizer...?"

export async function procurarProdutos(db: Db, owner: string, termo: string, limite = 8): Promise<ProdutoAchado[]> {
  const { data, error } = await db.rpc("buscar_produtos_parecidos", { p_owner: owner, p_termo: termo, p_limite: limite });
  if (error) throw error;
  return ((data ?? []) as ProdutoAchado[]).map((p) => ({
    ...p,
    estoque_total: Number(p.estoque_total),
    preco_varejo: Number(p.preco_varejo),
    custo: Number(p.custo),
    pontos: Number(p.pontos),
  }));
}

// Vocabulário do dono para a transcrição da voz: primeiro o que ele mais vendeu nos últimos 90 dias
// (é o que ele mais fala), depois o resto do cadastro. Assim um catálogo grande não perde o que importa.
export async function vocabularioDoDono(db: Db, owner: string, desde: string): Promise<string[]> {
  const [{ data: vendidos }, { data: cadastro }] = await Promise.all([
    db
      .from("venda_itens")
      .select("produto_nome, quantidade, vendas!inner(data, status)")
      .eq("owner_id", owner)
      .eq("vendas.status", "concluida")
      .gte("vendas.data", desde)
      .limit(2000),
    db.from("produtos_com_estoque").select("nome, marca").eq("owner_id", owner).eq("status", "ativo").order("nome").limit(300),
  ]);
  const saida = new Map<string, number>();
  for (const i of vendidos ?? []) saida.set(i.produto_nome, (saida.get(i.produto_nome) ?? 0) + Number(i.quantidade));
  const maisVendidos = [...saida.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  const doCadastro = (cadastro ?? []).map((p) => [p.nome, p.marca].filter(Boolean).join(" "));
  return [...new Set([...maisVendidos, ...doCadastro])].map((n) => n.slice(0, 50));
}

export type Escolha =
  // firme = o termo bate com o cadastro; false = só parecido (nunca lança sem o SIM do vendedor)
  | { tipo: "um"; produto: ProdutoAchado; firme: boolean }
  | { tipo: "varios"; produtos: ProdutoAchado[] }
  | { tipo: "nenhum"; parecidos: string[] };

export function escolher(achados: ProdutoAchado[]): Escolha {
  const exatos = achados.filter((p) => p.exato);
  if (exatos.length === 1) return { tipo: "um", produto: exatos[0], firme: true };

  const melhor = achados[0];
  if (!melhor || melhor.pontos < ACEITA) {
    return { tipo: "nenhum", parecidos: achados.filter((p) => p.pontos >= SUGERE).slice(0, 3).map((p) => p.nome) };
  }
  const proximos = achados.filter((p) => p.pontos >= ACEITA && p.pontos >= melhor.pontos - EMPATE);
  if (proximos.length === 1) return { tipo: "um", produto: melhor, firme: melhor.pontos >= 0.999 };
  return { tipo: "varios", produtos: proximos.slice(0, 6) };
}

// Para as ferramentas de lançamento: um produto, ou (em `falta`) a resposta pronta para o modelo repassar.
export type UmProduto = { produto: ProdutoAchado; firme: boolean } | { falta: Record<string, unknown> };

export async function umProduto(db: Db, owner: string, termo: string): Promise<UmProduto> {
  const escolha = escolher(await procurarProdutos(db, owner, termo, 8));
  if (escolha.tipo === "um") return { produto: escolha.produto, firme: escolha.firme };
  if (escolha.tipo === "varios") {
    return { falta: { ambiguo: escolha.produtos.map((p) => p.nome), pergunta: "Qual desses produtos?" } };
  }
  return {
    falta: escolha.parecidos.length
      ? { erro: `Não achei "${termo}" no cadastro.`, parecidos: escolha.parecidos, pergunta: "Pergunte se é um destes, sem assumir." }
      : { erro: `Não achei "${termo}" nem nada parecido no cadastro. Peça o nome como está no Marcon.` },
  };
}
