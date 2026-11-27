// Painel do Marcon (painel lateral do navegador ou embutido no WhatsApp). Tela simples em DOM puro:
// todo texto vindo do banco entra por textContent, nunca como HTML.
import { AMBIENTE, BASE_LOJA } from "./config.ts";
import { estoqueTotal, formatarMensagem, formatarPreco, type ProdutoBusca } from "./formatar.ts";
import { pedir, type Sessao } from "./mensagens.ts";
import { filtrarRespostas, preencherVariaveis } from "./respostas.ts";
import type { RespostasDaConta } from "./respostas-db.ts";
import {
  assinaturaDaVenda,
  canalPadrao,
  filtrarClientes,
  lerPreco,
  MAX_QUANTIDADE,
  semAcento,
  soDigitos,
  totalDaVenda,
  type ClienteBusca,
  type DadosDaVenda,
  type ItemVendaRapida,
  type Opcao,
  type RespostaVenda,
  type VendaFeita,
  type VendaRapida,
} from "./venda.ts";

const app = document.getElementById("app")!;
const embutido = new URLSearchParams(location.search).get("modo") === "embutido";

type Filho = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { [atributo: string]: string | Record<string, (e: Event) => unknown> | undefined } = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === "on" && typeof v === "object") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f) el.append(f);
  return el;
}

function grupo(titulo: string | null, conteudo: Node, rodape?: string) {
  return h(
    "section",
    { class: "grupo" },
    titulo ? h("h2", { class: "grupo-titulo" }, titulo) : null,
    h("div", { class: "cartao" }, conteudo),
    rodape ? h("p", { class: "grupo-rodape" }, rodape) : null,
  );
}

function topo() {
  return h(
    "header",
    { class: "topo" },
    h("img", { src: "icones/icone-48.png", alt: "" }),
    h("h1", {}, "Marcon"),
    AMBIENTE === "staging" ? h("span", { class: "selo" }, "Staging") : null,
    embutido
      ? h("button", { class: "fechar", type: "button", "aria-label": "Fechar painel", on: { click: () => pedir({ tipo: "fecharPainel" }) } }, "×")
      : null,
  );
}

// Aviso que some sozinho (barra escura no pé do painel).
let avisoEl: HTMLDivElement | null = null;
let avisoTimer: number | undefined;
function avisar(texto: string, erro = false) {
  if (!avisoEl) return;
  avisoEl.textContent = texto;
  avisoEl.className = erro ? "aviso erro" : "aviso";
  avisoEl.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = window.setTimeout(() => avisoEl && (avisoEl.hidden = true), erro ? 6000 : 3000);
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = h("textarea", {});
    t.value = texto;
    t.style.cssText = "position:fixed;opacity:0";
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

// ---------------------------------------------------------------------------------------------
// Entrar

function telaEntrar(erroInicial?: string) {
  const email = h("input", { class: "campo", type: "email", placeholder: "E-mail", autocomplete: "username", "aria-label": "E-mail" });
  const senha = h("input", { class: "campo", type: "password", placeholder: "Senha", autocomplete: "current-password", "aria-label": "Senha" });
  const erro = h("p", { class: "erro-campo", role: "alert" }, erroInicial ?? "");
  const botao = h("button", { class: "btn btn-principal", type: "submit" }, "Entrar");
  const google = h(
    "button",
    {
      class: "btn btn-secundario",
      type: "button",
      on: {
        click: async () => {
          google.disabled = true;
          erro.textContent = "";
          const r = await pedir<Sessao | "aba">({ tipo: "entrarGoogle" });
          google.disabled = false;
          if (!r.ok) erro.textContent = r.erro;
          else if (r.dados === "aba") erro.textContent = "Termine o login na aba que abriu. Depois volte aqui.";
          else telaPrincipal(r.dados);
        },
      },
    },
    "Entrar com Google",
  );

  const form = h(
    "form",
    {
      class: "grupo",
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!email.value.trim() || !senha.value) {
            erro.textContent = "Preencha e-mail e senha.";
            return;
          }
          botao.disabled = true;
          botao.textContent = "Entrando...";
          erro.textContent = "";
          const r = await pedir<Sessao>({ tipo: "entrar", email: email.value, senha: senha.value });
          senha.value = "";
          botao.disabled = false;
          botao.textContent = "Entrar";
          if (r.ok) telaPrincipal(r.dados);
          else erro.textContent = r.erro;
        },
      },
    },
    h("h2", { class: "grupo-titulo" }, "Sua conta do Marcon"),
    h("div", { class: "cartao" }, email, senha),
    erro,
    h("div", { style: "padding-top:10px" }, botao),
  );

  app.replaceChildren(topo(), form, h("div", { class: "grupo" }, h("p", { class: "ou" }, "ou"), google));
  email.focus();
}

