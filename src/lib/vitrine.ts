import { formatBRL } from "@/lib/format";

// Vitrine pública (função vitrine_publica, migrations 0025 e 0026): só o que o cliente deve ver.
// Sem imports de servidor: a tela de configuração e o carrinho também usam (a busca fica em vitrine-servidor.ts).

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const COR_PADRAO = "#0f766e";
export const COR_REGEX = /^#[0-9a-fA-F]{6}$/;
export const BOAS_VINDAS_MAX = 160;
export const ANUNCIO_MAX = 120;
export const BANNER_MAX_IMAGENS = 3;
export const BANNER_TITULO_MAX = 60;
export const BANNER_SUBTITULO_MAX = 120;
export const BANNER_BOTAO_MAX = 24;
export const INSTAGRAM_REGEX = /^[A-Za-z0-9._]{1,30}$/;

export type Entrega = "ambos" | "entrega" | "retirada";
export type Tema = "claro" | "escuro";

export const ENTREGAS: { valor: Entrega; titulo: string; ajuda: string }[] = [
  { valor: "ambos", titulo: "Os dois", ajuda: "O cliente escolhe no pedido." },
  { valor: "entrega", titulo: "Só entrega", ajuda: "Retirada no local não aparece." },
  { valor: "retirada", titulo: "Só retirada", ajuda: "Sem endereço de entrega e sem frete." },
];

// paletas prontas: preenchem a cor de destaque e o tema (o vendedor ainda pode ajustar a cor)
export const PALETAS: { id: string; nome: string; cor: string; tema: Tema }[] = [
  { id: "padrao", nome: "Verde", cor: COR_PADRAO, tema: "claro" },
  { id: "oceano", nome: "Oceano", cor: "#1d4ed8", tema: "claro" },
  { id: "sunset", nome: "Sunset", cor: "#c2410c", tema: "claro" },
  { id: "natureza", nome: "Natureza", cor: "#15803d", tema: "claro" },
  { id: "premium", nome: "Dark premium", cor: "#818cf8", tema: "escuro" },
];

// tokens do app trocados só dentro da loja, para o tema escuro não depender do tema do vendedor
export const TOKENS_ESCUROS = {
  "--canvas": "#000000",
  "--surface": "#1c1c1e",
  "--fill": "#2c2c2e",
  "--fill-strong": "#3a3a3c",
  "--line": "#38383a",
  "--ink": "#f5f5f7",
  "--ink-2": "#d1d1d6",
  "--ink-muted": "#98989d",
} as const;


export interface VitrineVariacao {
  id: string;
  nome: string;
  preco: number;
  esgotado: boolean;
  ultimas: number | null;
}

export interface VitrineProdutoBruto {
  id: string;
  nome: string;
  marca: string | null;
  descricao: string | null;
  categoria: string | null;
  preco: number;
  destaque: boolean;
  tem_variacoes: boolean;
  esgotado: boolean;
  ultimas: number | null;
  variacoes: VitrineVariacao[];
  fotos: { path: string; variacao_id: string | null }[];
}

export interface VitrineBruta {
  loja: {
    nome: string | null;
    logo_path: string | null;
    whatsapp: string;
    cor: string;
    tema: Tema;
    boas_vindas: string | null;
    anuncio: string | null;
    entrega: Entrega;
    frete_fixo: number | null;
    instagram: string | null;
    endereco: string | null;
    formas_pagamento: string[];
    ref: string | null;
  };
  produtos: VitrineProdutoBruto[];
}

// já com as fotos assinadas, pronto para a tela
export interface VitrineProduto extends Omit<VitrineProdutoBruto, "fotos"> {
  fotos: { url: string; variacaoId: string | null }[];
}

export interface BannerBruto {
  paths: string[];
  titulo: string | null;
  subtitulo: string | null;
  botao: string | null;
}

export interface Banner {
  urls: string[];
  titulo: string | null;
  subtitulo: string | null;
  botao: string | null;
}

export interface Vitrine {
  loja: Omit<VitrineBruta["loja"], "logo_path"> & { logoUrl: string | null };
  banner: Banner | null;
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

export interface DadosDoPedido {
  nome: string;
  entrega: "entrega" | "retirada";
  endereco: string;
  pagamento: string;
  frete: number | null; // só vale na entrega
  cupom: CupomAplicado | null;
}

// Cupom de desconto (migration 0028). O desconto vale sobre os produtos, nunca sobre o frete.
export const CUPOM_REGEX = /^[A-Z0-9]{3,20}$/;

export interface Cupom {
  codigo: string;
  tipo: "percentual" | "valor";
  valor: number;
  minimo: number | null;
}

export interface CupomAplicado {
  codigo: string;
  desconto: number;
}

// quanto o cupom tira deste subtotal; 0 se o pedido não chega no mínimo
export function descontoDoCupom(cupom: Cupom, subtotal: number) {
  if (cupom.minimo !== null && subtotal < Number(cupom.minimo)) return 0;
  const bruto = cupom.tipo === "percentual" ? (subtotal * Number(cupom.valor)) / 100 : Number(cupom.valor);
  return Math.round(Math.min(bruto, subtotal) * 100) / 100;
}

export function rotuloDoCupom(cupom: Pick<Cupom, "tipo" | "valor">) {
  return cupom.tipo === "percentual" ? `${Number(cupom.valor).toLocaleString("pt-BR")}% de desconto` : `${formatBRL(cupom.valor)} de desconto`;
}

export function mensagemDoPedido(loja: string | null, itens: ItemDoPedido[], dados: DadosDoPedido) {
  const linhas = itens.map(
    (i) =>
      `• ${i.quantidade}x ${i.nome}${i.variacao ? ` (${i.variacao})` : ""}: ${formatBRL(i.preco * i.quantidade)}`,
  );
  const frete = dados.entrega === "entrega" ? dados.frete : null;
  const desconto = dados.cupom?.desconto ?? 0;
  const total = totalDoPedido(itens) - desconto + (frete ?? 0);
  return [
    `Olá${loja ? `, ${loja}` : ""}! Quero fazer um pedido:`,
    "",
    ...linhas,
    "",
    ...(desconto > 0 && dados.cupom ? [`Desconto do cupom ${dados.cupom.codigo}: ${formatBRL(desconto)}`] : []),
    ...(frete ? [`Frete: ${formatBRL(frete)}`] : []),
    `Total: ${formatBRL(total)}`,
    "",
    ...(dados.nome ? [`Nome: ${dados.nome}`] : []),
    dados.entrega === "entrega" ? `Entrega em: ${dados.endereco}` : "Retirada no local",
    ...(dados.pagamento ? [`Pagamento: ${dados.pagamento}`] : []),
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
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#111111" : "#ffffff";
}
