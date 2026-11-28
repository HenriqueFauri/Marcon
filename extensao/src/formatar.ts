// Monta o texto que o dono insere na conversa. Função pura, sem chrome nem rede (testada em teste/).
// Regras do dono: preço único (preco_varejo ou preço da variação), nunca a quantidade em estoque
// ("Disponível" ou "Sob consulta"), link só quando a vitrine está no ar e o produto aparece nela.

export interface VariacaoBusca {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
  sku: string | null;
}

export interface ProdutoBusca {
  id: string;
  nome: string;
  marca: string | null;
  sku: string | null;
  codigoBarras: string | null;
  preco: number;
  estoque: number;
  naVitrine: boolean;
  // false quando não deu para conferir a vitrine agora (rede ou banco): sem link, sem afirmar nada
  vitrineConferida?: boolean;
  capa: string | null;
  // caminho da capa no bucket produto-fotos (para anexar a foto) e quantas fotos o produto tem
  capaPath?: string | null;
  totalFotos?: number;
  variacoes: VariacaoBusca[];
  // link do produto na vitrine, só quando vale (vitrine ativa, plano pago ou teste, produto na vitrine)
  link: string | null;
}

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// "R$ 49,90" com espaço comum (o Intl usa espaço não separável, que no WhatsApp quebra a busca do texto).
export function formatarPreco(valor: number): string {
  return reais.format(Number.isFinite(valor) ? valor : 0).replace(/\u00a0/g, " ");
}

export function estoqueTotal(p: Pick<ProdutoBusca, "estoque" | "variacoes">): number {
  if (p.variacoes.length === 0) return p.estoque;
  return p.variacoes.reduce((s, v) => s + Math.max(0, v.estoque), 0);
}

// Tira asterisco, sublinhado, til e crase das pontas para não quebrar a formatação do WhatsApp.
function limpar(texto: string): string {
  return texto.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
}

// Texto de um produto (sem variacaoId) ou de uma variação dele.
export function formatarMensagem(p: ProdutoBusca, variacaoId?: string): string {
  const linhas: string[] = [];
  const v = variacaoId ? p.variacoes.find((x) => x.id === variacaoId) : undefined;

  if (v) {
    linhas.push(`*${limpar(p.nome)}* (${limpar(v.nome)})`);
    linhas.push(formatarPreco(v.preco));
    linhas.push(v.estoque > 0 ? "Disponível" : "Sob consulta");
  } else if (p.variacoes.length > 0) {
    linhas.push(`*${limpar(p.nome)}*`);
    const precos = p.variacoes.map((x) => x.preco);
    const menor = Math.min(...precos);
    const maior = Math.max(...precos);
    linhas.push(menor === maior ? formatarPreco(menor) : `A partir de ${formatarPreco(menor)}`);
    const disponiveis = p.variacoes.filter((x) => x.estoque > 0).map((x) => limpar(x.nome));
    linhas.push(disponiveis.length > 0 ? `Disponível em: ${disponiveis.join(", ")}` : "Sob consulta");
  } else {
    linhas.push(`*${limpar(p.nome)}*`);
    linhas.push(formatarPreco(p.preco));
    linhas.push(p.estoque > 0 ? "Disponível" : "Sob consulta");
  }

  if (p.link) linhas.push(`Veja na loja: ${p.link}`);
  return linhas.join("\n");
}

// Link público do produto: {base}/loja/{slug}?p={id}. Quem decide se vale é quem chama.
export function linkDoProduto(base: string, slug: string, produtoId: string): string {
  return `${base.replace(/\/+$/, "")}/loja/${encodeURIComponent(slug)}?p=${encodeURIComponent(produtoId)}`;
}

// Termo de busca seguro para o filtro "or" do PostgREST: tira o que tem sentido na sintaxe
// (vírgula, parênteses, aspas, barra) e os curingas do ilike, para o dono não precisar escapar nada.
export function termoSeguro(bruto: string): string {
  return bruto
    .replace(/[,()"'\\%*_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
