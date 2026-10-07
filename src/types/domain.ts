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
  fornecedor_id: string | null;
  na_vitrine: boolean;
  destaque: boolean;
  created_at: string;
}

export interface ProdutoVariacao {
  id: string;
  produto_id: string;
  nome_combinacao: string;
  atributos: Record<string, string>;
  custo: number | null;
  preco_venda: number | null;
  estoque: number;
  sku: string | null;
  created_at: string;
}

export interface ProdutoFoto {
  id: string;
  produto_id: string;
  variacao_id: string | null;
  path: string;
  ordem: number;
  created_at: string;
}

export interface Fornecedor {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface CanalVenda {
  id: string;
  nome: string;
}

export interface FormaPagamento {
  id: string;
  nome: string;
}

export interface ProdutoAnuncio {
  id: string;
  produto_id: string;
  canal_id: string;
  variacao_id: string | null;
  titulo: string | null;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProdutoComEstoque extends Produto {
  estoque_total: number;
  custo_min: number;
  custo_max: number;
  // só existe depois da migration 0008
  valor_estoque?: number;
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
  fornecedor_id: string | null;
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
  venda_id: string | null;
  parcela_id: string | null;
  movimento_estoque_id: string | null;
  created_at: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  observacoes: string | null;
  created_at: string;
}

export type VendaTipoPagamento = "a_vista" | "a_prazo";
export type VendaStatus = "concluida" | "cancelada";

export interface Venda {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  data: string;
  canal: string | null;
  forma_pagamento: string | null;
  canal_id: string | null;
  forma_pagamento_id: string | null;
  tipo_pagamento: VendaTipoPagamento;
  valor_total: number;
  desconto: number;
  custo_total: number;
  status: VendaStatus;
  observacoes: string | null;
  recibo_token?: string; // migration 0017
  outros_gastos?: number; // migration 0018
  created_at: string;
}

export interface VendaItem {
  id: string;
  venda_id: string;
  produto_id: string | null;
  variacao_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
}

export type ParcelaStatus = "pendente" | "pago" | "atrasado";

export interface Parcela {
  id: string;
  venda_id: string;
  numero_parcela: number;
  valor: number;
  vencimento: string;
  status: ParcelaStatus;
  status_efetivo: ParcelaStatus;
  data_pagamento: string | null;
}

export interface ParcelaComVenda extends Parcela {
  vendas: {
    cliente_nome: string | null;
    cliente_id: string | null;
    clientes?: { telefone: string | null } | null;
  } | null;
}