// ---------------------------------------------------------------------------------------------
// Busca e resultados

function capa(p: ProdutoBusca) {
  if (p.capa) return h("img", { class: "capa", src: p.capa, alt: "", loading: "lazy" });
  return h("div", { class: "capa vazia", "aria-hidden": "true" }, (p.nome.trim()[0] ?? "?").toUpperCase());
}

function rotuloEstoque(qtd: number) {
  if (qtd <= 0) return h("span", { class: "estado-aviso" }, "Zerado");
  return h("span", { class: "estado-positivo" }, qtd === 1 ? "1 em estoque" : `${qtd} em estoque`);
}

function acoes(p: ProdutoBusca, variacaoId?: string) {
  const alvo = variacaoId ? `${p.nome} ${p.variacoes.find((v) => v.id === variacaoId)?.nome ?? ""}`.trim() : p.nome;
  return inserirCopiar(() => formatarMensagem(p, variacaoId), alvo);
}

// Inserir (coloca na caixa do WhatsApp, sem enviar) e Copiar (plano B)
// Texto vazio (resposta em que toda linha usa um dado que a conta não tem): avisa e não insere.
const SEM_TEXTO = "Falta dado na conta para esta resposta. Preencha em Configurações, no Marcon.";

function inserirCopiar(texto: () => string, alvo: string) {
  return h(
    "div",
    { class: "acoes" },
    h(
      "button",
      {
        class: "btn-pequeno destaque",
        type: "button",
        "aria-label": `Inserir ${alvo}`,
        on: {
          click: async () => {
            if (!texto().trim()) return avisar(SEM_TEXTO, true);
            const r = await pedir<string>({ tipo: "inserir", texto: texto() });
            if (r.ok) avisar(r.dados);
            else {
              // Plano B automático: o texto já vai para a área de transferência.
              const copiou = await copiar(texto());
              avisar(copiou ? `${r.erro} Já copiei o texto: clique na caixa e cole.` : r.erro, true);
            }
          },
        },
      },
      "Inserir",
    ),
    h(
      "button",
      {
        class: "btn-pequeno neutro",
        type: "button",
        "aria-label": `Copiar ${alvo}`,
        on: {
          click: async () => {
            if (!texto().trim()) return avisar(SEM_TEXTO, true);
            avisar((await copiar(texto())) ? "Texto copiado." : "Não deu para copiar.", false);
          },
        },
      },
      "Copiar",
    ),
  );
}

function itemProduto(p: ProdutoBusca) {
  const total = estoqueTotal(p);
  const marcaSku = [p.marca, p.sku].filter(Boolean).join(" · ");
  const vitrine = p.link
    ? "Na vitrine"
    : !p.naVitrine
      ? "Fora da vitrine"
      : p.vitrineConferida === false
        ? "Na vitrine, link indisponível agora"
        : "Na vitrine, loja fora do ar";

  let preco = formatarPreco(p.preco);
  if (p.variacoes.length > 0) {
    const precos = p.variacoes.map((v) => v.preco);
    const menor = Math.min(...precos);
    preco = menor === Math.max(...precos) ? formatarPreco(menor) : `A partir de ${formatarPreco(menor)}`;
  }

  const variacoes =
    p.variacoes.length > 0
      ? h(
          "div",
          { class: "variacoes" },
          ...p.variacoes.map((v) =>
            h(
              "div",
              { class: "variacao" },
              h(
                "div",
                { class: "info" },
                h("span", { class: "nome" }, v.nome),
                h("span", { class: "detalhe" }, `${formatarPreco(v.preco)} · `, rotuloEstoque(v.estoque)),
              ),
              acoes(p, v.id),
            ),
          ),
        )
      : null;

  return h(
    "div",
    { class: "produto" },
    capa(p),
    h(
      "div",
      { class: "info" },
      h("span", { class: "nome" }, p.nome),
      marcaSku ? h("span", { class: "detalhe" }, marcaSku) : null,
      h("span", { class: "preco" }, preco),
      h("span", { class: "detalhe" }, rotuloEstoque(total), ` · ${vitrine}`),
      acoes(p),
      variacoes,
    ),
  );
}

