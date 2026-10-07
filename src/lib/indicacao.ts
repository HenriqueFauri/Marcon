import { PLANOS } from "@/lib/planos";

// Regras do "Indique e ganhe". Sem imports de servidor: o proxy e as telas também usam.
// O mínimo do saque também está na migration 0023 (função pedir_saque): ao mudar, mude nos dois.
// A carência só vale para comissões novas: cada comissão guarda a própria data de liberação.
export const COMISSAO_PERCENTUAL = 30;
// teto do percentual negociado por afiliado, também na constraint da migration 0030
export const COMISSAO_MAXIMA = 50;
export const CARENCIA_DIAS = 30; // o cartão só cai na conta do Marcon por volta de 30 dias: o afiliado só é pago depois de receber
export const SAQUE_MINIMO = 15;
export const COOKIE_REF = "marcon_ref";
export const DIAS_DO_COOKIE = 60;

export const CODIGO_REGEX = /^[a-z0-9]{4,12}$/;

// sem 0/o/1/l/i: o código às vezes é ditado ou digitado
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

export function gerarCodigo(tamanho = 7) {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

// percentual do afiliado: o negociado na coluna afiliados.percentual, ou o padrão quando vazio
export function percentualDoAfiliado(personalizado: number | string | null | undefined) {
  const n = Number(personalizado);
  return personalizado != null && Number.isFinite(n) && n > 0 ? n : COMISSAO_PERCENTUAL;
}

export function comissaoDe(valorPago: number, percentual = COMISSAO_PERCENTUAL) {
  return Math.round(valorPago * percentual) / 100;
}

export const COMISSAO_POR_MES = comissaoDe(PLANOS.marcon.valor);

export function linkDeIndicacao(base: string, codigo: string) {
  return `${base}/?ref=${codigo}`;
}

export function mensagemDeConvite(link: string) {
  return `Uso o Marcon para controlar vendas, estoque e caixa direto do celular. Dá para testar de graça: ${link}`;
}

export interface ComissaoLinha {
  valor: number | string;
  liberada_em: string;
  estornada_em: string | null;
}

export interface SaqueLinha {
  valor: number | string;
  status: "pedido" | "pago" | "recusado";
}

// Saldo do afiliado. Mesma conta da função pedir_saque no banco.
export function resumoDoAfiliado(comissoes: ComissaoLinha[], saques: SaqueLinha[], agora = new Date()) {
  const valida = comissoes.filter((c) => !c.estornada_em);
  const soma = (xs: { valor: number | string }[]) => xs.reduce((s, x) => s + Number(x.valor), 0);

  const liberadas = soma(valida.filter((c) => new Date(c.liberada_em) <= agora));
  const aLiberar = soma(valida.filter((c) => new Date(c.liberada_em) > agora));
  const pedido = soma(saques.filter((s) => s.status === "pedido"));
  const sacado = soma(saques.filter((s) => s.status === "pago"));

  return {
    disponivel: Math.max(0, Math.round((liberadas - pedido - sacado) * 100) / 100),
    aLiberar: Math.round(aLiberar * 100) / 100,
    emPedido: Math.round(pedido * 100) / 100,
    sacado: Math.round(sacado * 100) / 100,
    totalGanho: Math.round((liberadas + aLiberar) * 100) / 100,
  };
}
