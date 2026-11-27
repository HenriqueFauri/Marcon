// Venda rápida (extensão do WhatsApp Web, parte 5). Regras puras, sem import: usadas pela rota
// /api/extensao/venda (que valida de novo tudo que chega) e pela extensão (extensao/src/venda.ts).
// Decisões do dono: produto, quantidade, preço editável, forma de pagamento, canal e cliente
// opcional. Sempre à vista, sem desconto. Prazo, parcelas, entrada e encomenda ficam no app.

export interface ItemVendaRapida {
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
}

export interface VendaRapida {
  chave: string; // uuid por tentativa: repetir a mesma chave devolve a mesma venda
  itens: ItemVendaRapida[];
  formaPagamentoId: string | null;
  canalId: string | null;
  clienteId: string | null;
  clienteNome: string | null; // nome livre, quando não escolheu um cliente cadastrado
}

export const MAX_ITENS = 50;
export const MAX_QUANTIDADE = 100000;
export const MAX_PRECO = 10000000;
export const MAX_NOME_CLIENTE = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// Preço com centavos exatos (0,1 + 0,2 vira 0,3 e não 0,30000000000000004).
export function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export function totalDaVenda(itens: Pick<ItemVendaRapida, "quantidade" | "preco_unitario">[]): number {
  return itens.reduce((s, i) => s + i.quantidade * emCentavos(i.preco_unitario), 0) / 100;
}

// "49,90", "49.90", "1.234,56" e "R$ 10" viram número; vazio ou lixo viram NaN.
export function lerPreco(texto: string): number {
  let t = texto.replace(/[R$\s]/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}

export function soDigitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

// Sem acento e em minúsculas, para a busca de cliente achar "Joao" em "João".
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface ClienteBusca {
  id: string;
  nome: string;
  telefone: string | null;
}

// Cliente pelo nome (cada palavra, sem acento) ou pelo telefone (só os dígitos, 3 ou mais).
export function filtrarClientes<T extends ClienteBusca>(clientes: T[], termo: string, limite = 8): T[] {
  const bruto = termo.trim();
  if (!bruto) return [];
  const digitos = soDigitos(bruto);
  const soNumero = digitos.length >= 3 && /^[\d\s()+.-]+$/.test(bruto);
  const palavras = semAcento(bruto).split(/\s+/).filter(Boolean);
  const achados = clientes.filter((c) => {
    if (soNumero) return soDigitos(c.telefone).includes(digitos);
    const nome = semAcento(c.nome);
    return palavras.every((p) => nome.includes(p));
  });
  return achados.slice(0, limite);
}

// Canal padrão: o que se chama WhatsApp na conta, se existir. Nunca cria canal.
export function canalPadrao<T extends { id: string; nome: string }>(canais: T[]): T | null {
  const nome = (c: T) => semAcento(c.nome).replace(/[\s-]/g, "");
  return canais.find((c) => nome(c) === "whatsapp") ?? canais.find((c) => nome(c).includes("whatsapp")) ?? null;
}

// O que identifica o conteúdo da venda. Mesma assinatura = mesma tentativa (reaproveita a chave);
// mudou qualquer coisa = venda nova (chave nova), para nunca devolver uma venda diferente da tela.
export function assinaturaDaVenda(v: Omit<VendaRapida, "chave">): string {
  return JSON.stringify([
    v.itens.map((i) => [i.produto_id, i.variacao_id, i.quantidade, emCentavos(i.preco_unitario)]),
    v.formaPagamentoId,
    v.canalId,
    v.clienteId,
    v.clienteNome?.trim() || null,
  ]);
}

export type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

// Confere tudo que chega do navegador. Nada de campo extra: só o que a venda rápida usa.
export function validarVendaRapida(bruto: unknown): Validacao<VendaRapida> {
  if (!bruto || typeof bruto !== "object") return { ok: false, erro: "Pedido inválido." };
  const b = bruto as Record<string, unknown>;
  if (!ehUuid(b.chave)) return { ok: false, erro: "Pedido inválido." };
  if (!Array.isArray(b.itens) || b.itens.length === 0) return { ok: false, erro: "Adicione pelo menos um produto." };
  if (b.itens.length > MAX_ITENS) return { ok: false, erro: `No máximo ${MAX_ITENS} itens por venda.` };

  const itens: ItemVendaRapida[] = [];
  for (const cru of b.itens) {
    if (!cru || typeof cru !== "object") return { ok: false, erro: "Confira os itens da venda." };
    const i = cru as Record<string, unknown>;
    if (!ehUuid(i.produto_id)) return { ok: false, erro: "Confira os itens da venda." };
    if (i.variacao_id !== null && i.variacao_id !== undefined && !ehUuid(i.variacao_id)) {
      return { ok: false, erro: "Confira os itens da venda." };
    }
    const q = i.quantidade;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > MAX_QUANTIDADE) {
      return { ok: false, erro: "Confira as quantidades." };
    }
    const p = i.preco_unitario;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > MAX_PRECO) {
      return { ok: false, erro: "Confira os preços." };
    }
    itens.push({
      produto_id: i.produto_id,
      variacao_id: (i.variacao_id as string | null | undefined) ?? null,
      quantidade: q,
      preco_unitario: emCentavos(p) / 100,
    });
  }

  const idOuNull = (v: unknown): string | null | false => (v === null || v === undefined || v === "" ? null : ehUuid(v) ? v : false);
  const forma = idOuNull(b.formaPagamentoId);
  const canal = idOuNull(b.canalId);
  const cliente = idOuNull(b.clienteId);
  if (forma === false || canal === false || cliente === false) return { ok: false, erro: "Pedido inválido." };

  let clienteNome: string | null = null;
  if (b.clienteNome !== null && b.clienteNome !== undefined) {
    if (typeof b.clienteNome !== "string") return { ok: false, erro: "Confira o nome do cliente." };
    clienteNome = b.clienteNome.replace(/\s+/g, " ").trim() || null;
    if (clienteNome && clienteNome.length > MAX_NOME_CLIENTE) return { ok: false, erro: "Nome do cliente muito longo." };
  }

  return { ok: true, dados: { chave: b.chave, itens, formaPagamentoId: forma, canalId: canal, clienteId: cliente, clienteNome } };
}

// Erros do banco em texto claro para o painel. As mensagens das funções já vêm em português.
export function erroDaVenda(bruto: string | null | undefined): string {
  const m = (bruto ?? "").trim();
  if (!m) return "Não deu para registrar a venda. Tente de novo.";
  if (/estoque insuficiente/i.test(m)) {
    return `${m.charAt(0).toUpperCase()}${m.slice(1)}. Ajuste a quantidade ou venda como encomenda pelo app.`;
  }
  if (/limite de \d+ vendas/i.test(m)) return m;
  if (/JWT|não autenticado|not authenticated/i.test(m)) return "Sua sessão acabou. Entre de novo.";
  if (/Could not find the function|registrar_venda_unica/i.test(m)) return "O Marcon está atualizando. Tente de novo em alguns minutos.";
  if (/duplicate key|unique constraint/i.test(m)) return "Essa venda já foi registrada. Confira em Vendas, no Marcon.";
  if (/relacionado/i.test(m)) return "Algum item não é desta conta. Busque o produto de novo.";
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}`;
}
