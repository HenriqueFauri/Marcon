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

// Cores da loja (migration 0036). "cor" é o destaque (categoria e opção escolhidas, banner, logo);
// o resto vem de botão, fundo, texto e faixa. Cartões, bordas e textos secundários saem da
// mistura de fundo e texto, então qualquer combinação fica coerente.
export interface CoresDaLoja {
  destaque: string;
  botao: string;
  fundo: string;
  texto: string;
  faixa: string;
}

export const CORES_CLARAS = { fundo: "#f2f2f7", texto: "#1d1d1f" };
export const CORES_ESCURAS = { fundo: "#000000", texto: "#f5f5f7" };

// paletas prontas: preenchem as cinco cores, que o vendedor ainda pode ajustar uma a uma
export const PALETAS: { id: string; nome: string; descricao: string; cores: CoresDaLoja }[] = [
  {
    id: "classico",
    nome: "Clássico",
    descricao: "Gelo com verde-petróleo",
    cores: { destaque: COR_PADRAO, botao: COR_PADRAO, fundo: "#f2f2f7", texto: "#1d1d1f", faixa: COR_PADRAO },
  },
  {
    id: "minimalista",
    nome: "Minimalista",
    descricao: "Branco e preto",
    cores: { destaque: "#1d1d1f", botao: "#1d1d1f", fundo: "#ffffff", texto: "#1d1d1f", faixa: "#1d1d1f" },
  },
  {
    id: "oceano",
    nome: "Oceano",
    descricao: "Azul sobre fundo gelo",
    cores: { destaque: "#1d4ed8", botao: "#1d4ed8", fundo: "#eef3fb", texto: "#0f172a", faixa: "#1e3a8a" },
  },
  {
    id: "boutique",
    nome: "Boutique",
    descricao: "Creme e rosé, pra moda",
    cores: { destaque: "#9d5c63", botao: "#3b2a2a", fundo: "#faf6f1", texto: "#2b2121", faixa: "#3b2a2a" },
  },
  {
    id: "sunset",
    nome: "Sunset",
    descricao: "Coral quente",
    cores: { destaque: "#c2410c", botao: "#c2410c", fundo: "#fff7f2", texto: "#1f1410", faixa: "#9a3412" },
  },
  {
    id: "natureza",
    nome: "Natureza",
    descricao: "Verdes de loja natural",
    cores: { destaque: "#15803d", botao: "#166534", fundo: "#f3f7f1", texto: "#14231a", faixa: "#166534" },
  },
  {
    id: "noite",
    nome: "Noite",
    descricao: "Escuro com índigo",
    cores: { destaque: "#a5b4fc", botao: "#6366f1", fundo: "#0b0b12", texto: "#ececf1", faixa: "#4f46e5" },
  },
];

export function mesmasCores(a: CoresDaLoja, b: CoresDaLoja) {
  return (Object.keys(a) as (keyof CoresDaLoja)[]).every((k) => a[k].toLowerCase() === b[k].toLowerCase());
}