function iconeLupa() {
  const lupa = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lupa.setAttribute("width", "18");
  lupa.setAttribute("height", "18");
  lupa.setAttribute("viewBox", "0 0 24 24");
  lupa.setAttribute("fill", "none");
  lupa.setAttribute("stroke", "currentColor");
  lupa.setAttribute("stroke-width", "2.2");
  lupa.setAttribute("stroke-linecap", "round");
  lupa.innerHTML = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
  return lupa;
}

// ---------------------------------------------------------------------------------------------
// Respostas prontas (criadas no app, em Configurações). Carrega ao abrir a aba, ao voltar ao painel
// e no botão Atualizar. O texto já sai com as variáveis preenchidas pelos dados da conta.

function secaoRespostas(aoPerderSessao: (erro: string) => void) {
  const campo = h("input", {
    type: "search",
    placeholder: "Título, texto ou /atalho",
    "aria-label": "Buscar resposta",
    autocomplete: "off",
  });
  const lista = h("div", { class: "grupo" });
  let conta: RespostasDaConta | null = null;
  let carregando = false;

  const atualizar = h(
    "button",
    { class: "btn-pequeno neutro", type: "button", on: { click: () => carregar(true) } },
    "Atualizar",
  );

  function desenhar() {
    if (!conta) return;
    if (conta.respostas.length === 0) {
      lista.replaceChildren(
        h(
          "div",
          { class: "cartao" },
          h(
            "div",
            { class: "vazio" },
            h("strong", {}, "Nenhuma resposta pronta"),
            "Crie no Marcon, em Configurações. Depois clique em Atualizar.",
            h("div", { style: "padding-top:12px" }, h("a", { class: "btn btn-secundario", href: `${BASE_LOJA}/configuracoes/respostas`, target: "_blank", rel: "noopener" }, "Abrir no Marcon")),
          ),
        ),
      );
      return;
    }
    const achadas = filtrarRespostas(conta.respostas, campo.value);
    if (achadas.length === 0) {
      lista.replaceChildren(h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra ou o atalho.")));
      return;
    }
    const dados = conta.dados;
    const titulo = achadas.length === 1 ? "1 resposta" : `${achadas.length} respostas`;
    lista.replaceChildren(
      h("h2", { class: "grupo-titulo" }, titulo),
      h(
        "div",
        { class: "cartao" },
        ...achadas.map((r) => {
          const texto = () => preencherVariaveis(r.texto, dados);
          return h(
            "div",
            { class: "resposta" },
            h(
              "div",
              { class: "info" },
              h("span", { class: "nome" }, r.titulo, r.atalho ? h("span", { class: "atalho" }, ` /${r.atalho}`) : null),
              h("span", { class: "previa" }, texto() || "Nada"),
              inserirCopiar(texto, r.titulo),
            ),
          );
        }),
      ),
      h("p", { class: "grupo-rodape" }, "Inserir coloca o texto na conversa aberta. Quem envia é você."),
    );
  }

  async function carregar(manual = false) {
    if (carregando) return;
    carregando = true;
    atualizar.disabled = true;
    atualizar.textContent = "Atualizando...";
    if (!conta) lista.replaceChildren(h("p", { class: "vazio" }, "Carregando..."));
    const r = await pedir<RespostasDaConta>({ tipo: "respostas" });
    carregando = false;
    atualizar.disabled = false;
    atualizar.textContent = "Atualizar";
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      if (conta) avisar(r.erro, true);
      else lista.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    conta = r.dados;
    desenhar();
    if (manual) avisar(conta.respostas.length === 1 ? "1 resposta." : `${conta.respostas.length} respostas.`);
  }

  campo.addEventListener("input", desenhar);
  const el = h(
    "div",
    { class: "secao" },
    h("div", { class: "linha-busca" }, h("div", { class: "busca" }, iconeLupa(), campo), atualizar),
    lista,
  );
  return { el, carregar, focar: () => campo.focus(), carregou: () => conta !== null };
}

// ---------------------------------------------------------------------------------------------
// Vender: venda rápida à vista (produto, quantidade, preço, pagamento, canal, cliente opcional).
// Cada tentativa leva uma chave (uuid). Repetir a mesma venda (rede caiu, clique de novo) manda a
// mesma chave e o banco devolve a venda que já entrou em vez de criar outra. Mudou qualquer coisa
// na venda: chave nova. Prazo, parcelas, desconto e encomenda ficam no app.

interface ItemCarrinho {
  chave: string; // produto ou produto:variação
  produtoId: string;
  variacaoId: string | null;
  nome: string;
  estoque: number;
  quantidade: number;
  preco: string; // como está no campo ("49,90")
}

// A venda em andamento é da conta que a montou. Se a sessão cai e a mesma conta volta, tudo fica
// (carrinho, cliente e chave: tentar de novo não duplica). Outra conta ou Sair limpa tudo.
const carrinho: ItemCarrinho[] = [];
let tentativa: { chave: string; assinatura: string } | null = null;
let clienteDaVenda: { escolhido: ClienteBusca | null; texto: string } = { escolhido: null, texto: "" };
let contaDaVenda: string | null = null;

function limparVenda() {
  carrinho.length = 0;
  tentativa = null;
  clienteDaVenda = { escolhido: null, texto: "" };
}

function vendaDaConta(email: string) {
  if (contaDaVenda !== email) limparVenda();
  contaDaVenda = email;
}

function precoNoCampo(valor: number) {
  return (Math.round(valor * 100) / 100).toFixed(2).replace(".", ",");
}

function secaoVender(aoPerderSessao: (erro: string) => void) {
  const el = h("div", { class: "secao" });
  let dados: DadosDaVenda | null = null;
  let carregando: Promise<void> | null = null;
  let enviando = false;

  // busca de produto (a mesma da aba Produtos)
  const campoBusca = h("input", { type: "search", placeholder: "Adicionar produto", "aria-label": "Buscar produto para vender", autocomplete: "off" });
  const achados = h("div", { class: "grupo" });
  const itensEl = h("section", { class: "grupo" });
  const forma = h("select", { class: "seletor", "aria-label": "Forma de pagamento" });
  const canal = h("select", { class: "seletor", "aria-label": "Canal" });
  const campoCliente = h("input", { class: "campo", type: "text", placeholder: "Nome ou telefone", "aria-label": "Cliente", autocomplete: "off", maxlength: "120" });
  const sugestoes = h("div", {});
  const clienteRodape = h("p", { class: "grupo-rodape" }, "Opcional. Sem cadastro, o nome vai só nesta venda.");
  const totalEl = h("span", { class: "total" }, formatarPreco(0));
  const resumoEl = h("span", { class: "detalhe" }, "Nenhum item");
  const erroEl = h("p", { class: "erro-campo", role: "alert" });
  const confirmar = h("button", { class: "btn btn-principal", type: "button" }, "Confirmar venda");

  // ---- busca
  let ultimo = 0;
  let timer: number | undefined;
  async function buscar() {
    const termo = campoBusca.value.trim();
    const n = ++ultimo;
    if (termo.length < 2) return achados.replaceChildren();
    const r = await pedir<ProdutoBusca[]>({ tipo: "buscar", termo });
    if (n !== ultimo) return;
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      return achados.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
    }
    if (r.dados.length === 0) {
      return achados.replaceChildren(h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra, o SKU ou o código de barras.")));
    }
    const linhas: Node[] = [];
    for (const p of r.dados) {
      if (p.variacoes.length === 0) linhas.push(linhaAchado(p.nome, p.preco, p.estoque, () => adicionar(p)));
      else for (const v of p.variacoes) linhas.push(linhaAchado(`${p.nome} (${v.nome})`, v.preco, v.estoque, () => adicionar(p, v.id)));
    }
    achados.replaceChildren(h("div", { class: "cartao" }, ...linhas));
  }
  campoBusca.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(buscar, 250);
  });
  campoBusca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(timer);
      buscar();
    }
  });

  function linhaAchado(nome: string, preco: number, estoque: number, acao: () => void) {
    return h(
      "div",
      { class: "linha-item" },
      h("div", { class: "info" }, h("span", { class: "nome" }, nome), h("span", { class: "detalhe" }, `${formatarPreco(preco)} · `, rotuloEstoque(estoque))),
      h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Adicionar ${nome}`, on: { click: acao } }, "Adicionar"),
    );
  }

  function adicionar(p: ProdutoBusca, variacaoId?: string) {
    const v = variacaoId ? p.variacoes.find((x) => x.id === variacaoId) : undefined;
    const chave = v ? `${p.id}:${v.id}` : p.id;
    const existente = carrinho.find((i) => i.chave === chave);
    if (existente) existente.quantidade += 1;
    else
      carrinho.push({
        chave,
        produtoId: p.id,
        variacaoId: v?.id ?? null,
        nome: v ? `${p.nome} (${v.nome})` : p.nome,
        estoque: v ? v.estoque : p.estoque,
        quantidade: 1,
        preco: precoNoCampo(v ? v.preco : p.preco),
      });
    campoBusca.value = "";
    achados.replaceChildren();
    desenharItens();
    avisar("Item adicionado.");
  }

  // ---- itens
  function desenharItens() {
    if (carrinho.length === 0) {
      itensEl.replaceChildren(
        h("h2", { class: "grupo-titulo" }, "Itens"),
        h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nenhum item"), "Busque o produto acima e toque em Adicionar.")),
      );
    } else {
      itensEl.replaceChildren(
        h("h2", { class: "grupo-titulo" }, carrinho.length === 1 ? "1 item" : `${carrinho.length} itens`),
        h("div", { class: "cartao" }, ...carrinho.map(linhaCarrinho)),
      );
    }
    atualizarResumo();
  }

  function linhaCarrinho(item: ItemCarrinho) {
    const qtd = h("input", { class: "qtd", type: "number", min: "1", step: "1", inputmode: "numeric", "aria-label": `Quantidade de ${item.nome}` });
    qtd.value = String(item.quantidade);
    const preco = h("input", { class: "preco-campo", type: "text", inputmode: "decimal", "aria-label": `Preço de ${item.nome}` });
    preco.value = item.preco;
    const aviso = h("span", { class: "detalhe" });
    const subtotal = h("span", { class: "subtotal" });

    function refletir() {
      const p = lerPreco(item.preco);
      subtotal.textContent = Number.isFinite(p) ? formatarPreco(totalDaVenda([{ quantidade: item.quantidade, preco_unitario: p }])) : "";
      preco.toggleAttribute("aria-invalid", !Number.isFinite(p));
      if (item.quantidade > item.estoque) {
        aviso.replaceChildren(h("span", { class: "estado-aviso" }, item.estoque <= 0 ? "Zerado" : `Só ${item.estoque} em estoque`));
      } else aviso.replaceChildren(rotuloEstoque(item.estoque));
      atualizarResumo();
    }
    const mudarQtd = (n: number) => {
      item.quantidade = Math.max(1, Math.min(MAX_QUANTIDADE, Math.trunc(n) || 1));
      qtd.value = String(item.quantidade);
      refletir();
    };
    qtd.addEventListener("change", () => mudarQtd(Number(qtd.value)));
    preco.addEventListener("input", () => {
      item.preco = preco.value;
      refletir();
    });
    preco.addEventListener("blur", () => {
      const p = lerPreco(item.preco);
      if (Number.isFinite(p)) preco.value = item.preco = precoNoCampo(p);
    });
    refletir();

    return h(
      "div",
      { class: "item-venda" },
      h("div", { class: "info" }, h("span", { class: "nome" }, item.nome), aviso),
      h(
        "div",
        { class: "controles" },
        h(
          "div",
          { class: "passo" },
          h("button", { type: "button", "aria-label": `Diminuir ${item.nome}`, on: { click: () => mudarQtd(item.quantidade - 1) } }, "−"),
          qtd,
          h("button", { type: "button", "aria-label": `Aumentar ${item.nome}`, on: { click: () => mudarQtd(item.quantidade + 1) } }, "+"),
        ),
        h("label", { class: "preco-rotulo" }, "R$", preco),
        subtotal,
      ),
      h(
        "button",
        {
          class: "texto-perigo pequeno",
          type: "button",
          "aria-label": `Tirar ${item.nome}`,
          on: {
            click: () => {
              carrinho.splice(carrinho.indexOf(item), 1);
              desenharItens();
            },
          },
        },
        "Tirar",
      ),
    );
  }

  // ---- cliente (opcional): cadastrado pelo nome ou telefone, ou só o nome livre
  campoCliente.value = clienteDaVenda.texto;
  campoCliente.addEventListener("input", () => {
    clienteDaVenda.escolhido = null;
    clienteDaVenda.texto = campoCliente.value;
    desenharSugestoes();
  });
  function desenharSugestoes() {
    const termo = campoCliente.value;
    if (clienteDaVenda.escolhido) {
      sugestoes.replaceChildren();
      clienteRodape.textContent = clienteDaVenda.escolhido.telefone ? `Cliente cadastrado · ${clienteDaVenda.escolhido.telefone}` : "Cliente cadastrado";
      return;
    }
    const lista = dados ? filtrarClientes(dados.clientes, termo, 5) : [];
    sugestoes.replaceChildren(
      ...lista.map((c) =>
        h(
          "button",
          {
            class: "sugestao",
            type: "button",
            on: {
              click: () => {
                clienteDaVenda.escolhido = c;
                campoCliente.value = clienteDaVenda.texto = c.nome;
                desenharSugestoes();
              },
            },
          },
          h("span", { class: "nome" }, c.nome),
          c.telefone ? h("span", { class: "detalhe" }, c.telefone) : null,
        ),
      ),
    );
    const soNumero = soDigitos(termo).length > 0 && !/\p{L}/u.test(termo);
    clienteRodape.textContent = !termo.trim()
      ? "Opcional. Sem cadastro, o nome vai só nesta venda."
      : soNumero && lista.length === 0
        ? "Nenhum cliente com esse telefone. Digite o nome para vender avulsa."
        : lista.length > 0
          ? "Toque no cliente ou siga com o nome digitado (avulsa)."
          : "Sem cadastro: o nome vai só nesta venda.";
  }

  function montarVenda(): Omit<VendaRapida, "chave"> | string {
    if (carrinho.length === 0) return "Adicione pelo menos um produto.";
    const itens: ItemVendaRapida[] = [];
    for (const i of carrinho) {
      const p = lerPreco(i.preco);
      if (!Number.isFinite(p)) return `Confira o preço de ${i.nome}.`;
      itens.push({ produto_id: i.produtoId, variacao_id: i.variacaoId, quantidade: i.quantidade, preco_unitario: p });
    }
    const falta = carrinho.find((i) => i.quantidade > i.estoque);
    if (falta) {
      return falta.estoque <= 0
        ? `${falta.nome} está zerado. Tire o item ou venda como encomenda pelo app.`
        : `Só ${falta.estoque} de ${falta.nome} em estoque. Ajuste a quantidade ou venda como encomenda pelo app.`;
    }
    const nomeLivre = campoCliente.value.replace(/\s+/g, " ").trim();
    return {
      itens,
      formaPagamentoId: forma.value || null,
      canalId: canal.value || null,
      clienteId: clienteDaVenda.escolhido?.id ?? null,
      clienteNome: clienteDaVenda.escolhido ? clienteDaVenda.escolhido.nome : /\p{L}/u.test(nomeLivre) ? nomeLivre : null,
    };
  }

  function atualizarResumo() {
    const itens = carrinho.map((i) => ({ quantidade: i.quantidade, preco_unitario: lerPreco(i.preco) }));
    const validos = itens.every((i) => Number.isFinite(i.preco_unitario));
    const total = validos ? totalDaVenda(itens) : 0;
    const unidades = carrinho.reduce((s, i) => s + i.quantidade, 0);
    totalEl.textContent = validos ? formatarPreco(total) : "Confira os preços";
    resumoEl.textContent = carrinho.length === 0 ? "Nenhum item" : `${unidades === 1 ? "1 unidade" : `${unidades} unidades`} · À vista`;
    if (!enviando) {
      confirmar.disabled = carrinho.length === 0 || !validos;
      confirmar.textContent = carrinho.length && validos ? `Confirmar venda · ${formatarPreco(total)}` : "Confirmar venda";
    }
    erroEl.textContent = "";
  }

  confirmar.addEventListener("click", async () => {
    if (enviando) return;
    const venda = montarVenda();
    if (typeof venda === "string") {
      erroEl.textContent = venda;
      return;
    }
    const assinatura = assinaturaDaVenda(venda);
    if (!tentativa || tentativa.assinatura !== assinatura) tentativa = { chave: crypto.randomUUID(), assinatura };
    enviando = true;
    confirmar.disabled = true;
    confirmar.textContent = "Registrando...";
    erroEl.textContent = "";
    const r = (await pedir<VendaFeita>({ tipo: "vender", venda: { ...venda, chave: tentativa.chave } })) as RespostaVenda;
    enviando = false;
    if (r.ok) {
      limparVenda();
      campoCliente.value = "";
      telaFeita(r.dados);
      return;
    }
    if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
    atualizarResumo();
    erroEl.textContent = r.erro; // com "incerto", a chave fica: tentar de novo não duplica
  });

  // ---- depois da venda
  function telaFeita(v: VendaFeita) {
    const recibo = `${BASE_LOJA}/r/${v.reciboToken}`;
    el.replaceChildren(
      grupo(
        null,
        h(
          "div",
          { class: "feita" },
          h("strong", {}, v.criada ? "Venda registrada" : "Venda já registrada"),
          h("span", { class: "total" }, formatarPreco(v.total)),
          v.criada ? h("span", { class: "detalhe" }, "Estoque e caixa atualizados.") : h("span", { class: "detalhe" }, "Ela já tinha entrado. Nada foi duplicado."),
        ),
      ),
      h(
        "div",
        { class: "grupo" },
        h(
          "button",
          {
            class: "btn btn-principal",
            type: "button",
            on: {
              click: async () => {
                const texto = `Recibo da sua compra: ${recibo}`;
                const r = await pedir<string>({ tipo: "inserir", texto });
                if (r.ok) avisar(r.dados);
                else {
                  const copiou = await copiar(texto);
                  avisar(copiou ? `${r.erro} Já copiei o link: clique na caixa e cole.` : r.erro, true);
                }
              },
            },
          },
          "Inserir link do recibo",
        ),
        h("a", { class: "btn btn-secundario", href: `${BASE_LOJA}/vendas/${encodeURIComponent(v.vendaId)}`, target: "_blank", rel: "noopener" }, "Abrir no Marcon"),
        h("p", { class: "grupo-rodape" }, "Inserir coloca o link na conversa aberta. Quem envia é você."),
      ),
      h("div", {}, h("button", { class: "texto-marca", type: "button", on: { click: () => montar() } }, "Nova venda")),
    );
  }

  // ---- montagem
  function opcoes(sel: HTMLSelectElement, lista: Opcao[], vazio: string, escolhido: string | null) {
    sel.replaceChildren(h("option", { value: "" }, vazio), ...lista.map((o) => h("option", { value: o.id }, o.nome)));
    sel.value = escolhido && lista.some((o) => o.id === escolhido) ? escolhido : "";
  }

  async function carregar() {
    const r = await pedir<DadosDaVenda>({ tipo: "dadosVenda" });
    if (!r.ok) {
      if (r.erro.includes("sessão")) return aoPerderSessao(r.erro);
      avisar(r.erro, true);
      return;
    }
    const formaAntes = forma.value || null;
    const canalAntes = canal.value || null;
    const primeira = dados === null;
    dados = r.dados;
    const pix = dados.formas.find((f) => semAcento(f.nome).trim() === "pix");
    opcoes(forma, dados.formas, "Não informar", primeira ? (pix?.id ?? null) : formaAntes);
    opcoes(canal, dados.canais, "Não informar", primeira ? (canalPadrao(dados.canais)?.id ?? null) : canalAntes);
    desenharSugestoes();
  }

  function linhaSeletor(rotulo: string, sel: HTMLSelectElement) {
    return h("label", { class: "linha-seletor" }, h("span", {}, rotulo), sel);
  }

  function montar() {
    erroEl.textContent = "";
    el.replaceChildren(
      h("div", { class: "busca" }, iconeLupa(), campoBusca),
      achados,
      itensEl,
      grupo("Pagamento", h("div", {}, linhaSeletor("Forma", forma), linhaSeletor("Canal", canal)), "À vista. Prazo, parcelas e desconto, só no app."),
      h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, "Cliente"), h("div", { class: "cartao" }, campoCliente, sugestoes), clienteRodape),
      h("div", { class: "grupo" }, h("div", { class: "resumo" }, h("span", { class: "detalhe" }, "Total"), totalEl, resumoEl), confirmar, erroEl),
    );
    desenharItens();
    carregando = carregar().finally(() => (carregando = null));
  }

  return {
    el,
    abrir: () => {
      if (!el.firstChild) montar();
      else if (!carregando && !enviando && el.contains(campoBusca)) carregando = carregar().finally(() => (carregando = null));
      if (el.contains(campoBusca)) campoBusca.focus();
    },
  };
}

// voltar ao painel (ou à aba do WhatsApp, no painel embutido) traz a lista nova do app
let recarregarRespostas: (() => void) | null = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") recarregarRespostas?.();
});

function telaPrincipal(sessao: Sessao) {
  vendaDaConta(sessao.email);
  const campo = h("input", {
    type: "search",
    placeholder: "Nome, SKU, marca ou código",
    "aria-label": "Buscar produto",
    autocomplete: "off",
  });
  const lupa = iconeLupa();

  const resultados = h("div", { class: "grupo" });
  avisoEl = h("div", { class: "aviso", hidden: "", role: "status", "aria-live": "polite" });

  let ultimo = 0;
  let timer: number | undefined;
  async function buscar() {
    const termo = campo.value.trim();
    const n = ++ultimo;
    if (termo.length < 2) {
      resultados.replaceChildren();
      return;
    }
    const r = await pedir<ProdutoBusca[]>({ tipo: "buscar", termo });
    if (n !== ultimo) return; // chegou resposta de uma busca antiga
    if (!r.ok) {
      if (r.erro.includes("sessão")) return telaEntrar(r.erro);
      resultados.replaceChildren(h("p", { class: "erro-campo" }, r.erro));
      return;
    }
    if (r.dados.length === 0) {
      resultados.replaceChildren(
        h("div", { class: "cartao" }, h("div", { class: "vazio" }, h("strong", {}, "Nada encontrado"), "Tente outra palavra, o SKU ou o código de barras.")),
      );
      return;
    }
    const titulo = r.dados.length === 1 ? "1 produto" : `${r.dados.length} produtos`;
    resultados.replaceChildren(
      h("h2", { class: "grupo-titulo" }, titulo),
      h("div", { class: "cartao" }, ...r.dados.map(itemProduto)),
      h("p", { class: "grupo-rodape" }, "Inserir coloca o texto na conversa aberta. Quem envia é você."),
    );
  }
  campo.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(buscar, 250);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(timer);
      buscar();
    }
  });

  const sair = h(
    "button",
    {
      class: "texto-perigo",
      type: "button",
      on: {
        click: async () => {
          await pedir({ tipo: "sair" });
          limparVenda();
          contaDaVenda = null;
          telaEntrar();
        },
      },
    },
    "Sair",
  );

  const produtos = h("div", { class: "secao" }, h("div", { class: "busca" }, lupa, campo), resultados);
  const respostas = secaoRespostas((erro) => telaEntrar(erro));
  respostas.el.hidden = true;
  const vender = secaoVender((erro) => telaEntrar(erro));
  vender.el.hidden = true;

  // controle segmentado: Produtos, Respostas ou Vender (a escolha vale enquanto o painel está aberto)
  type Aba = "produtos" | "respostas" | "vender";
  const botaoAba = (rotulo: string, aba: Aba) =>
    h("button", { type: "button", role: "tab", "aria-selected": "false", on: { click: () => mostrar(aba) } }, rotulo);
  const abaProdutos = botaoAba("Produtos", "produtos");
  const abaRespostas = botaoAba("Respostas", "respostas");
  const abaVender = botaoAba("Vender", "vender");
  function mostrar(aba: Aba) {
    produtos.hidden = aba !== "produtos";
    respostas.el.hidden = aba !== "respostas";
    vender.el.hidden = aba !== "vender";
    abaProdutos.setAttribute("aria-selected", String(aba === "produtos"));
    abaRespostas.setAttribute("aria-selected", String(aba === "respostas"));
    abaVender.setAttribute("aria-selected", String(aba === "vender"));
    sessionStorage.setItem("marcon_aba", aba);
    if (aba === "respostas") {
      if (!respostas.carregou()) respostas.carregar();
      respostas.focar();
    } else if (aba === "vender") vender.abrir();
    else campo.focus();
  }

  recarregarRespostas = () => {
    if (respostas.carregou() && document.body.contains(respostas.el)) respostas.carregar();
  };

  app.replaceChildren(
    topo(),
    h("div", { class: "abas", role: "tablist", "aria-label": "O que fazer" }, abaProdutos, abaRespostas, abaVender),
    produtos,
    respostas.el,
    vender.el,
    grupo("Conta", h("div", { class: "linha detalhe" }, sessao.email)),
    h("div", {}, sair),
    avisoEl,
  );
  const salva = sessionStorage.getItem("marcon_aba");
  mostrar(salva === "respostas" || salva === "vender" ? salva : "produtos");
}

// ---------------------------------------------------------------------------------------------

async function iniciar() {
  app.replaceChildren(topo(), h("p", { class: "vazio" }, "Carregando..."));
  const r = await pedir<Sessao | null>({ tipo: "sessao" });
  if (r.ok && r.dados) telaPrincipal(r.dados);
  else telaEntrar();
}

// Login pelo Google numa aba (plano B): quando a sessão chega, o painel aberto se atualiza.
chrome.storage.onChanged.addListener((mudou, area) => {
  if (area !== "local") return;
  if (Object.keys(mudou).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) {
    if (!document.querySelector(".busca")) iniciar();
  }
});

iniciar();
