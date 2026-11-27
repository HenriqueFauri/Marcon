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