// lojas de antes das cores separadas (ou sem a migration 0036) só têm destaque e tema
export function coresDaLoja(loja: {
  cor: string;
  tema: Tema;
  cor_botao?: string | null;
  cor_fundo?: string | null;
  cor_texto?: string | null;
  cor_faixa?: string | null;
}): CoresDaLoja {
  const base = loja.tema === "escuro" ? CORES_ESCURAS : CORES_CLARAS;
  return {
    destaque: loja.cor,
    botao: loja.cor_botao ?? loja.cor,
    fundo: loja.cor_fundo ?? base.fundo,
    texto: loja.cor_texto ?? base.texto,
    faixa: loja.cor_faixa ?? loja.cor,
  };
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// mistura "a" com "b"; peso = quanto de "b" entra
function misturar(a: string, b: string, peso: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * peso).toString(16).padStart(2, "0")).join("")}`;
}

export function luminancia(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export const fundoEscuro = (fundo: string) => luminancia(fundo) < 0.18;

// texto legível (preto ou branco) por cima de uma cor
export function corDoTexto(hex: string) {
  return luminancia(hex) > 0.179 ? "#111111" : "#ffffff";
}

// tokens do app trocados só dentro da loja: fundo, cartões, bordas e textos saem das cores do vendedor
export function tokensDaLoja(c: CoresDaLoja): Record<string, string> {
  const escuro = fundoEscuro(c.fundo);
  const m = (peso: number) => misturar(c.fundo, c.texto, peso);
  return {
    "--canvas": c.fundo,
    // no claro o cartão é mais claro que o fundo (branco em fundo branco fica só com a borda); no escuro, um tom acima
    "--surface": escuro ? m(0.09) : misturar(c.fundo, "#ffffff", 0.85),
    "--fill": m(escuro ? 0.15 : 0.07),
    "--fill-strong": m(escuro ? 0.22 : 0.12),
    "--line": m(escuro ? 0.2 : 0.14),
    "--line-strong": m(0.45),
    "--ink": c.texto,
    "--ink-2": misturar(c.texto, c.fundo, 0.15),
    "--ink-muted": misturar(c.texto, c.fundo, 0.42),
    "--ink-faint": misturar(c.texto, c.fundo, 0.62),
    "--positive": escuro ? "#5bb98a" : "#1f7a4d",
    "--warning": escuro ? "#e0a23c" : "#8a5a10",
    "--danger": escuro ? "#ef6b61" : "#b8332a",
    "--tile-warning": escuro ? "#e0a23c" : "#a56a14",
    "--on-tile-warning": escuro ? "#1c0a02" : "#ffffff",
    "--loja": c.destaque,
    "--loja-texto": corDoTexto(c.destaque),
    "--loja-botao": c.botao,
    "--loja-botao-texto": corDoTexto(c.botao),
    "--loja-faixa": c.faixa,
    "--loja-faixa-texto": corDoTexto(c.faixa),
  };
}

// avisos de contraste para o vendedor (só avisa, não impede)
export function avisosDeContraste(c: CoresDaLoja) {
  const avisos: string[] = [];
  if (contraste(c.texto, c.fundo) < 4.5) avisos.push("O texto fica difícil de ler nesse fundo.");
  if (contraste(c.botao, c.fundo) < 1.6) avisos.push("Os botões quase somem no fundo.");
  if (contraste(c.destaque, c.fundo) < 1.6) avisos.push("A cor de destaque quase some no fundo.");
  return avisos;
}

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
    cor_botao?: string | null;
    cor_fundo?: string | null;
    cor_texto?: string | null;
    cor_faixa?: string | null;
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
  codigo?: string; // código do pedido gravado (vitrine_pedidos), para o vendedor achar no app
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
    `Olá${loja ? `, ${loja}` : ""}! Quero fazer um pedido${dados.codigo ? ` (#${dados.codigo})` : ""}:`,
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

// código curto do pedido, sem letras que se confundem (0/O, 1/I/L)
const LETRAS_DO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function gerarCodigoDoPedido() {
  const n = new Uint32Array(5);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => LETRAS_DO_CODIGO[x % LETRAS_DO_CODIGO.length]).join("");
}

export function linkDoWhatsapp(whatsapp: string, mensagem: string) {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

// Prévia ao vivo em Personalizar: o formulário manda o que ainda não foi salvo para a loja
// aberta num iframe (/previa-da-loja), por postMessage na mesma origem.
export const PREVIA_PRONTA = "marcon-previa-pronta";
export const PREVIA_DADOS = "marcon-previa-dados";

export interface DadosDaPrevia {
  cores: CoresDaLoja;
  boasVindas: string;
  anuncio: string;
  instagram: string;
  banner: Banner;
}

// a loja com o que está no formulário por cima do que está salvo
export function aplicarPrevia(vitrine: Vitrine, d: DadosDaPrevia): Vitrine {
  return {
    ...vitrine,
    loja: {
      ...vitrine.loja,
      cor: d.cores.destaque,
      cor_botao: d.cores.botao,
      cor_fundo: d.cores.fundo,
      cor_texto: d.cores.texto,
      cor_faixa: d.cores.faixa,
      boas_vindas: d.boasVindas.trim() || null,
      anuncio: d.anuncio.trim() || null,
      instagram: d.instagram.trim().replace(/^@/, "") || null,
    },
    banner: d.banner,
  };
}

// Pedido recebido pela loja (tabela vitrine_pedidos, migration 0037)
export type StatusDoPedido = "novo" | "vendido" | "descartado";

export interface ItemDoPedidoRecebido {
  produto_id: string;
  variacao_id: string | null;
  nome: string;
  variacao: string | null;
  preco: number;
  quantidade: number;
}

export interface PedidoRecebido {
  id: string;
  codigo: string;
  itens: ItemDoPedidoRecebido[];
  subtotal: number;
  desconto: number;
  cupom: string | null;
  frete: number | null;
  total: number;
  cliente_nome: string | null;
  entrega: "entrega" | "retirada";
  endereco: string | null;
  pagamento: string | null;
  status: StatusDoPedido;
  venda_id: string | null;
  created_at: string;
}

export function quantidadeDeItens(p: Pick<PedidoRecebido, "itens">) {
  return p.itens.reduce((s, i) => s + Number(i.quantidade), 0);
}
