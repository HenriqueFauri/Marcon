// Tipos do importador de relatórios em PDF.

// texto solto do PDF, com a posição na página (y cresce para cima, como no PDF)
export interface Item {
  x: number;
  y: number;
  texto: string;
}

// itens que estão na mesma altura, da esquerda para a direita
export interface Linha {
  y: number;
  itens: Item[];
}

export type Pagina = Linha[];

export interface ProdutoLido {
  nome: string;
  categoria: string | null;
  custo: number;
  precoVarejo: number;
  precoAtacado: number | null;
  estoque: number;
  avisos: string[];
}

export interface ItemVendaLido {
  nome: string; // como aparece no relatório, ex.: "Relogio Tomi (Branco)"
  nomeBase: string; // sem a "(variação)"
  variacao: string | null;
  quantidade: number;
  total: number;
  custoUnitario: number;
}

export interface VendaLida {
  ref: string;
  data: string; // yyyy-mm-dd
  itens: ItemVendaLido[];
  total: number;
  custoTotal: number;
  formaPagamento: string | null;
  canal: string | null;
  cliente: string | null;
  aPrazo: boolean;
  avisos: string[];
}

export interface LancamentoLido {
  ref: string;
  data: string;
  tipo: "entrada" | "saida";
  origem: "compra" | "manual";
  categoria: string;
  descricao: string;
  valor: number;
  produtoNome: string | null;
}

// comparação entre o que foi lido e os totais que o próprio relatório informa
export interface Conferencia {
  rotulo: string;
  lido: string;
  esperado: string;
  ok: boolean;
}

interface Base {
  origem: "vendamax";
  periodo: string | null;
  avisos: string[];
  conferencias: Conferencia[];
}

export type Analise =
  | (Base & { tipo: "produtos"; itens: ProdutoLido[] })
  | (Base & { tipo: "vendas"; itens: VendaLida[] })
  | (Base & { tipo: "caixa"; itens: LancamentoLido[]; vendasIgnoradas: number });

export class ErroDeLeitura extends Error {}
