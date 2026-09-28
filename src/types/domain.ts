export type ProdutoStatus = "ativo" | "inativo";

export interface Categoria {
  id: string;
  nome: string;
}

export interface Produto {
  id: string;
  categoria_id: string | null;
  nome: string;
  marca: string | null;
  descricao: string | null;
  status: ProdutoStatus;
  tem_variacoes: boolean;
  custo: number;
  margem_alvo_pct: number | null;
  preco_varejo: number;
  preco_atacado: number | null;
  estoque_atual: number;
  alerta_estoque_baixo: number | null;
  unidade_medida: string;
  sku: string | null;
  fornecedor_nome: string | null;
  created_at: string;
}

export interface ProdutoComEstoque extends Produto {
  estoque_total: number;
  custo_min: number;
  custo_max: number;
  categorias?: { nome: string } | null;
}

export type MovimentoEstoqueTipo = "compra" | "ajuste" | "devolucao";

export interface MovimentoEstoque {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  tipo: MovimentoEstoqueTipo;
  quantidade: number;
  valor_unitario: number;
  data: string;
  fornecedor_nome: string | null;
  observacoes: string | null;
  created_at: string;
}

export type LancamentoTipo = "entrada" | "saida";
export type LancamentoOrigem = "compra" | "manual" | "ajuste" | "gasto";

export interface LancamentoCaixa {
  id: string;
  produto_id: string | null;
  tipo: LancamentoTipo;
  origem: LancamentoOrigem;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  afeta_lucro: boolean;
  afeta_caixa: boolean;
}
