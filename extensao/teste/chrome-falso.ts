// Prévia do painel fora da extensão (página de simulação): troca o chrome.* por respostas falsas,
// para conferir o visual e o fluxo da tela sem instalar nada. Nunca entra no build da extensão.
import type { ProdutoBusca } from "../src/formatar.ts";
import type { Pedido } from "../src/mensagens.ts";
import type { MidiaPainel } from "../src/midias-db.ts";

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

// miniatura falsa (quadrado colorido), sem rede
function quadrado(cor: string, letra: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${cor}"/><text x="40" y="50" font-size="28" text-anchor="middle" fill="#fff">${letra}</text></svg>`)}`;
}
produtos[0].capa = quadrado("#d45f30", "1");
produtos[0].capaPath = "dono/foto1.jpg";
produtos[0].totalFotos = 3;
produtos[1].capa = quadrado("#636366", "R");
produtos[1].capaPath = "dono/relogio.jpg";
produtos[1].totalFotos = 1;

const base = { path: "dono/x", mime: "application/pdf", resposta_id: null, origem: "arquivo" as const, duracao: null, miniatura: null };
const midiasFalsas: MidiaPainel[] = [
  { ...base, id: "m1", tipo: "documento", titulo: "Catálogo de Natal", nome_arquivo: "Catálogo de Natal.pdf", tamanho: 2_300_000 },
  { ...base, id: "m2", tipo: "audio", titulo: "Como funciona a garantia", nome_arquivo: "Como funciona a garantia.m4a", mime: "audio/mp4", tamanho: 310_000, duracao: 42 },
  { ...base, id: "m3", tipo: "imagem", titulo: "Tabela de medidas", nome_arquivo: "Tabela de medidas.jpg", mime: "image/jpeg", tamanho: 180_000, miniatura: quadrado("#1f7a4d", "T"), resposta_id: "r2" },
];

let logado = false;
// áudio de voz falso: a conversa aberta e o que foi "enviado"
let conversaFalsa: { id: string; nome: string } | null = { id: "5511999990000@c.us", nome: "Cliente Teste" };
const vozes: { conversa: string; bytes: number }[] = [];
(globalThis as unknown as { marconVoz: unknown }).marconVoz = { vozes, conversa: (c: typeof conversaFalsa) => (conversaFalsa = c) };
function wavCurto(): string {
  const taxa = 8000;
  const n = taxa; // 1 segundo
  const b = new Uint8Array(44 + n * 2);
  const v = new DataView(b.buffer);
  const txt = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  txt(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 330 * i) / taxa) * 9000), true);
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin);
}
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
// cada pedido de inserir ou anexar que o painel faz (a simulação confere: um por clique)
const acoes: string[] = [];
const ultimo: { texto?: string; anexo?: string; acoes: string[] } = { acoes };
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
          midias: [{ id: "m3", tipo: "imagem", titulo: "Tabela de medidas", resposta_id: "r2" }],
          // parte 4: "Primeiro contato" tem um passo de texto com arquivo e um passo vazio (arquivo apagado)
          sequencias: [
            { id: "s1", titulo: "Primeiro contato", ordem: 0 },
            { id: "s2", titulo: "Fechar venda", ordem: 1 },
          ],
          passos: [
            { id: "q1", sequencia_id: "s1", ordem: 0, texto: "Oi! Aqui é da {negocio}. Vou te mandar o catálogo.", resposta_id: null, midia_id: null },
            { id: "q2", sequencia_id: "s1", ordem: 1, texto: null, resposta_id: null, midia_id: "m3" },
            { id: "q3", sequencia_id: "s1", ordem: 2, texto: "Esse áudio explica a garantia:", resposta_id: null, midia_id: "m2" },
            { id: "q4", sequencia_id: "s1", ordem: 3, texto: null, resposta_id: null, midia_id: "apagado" },
            { id: "q5", sequencia_id: "s1", ordem: 4, texto: null, resposta_id: "r2", midia_id: null },
          ],
          arquivos: midiasFalsas.map((m) => ({ id: m.id, tipo: m.tipo, titulo: m.titulo })),
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
    case "fotosProduto":
      return { ok: true, dados: [1, 2, 3].map((i) => ({ path: `dono/foto${i}.jpg`, url: quadrado(["#d45f30", "#1f7a4d", "#8a5a10"][i - 1], `${i}`), variacao: i === 3 ? "Preto" : null })) };
    case "anexarFoto":
      ultimo.anexo = p.path;
      return { ok: true, dados: { anexou: true, mensagem: "Arquivo na prévia do WhatsApp. Confira e envie." } };
    case "midias":
      return { ok: true, dados: midiasFalsas };
    case "anexarMidia":
      ultimo.anexo = p.id;
      acoes.push(`anexar:${p.id}`);
      // o PDF finge que a prévia não abriu, para conferir o botão Baixar
      return p.id === "m1"
        ? { ok: true, dados: { anexou: false, mensagem: "A prévia do WhatsApp não abriu. Feche o que estiver aberto na conversa ou use Baixar e arraste o arquivo.", arquivo: { base64: "JVBERi0=", mime: "application/pdf", nome: "Catálogo de Natal.pdf" } } }
        : { ok: true, dados: { anexou: true, mensagem: "Arquivo na prévia do WhatsApp. Confira e envie." } };
    case "arquivoMidia":
      // áudio de verdade não há aqui: um WAV curto basta para a conversão
      return { ok: true, dados: { base64: wavCurto(), mime: "audio/wav", nome: "a.wav" } };
    case "conversaAberta":
      return conversaFalsa ? { ok: true, dados: conversaFalsa } : { ok: false, erro: "Abra a conversa no WhatsApp e tente de novo." };
    case "enviarVoz":
      vozes.push({ conversa: p.conversa, bytes: p.base64.length });
      return { ok: true, dados: "Áudio de voz enviado." };
    case "produtosComFoto": {
      const t = p.termo.toLowerCase();
      const com = produtos.filter((x) => x.capaPath && (t.length < 2 || x.nome.toLowerCase().includes(t)));
      return { ok: true, dados: com.map((x) => ({ id: x.id, nome: x.nome, capa: x.capa, capaPath: x.capaPath, totalFotos: x.totalFotos })) };
    }
    case "urlMidia":
      return { ok: false, erro: "Não deu para abrir o áudio." };
    case "salvarGravacao":
      midiasFalsas.unshift({ ...midiasFalsas[1], id: `g${Date.now()}`, titulo: p.titulo, origem: "gravacao", duracao: Math.round(p.duracao) });
      return { ok: true, dados: midiasFalsas[0] };
    case "inserir":
      ultimo.texto = p.texto;
      acoes.push(`inserir:${p.texto.slice(0, 30)}`);
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
