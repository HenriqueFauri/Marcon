import type { User } from "@supabase/supabase-js";

// números de cada conta (função admin_resumo_por_conta, migration 0048)
export interface ResumoConta {
  owner_id: string;
  produtos: number;
  vendas_mes: number;
  valor_mes: number;
  lucro_mes: number;
  vendas_total: number;
  valor_total: number;
  ultima_venda: string | null;
}

// detalhe de uma conta, só leitura (função admin_conta_detalhe, migration 0048)
export interface DetalheConta {
  resumo: ResumoConta | null;
  estoque: { produtos_ativos: number; unidades: number; valor_custo: number };
  clientes: number;
  mais_vendidos: { nome: string; unidades: number; valor: number }[];
  produtos: { nome: string; estoque: number; preco: number; custo: number }[];
  ultimas_vendas: { data: string; valor: number; lucro: number; status: string; pagamento: string | null; criada: string; itens: number }[];
}

export function bloqueada(u: User) {
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}
