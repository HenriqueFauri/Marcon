import { formatBRL } from "@/lib/format";

// Vitrine pública (função vitrine_publica, migration 0025): só o que o cliente deve ver.
// Sem imports de servidor: a tela de configuração e o carrinho também usam (a busca fica em vitrine-servidor.ts).

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const COR_PADRAO = "#0f766e";
export const COR_REGEX = /^#[0-9a-fA-F]{6}$/;
export const BOAS_VINDAS_MAX = 160;

export interface VitrineVariacao {
  id: string;
  nome: string;
  preco: number;
  esgotado: boolean;
}

export interface VitrineProdutoBruto {
  id: string;
  nome: string;
  marca: string | null;
  descricao: string | null;
  categoria: string | null;
  preco: number;
  tem_variacoes: boolean;
  esgotado: boolean;
  variacoes: VitrineVariacao[];
  fotos: { path: string; variacao_id: string | null }[];
}

export interface VitrineBruta {
  loja: {
    nome: string | null;
    logo_path: string | null;
    whatsapp: string;
    cor: string;
    boas_vindas: string | null;
    ref: string | null;
  };
  produtos: VitrineProdutoBruto[];
}

// já com as fotos assinadas, pronto para a tela
export interface VitrineProduto extends Omit<VitrineProdutoBruto, "fotos"> {
  fotos: { url: string; variacaoId: string | null }[];
}

export interface Vitrine {
  loja: Omit<VitrineBruta["loja"], "logo_path"> & { logoUrl: string | null };
  produtos: VitrineProduto[];
}

// "Minha Loja Ltda!" -> "minha-loja-ltda"
export function sugerirSlug(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// só dígitos, com o 55 do Brasil quando vier só DDD + número
export function normalizarWhatsapp(bruto: string) {
  const digitos = bruto.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}

export interface ItemDoPedido {
  nome: string;
  variacao: string | null;
  preco: number;
  quantidade: number;
}

export function totalDoPedido(itens: ItemDoPedido[]) {
  return itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
}

export function mensagemDoPedido(loja: string | null, itens: ItemDoPedido[]) {
  const linhas = itens.map(
    (i) =>
      `• ${i.quantidade}x ${i.nome}${i.variacao ? ` (${i.variacao})` : ""} - ${formatBRL(i.preco * i.quantidade)}`,
  );
  return [
    `Olá${loja ? `, ${loja}` : ""}! Quero fazer um pedido:`,
    "",
    ...linhas,
    "",
    `Total: ${formatBRL(totalDoPedido(itens))}`,
  ].join("\n");
}

export function linkDoWhatsapp(whatsapp: string, mensagem: string) {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

// texto legível (preto ou branco) por cima da cor de destaque escolhida
export function corDoTexto(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}
