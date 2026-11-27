// Prévia do painel fora da extensão (página de simulação): troca o chrome.* por respostas falsas,
// para conferir o visual e o fluxo da tela sem instalar nada. Nunca entra no build da extensão.
import type { ProdutoBusca } from "../src/formatar.ts";
import type { Pedido } from "../src/mensagens.ts";

const produtos: ProdutoBusca[] = [
  {
    id: "p1",
    nome: "Torneira Gourmet Flexível Preta com Bica Alta e Filtro",
    marca: "Lorenzetti",
    sku: "TG01",
    codigoBarras: "7890000000001",
    preco: 49,
    estoque: 2,
    naVitrine: true,
    capa: null,
    variacoes: [],
    link: "https://marcon-staging.vercel.app/loja/loja-de-teste?p=p1",
  },
  {
    id: "p2",
    nome: "Relógio Tomi",
    marca: null,
    sku: null,
    codigoBarras: null,
    preco: 119,
    estoque: 0,
    naVitrine: true,
    capa: null,
    variacoes: [
      { id: "v1", nome: "Preto", preco: 119, estoque: 0, sku: null },
      { id: "v2", nome: "Prata", preco: 129, estoque: 1, sku: null },
    ],
    link: "https://marcon-staging.vercel.app/loja/loja-de-teste?p=p2",
  },
  {
    id: "p3",
    nome: "Garrafa Térmica 500ml",
    marca: "Termolar",
    sku: "GT500",
    codigoBarras: null,
    preco: 39.9,
    estoque: 0,
    naVitrine: false,
    capa: null,
    variacoes: [],
    link: null,
  },
];

let logado = false;
// vendas falsas por chave: repetir a chave devolve a mesma venda (como a registrar_venda_unica)
const vendas = new Map<string, { vendaId: string; reciboToken: string; total: number }>();
let falharRede = true; // a primeira venda com cliente "Rede" entra, mas a resposta "se perde"
(globalThis as unknown as { marconVendas: unknown }).marconVendas = vendas;
function novaVenda(chave: string, itens: { quantidade: number; preco_unitario: number }[]) {
  const total = Math.round(itens.reduce((s, i) => s + i.quantidade * i.preco_unitario * 100, 0)) / 100;
  const nova = { vendaId: `venda-${vendas.size + 1}`, reciboToken: `tok-${vendas.size + 1}`, total };
  vendas.set(chave, nova);
  return nova;
}
const ultimo: { texto?: string } = {};
function responder(p: Pedido): unknown {
  switch (p.tipo) {
    case "sessao":
      return { ok: true, dados: logado ? { email: "teste@usemarcon.com", ambiente: "staging" } : null };
    case "entrar":
      if (p.senha !== "certa") return { ok: false, erro: "E-mail ou senha não conferem." };
      logado = true;
      return { ok: true, dados: { email: p.email, ambiente: "staging" } };
    case "entrarGoogle":
      return { ok: false, erro: "Login com Google cancelado." };
    case "sair":
      logado = false;
      return { ok: true, dados: null };
    case "buscar": {
      const t = p.termo.toLowerCase();
      return { ok: true, dados: produtos.filter((x) => `${x.nome} ${x.marca ?? ""} ${x.sku ?? ""}`.toLowerCase().includes(t)) };
    }
    case "respostas":
      return {
        ok: true,
        dados: {
          respostas: [
            { id: "r1", titulo: "Saudação", atalho: "oi", ordem: 0, texto: "Oi! Aqui é da {negocio}, tudo bem?\nComo posso te ajudar?" },
            { id: "r2", titulo: "Pix", atalho: "pix", ordem: 1, texto: "Pode pagar no Pix.\nChave: {pix}\nAssim que pagar, me manda o comprovante." },
            { id: "r3", titulo: "Retirada", atalho: "retirada", ordem: 2, texto: "Dá pra retirar aqui.\nEndereço: {endereco}\nMe avisa o horário." },
            { id: "r4", titulo: "Ainda disponível", atalho: "disponivel", ordem: 3, texto: "Tá disponível, sim!\nVeja mais coisas na loja: {vitrine}" },
          ],
          // sem endereço de propósito: a linha some
          dados: { negocio: "Loja de Teste", pix: "pix@lojadeteste.com", endereco: null, telefone: null, vitrine: "https://marcon-staging.vercel.app/loja/loja-de-teste" },
        },
      };
    case "dadosVenda":
      return {
        ok: true,
        dados: {
          formas: [{ id: "f1", nome: "Dinheiro" }, { id: "f2", nome: "Pix" }, { id: "f3", nome: "Cartão" }],
          canais: [{ id: "c1", nome: "Instagram" }, { id: "c2", nome: "WhatsApp" }],
          clientes: [
            { id: "k1", nome: "João da Silva", telefone: "(11) 98765-4321" },
            { id: "k2", nome: "Maria Souza", telefone: null },
          ],
        },
      };
    case "vender": {
      const v = p.venda;
      const ja = vendas.get(v.chave);
      if (ja) return { ok: true, dados: { ...ja, criada: false } };
      if (v.clienteNome === "Limite") {
        return { ok: false, erro: "Você chegou ao limite de 30 vendas por mês do plano grátis. Assine o plano Marcon para vender sem limite." };
      }
      const nova = novaVenda(v.chave, v.itens);
      if (v.clienteNome === "Rede" && falharRede) {
        falharRede = false;
        return { ok: false, incerto: true, erro: "Sem resposta do Marcon. Tente de novo: se a venda já entrou, ela não duplica." };
      }
      return { ok: true, dados: { ...nova, criada: true } };
    }
    case "inserir":
      ultimo.texto = p.texto;
      return p.texto.includes("Garrafa")
        ? { ok: false, erro: "Abra uma conversa no WhatsApp e tente de novo." }
        : { ok: true, dados: "Texto na caixa. Revise e envie." };
    default:
      return { ok: true, dados: null };
  }
}

(globalThis as unknown as { chrome: unknown; marconUltimo: unknown }).marconUltimo = ultimo;
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    lastError: undefined,
    sendMessage: (p: Pedido, cb: (r: unknown) => void) => setTimeout(() => cb(responder(p)), 80),
  },
  storage: { onChanged: { addListener: () => {} } },
};
