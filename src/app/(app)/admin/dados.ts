import type { User } from "@supabase/supabase-js";
import type { Situacao } from "@/lib/assinatura";
import { rotuloDoMotivo } from "@/lib/cortesia";
import { formatData } from "@/lib/format";
import { assistenteAtivo } from "@/lib/whatsapp/evolution";
import { telefoneMascarado } from "@/lib/whatsapp/vinculo";
import type { ContaGerenciavel } from "./gerenciar-conta";

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

// junta o que a lista e a página da conta já leram no formato das ações (gerenciar-conta.tsx)
export function contaGerenciavel(
  u: User,
  o: {
    titulo: string;
    situacao: Situacao;
    motivo: string | null | undefined;
    admin: boolean; // admin do Marcon: assistente liberado sem interruptor e não pode ser bloqueado
    liberado: { lancar: boolean | null } | null | undefined;
    telefone: string | null | undefined;
  },
): ContaGerenciavel {
  const s = o.situacao;
  const cortesia = s.tipo === "cortesia";
  return {
    id: u.id,
    email: u.email ?? "",
    titulo: o.titulo,
    pagante: s.tipo === "ativa" || s.tipo === "atrasada",
    cortesia: {
      ativa: cortesia,
      valeAte: cortesia && s.cortesiaAte ? `${formatData(s.cortesiaAte)}, ${s.diasRestantes === 1 ? "último dia" : `${s.diasRestantes} dias`}` : null,
      motivo: cortesia ? rotuloDoMotivo(o.motivo) : null,
      dadaEm: cortesia && s.cortesiaEm ? formatData(s.cortesiaEm.slice(0, 10)) : null,
    },
    assistente: {
      admin: o.admin,
      usar: !!o.liberado,
      lancar: o.liberado?.lancar === true,
      rodape: !assistenteAtivo()
        ? "A chave geral está desligada (WHATSAPP_ASSISTENTE_ATIVO): ninguém usa agora."
        : o.telefone
          ? `Número vinculado: final ${telefoneMascarado(o.telefone).replace("...", "")}.`
          : "Nenhum número vinculado ainda. A pessoa vincula em Configurações.",
    },
    podeBloquear: !o.admin,
    bloqueada: bloqueada(u),
  };
}
