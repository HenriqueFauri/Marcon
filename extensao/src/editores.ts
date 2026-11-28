// Editores do painel: criar, editar e apagar respostas prontas, sequências (com os passos) e arquivos
// da biblioteca sem sair do WhatsApp. Os campos, os limites e as mensagens são os mesmos das telas do
// app (Configurações): as regras vêm de ../../src/lib e o banco confere tudo de novo (RLS, gatilhos,
// limites por conta). Nada aqui envia mensagem.
import { pedir } from "./mensagens.ts";
import type { RespostasDaConta } from "./respostas-db.ts";
import {
  LIMITE_ATALHO,
  LIMITE_TEXTO,
  LIMITE_TITULO,
  VARIAVEIS,
  normalizarAtalho,
  preencherVariaveis,
  variaveisSemValor,
  type DadosDaConta,
  type RespostaPronta,
} from "./respostas.ts";
import {
  LIMITE_PASSOS,
  LIMITE_TEXTO_PASSO,
  LIMITE_TITULO_SEQUENCIA,
  detalheDoPasso,
  fonteDoPasso,
  passoVazio,
  tituloDoPasso,
  type FontePasso,
  type PassoSequencia,
  type Sequencia,
} from "./sequencias.ts";
import { LIMITE_TITULO_MIDIA, ROTULO_TIPO, detalheDaMidia } from "./midias.ts";
import type { MidiaPainel } from "./midias-db.ts";
import {
  avisar,
  botaoTexto,
  cabecaDoGrupo,
  cabecalhoEditor,
  campoComRotulo,
  comBotao,
  confirmarApagar,
  h,
  linhaNova,
  segmentado,
  setas,
} from "./ui.ts";
import { icone } from "./icones.ts";

export interface Contexto {
  // depois de salvar ou apagar: recarrega as listas do painel (Respostas e Mídia)
  mudou: () => Promise<void>;
  aoPerderSessao: (erro: string) => void;
}

// resposta de um pedido de gravação: avisa o erro (ou volta ao login) e devolve se deu certo
function deuCerto(r: { ok: true } | { ok: false; erro: string }, ctx: Contexto): boolean {
  if (r.ok) return true;
  if (r.erro.includes("sessão")) ctx.aoPerderSessao(r.erro);
  else avisar(r.erro, true);
  return false;
}

const lista = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);

// Texto com as variáveis: botões "+ Nome do negócio" põem {negocio} onde está o cursor (como no app)
function caixaDeTexto(inicial: string, limite: number, placeholder: string, aoMudar: () => void) {
  const caixa = h("textarea", { class: "campo-texto", rows: "6", maxlength: String(limite), placeholder });
  caixa.value = inicial;
  const contador = h("span", { class: "dica" });
  const contar = () => (contador.textContent = `${caixa.value.length} de ${limite}`);
  caixa.addEventListener("input", () => {
    contar();
    aoMudar();
  });
  contar();
  const chips = h(
    "div",
    { class: "chips" },
    ...VARIAVEIS.map((v) =>
      h(
        "button",
        {
          class: "btn-pequeno neutro",
          type: "button",
          on: {
            click: () => {
              const ini = caixa.selectionStart ?? caixa.value.length;
              const fim = caixa.selectionEnd ?? caixa.value.length;
              // espaço antes quando a variável cairia colada numa palavra
              const marca = `${ini > 0 && !/\s/.test(caixa.value[ini - 1]) ? " " : ""}{${v.chave}}`;
              caixa.value = (caixa.value.slice(0, ini) + marca + caixa.value.slice(fim)).slice(0, limite);
              caixa.focus();
              caixa.setSelectionRange(ini + marca.length, ini + marca.length);
              contar();
              aoMudar();
            },
          },
        },
        `+ ${v.rotulo}`,
      ),
    ),
  );
  return { caixa, contador, chips: h("div", { class: "variaveis" }, h("span", { class: "rotulo-campo" }, "Colocar no texto"), chips) };
}

// Prévia do texto com os dados da conta; avisa a linha que some por falta de dado
function previa(dados: DadosDaConta) {
  const texto = h("p", { class: "texto-previa" });
  const rodape = h("p", { class: "grupo-rodape" });
  const el = h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, "Prévia"), h("div", { class: "cartao linha" }, texto), rodape);
  const rotulos = Object.fromEntries(VARIAVEIS.map((v) => [v.chave, v.rotulo]));
  return {
    el,
    atualizar(bruto: string) {
      const pronto = preencherVariaveis(bruto, dados);
      texto.textContent = pronto || "Nada";
      texto.classList.toggle("apagado", !pronto);
      const sem = variaveisSemValor(bruto, dados).map((c) => rotulos[c]);
      rodape.textContent =
        sem.length > 0
          ? `${pronto ? "" : "Com os dados de hoje, o texto fica vazio. "}A conta não tem ${lista(sem)}: ${sem.length === 1 ? "a linha com esse dado some" : "as linhas com esses dados somem"} do texto. Preencha em Configurações, no Marcon.`
          : "Assim o texto entra na conversa.";
    },
  };
}

function botoesSalvar(salvar: () => void, cancelar: () => void, rotulo = "Salvar") {
  const b = h("button", { class: "btn btn-principal", type: "button", on: { click: salvar } }, rotulo);
  return { botao: b, el: h("div", { class: "grupo" }, b, h("button", { class: "btn btn-secundario", type: "button", on: { click: cancelar } }, "Cancelar")) };
}

function linhaApagar(rotulo: string, fazer: () => void) {
  return h("div", { class: "linha-apagar" }, h("button", { class: "texto-perigo", type: "button", on: { click: fazer } }, icone("lixo", 16), rotulo));
}

// ---------------------------------------------------------------------------------------------
// Resposta pronta

export function editorResposta(conta: RespostasDaConta, resposta: RespostaPronta | null, ctx: Contexto & { voltar: () => void }) {
  const titulo = h("input", { class: "campo", type: "text", maxlength: String(LIMITE_TITULO), placeholder: "Ex.: Pix, Entrega, Saudação", "aria-label": "Título" });
  titulo.value = resposta?.titulo ?? "";
  const atalho = h("input", { class: "campo campo-atalho", type: "text", maxlength: String(LIMITE_ATALHO + 1), placeholder: "pix", autocapitalize: "none", spellcheck: "false", "aria-label": "Atalho" });
  atalho.value = resposta?.atalho ?? "";
  atalho.addEventListener("input", () => (atalho.value = normalizarAtalho(atalho.value)));
  const vista = previa(conta.dados);
  const texto = caixaDeTexto(resposta?.texto ?? "", LIMITE_TEXTO, "Oi! Aqui é da {negocio}. Como posso te ajudar?", () => vista.atualizar(texto.caixa.value));
  vista.atualizar(texto.caixa.value);

  const acoes = botoesSalvar(async () => {
    await comBotao(acoes.botao, "Salvando...", async () => {
      const r = await pedir<{ id: string }>({ tipo: "salvarResposta", id: resposta?.id, titulo: titulo.value, texto: texto.caixa.value, atalho: atalho.value });
      if (!deuCerto(r, ctx)) return;
      avisar(resposta ? "Resposta salva." : "Resposta criada.");
      await ctx.mudou();
      ctx.voltar();
    });
  }, ctx.voltar);

  const el = h(
    "div",
    { class: "secao" },
    cabecalhoEditor("Respostas", resposta ? resposta.titulo : "Nova resposta", ctx.voltar),
    h(
      "section",
      { class: "grupo" },
      h("h2", { class: "grupo-titulo" }, "Resposta"),
      h(
        "div",
        { class: "cartao formulario" },
        campoComRotulo("Título", titulo),
        campoComRotulo("Atalho", h("div", { class: "com-barra" }, h("span", { "aria-hidden": "true" }, "/"), atalho), "Opcional. Busque por /atalho."),
        campoComRotulo("Texto", texto.caixa, texto.contador),
      ),
      texto.chips,
    ),
    vista.el,
    resposta ? arquivosDaResposta(conta, resposta, ctx) : grupoSoTexto("Arquivos junto", "Depois de salvar, ligue aqui fotos, PDFs ou áudios a esta resposta."),
    acoes.el,
    resposta
      ? linhaApagar("Apagar resposta", async () => {
          if (!(await confirmarApagar(`Apagar “${resposta.titulo}”?`, "A resposta sai do app e da extensão."))) return;
          const r = await pedir({ tipo: "apagarResposta", id: resposta.id });
          if (!deuCerto(r, ctx)) return;
          avisar("Resposta apagada.");
          await ctx.mudou();
          ctx.voltar();
        })
      : null,
  );
  return el;
}

function grupoSoTexto(titulo: string, texto: string) {
  return h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, titulo), h("p", { class: "grupo-rodape" }, texto));
}

// Arquivos ligados à resposta (aparecem junto dela, com Anexar). Ligar e tirar valem na hora.
function arquivosDaResposta(conta: RespostasDaConta, resposta: RespostaPronta, ctx: Contexto) {
  const el = h("section", { class: "grupo" });
  let ligadas = (conta.midias ?? []).filter((m) => m.resposta_id === resposta.id);
  const todas = conta.arquivos ?? [];

  async function ligar(id: string, respostaId: string | null, botao: HTMLButtonElement) {
    await comBotao(botao, respostaId ? "Ligando..." : "Tirando...", async () => {
      const r = await pedir({ tipo: "ligarMidia", id, respostaId });
      if (!deuCerto(r, ctx)) return;
      const m = todas.find((x) => x.id === id);
      ligadas = respostaId ? (m ? [...ligadas, { ...m, resposta_id: respostaId }] : ligadas) : ligadas.filter((x) => x.id !== id);
      // a foto do momento também muda (outra resposta deixa de ter o arquivo)
      conta.midias = [...(conta.midias ?? []).filter((x) => x.id !== id), ...(respostaId && m ? [{ ...m, resposta_id: respostaId }] : [])];
      avisar(respostaId ? "Arquivo ligado." : "Arquivo tirado da resposta.");
      desenhar();
      await ctx.mudou();
    });
  }

  function desenhar() {
    const livres = todas.filter((m) => !ligadas.some((l) => l.id === m.id));
    // cada arquivo fica junto de uma resposta só: o que já está em outra mostra onde, e ligar pergunta antes de mover
    const emOutra = (id: string) => {
      const ligada = (conta.midias ?? []).find((x) => x.id === id && x.resposta_id && x.resposta_id !== resposta.id);
      return ligada ? (conta.respostas.find((r) => r.id === ligada.resposta_id)?.titulo ?? "outra resposta") : null;
    };
    const escolha = h(
      "select",
      { class: "seletor-cheio", "aria-label": "Arquivo para ligar" },
      h("option", { value: "" }, "Escolher arquivo"),
      ...livres.map((m) => {
        const onde = emOutra(m.id);
        return h("option", { value: m.id }, `${ROTULO_TIPO[m.tipo]}: ${m.titulo}${onde ? ` (em ${onde})` : ""}`);
      }),
    );
    const ligarB = h("button", { class: "btn-pequeno neutro", type: "button" }, "Ligar");
    ligarB.addEventListener("click", async () => {
      if (!escolha.value) return avisar("Escolha o arquivo.", true);
      const onde = emOutra(escolha.value);
      const titulo = todas.find((m) => m.id === escolha.value)?.titulo ?? "o arquivo";
      if (onde && !(await confirmarApagar(`Mover “${titulo}” para esta resposta?`, `Ele sai de “${onde}”. Cada arquivo fica junto de uma resposta só.`, "Mover", false))) return;
      ligar(escolha.value, resposta.id, ligarB);
    });
    el.replaceChildren(
      h("h2", { class: "grupo-titulo" }, "Arquivos junto"),
      h(
        "div",
        { class: "cartao" },
        ...ligadas.map((m) => {
          const tirar = h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Tirar ${m.titulo}` }, "Tirar");
          tirar.addEventListener("click", () => ligar(m.id, null, tirar));
          return h("div", { class: "linha-item" }, h("div", { class: "info" }, h("span", { class: "nome" }, m.titulo), h("span", { class: "detalhe" }, ROTULO_TIPO[m.tipo])), tirar);
        }),
        livres.length > 0 ? h("div", { class: "linha-item" }, escolha, ligarB) : null,
        ligadas.length === 0 && livres.length === 0 ? h("p", { class: "linha detalhe" }, "A biblioteca está vazia. Adicione arquivos na aba Mídia.") : null,
      ),
      h("p", { class: "grupo-rodape" }, "Aparecem junto da resposta, com Anexar. O áudio vai como mensagem de voz."),
    );
  }
  desenhar();
  return el;
}

// ---------------------------------------------------------------------------------------------
// Sequência: nome e passos (texto e/ou arquivo), em ordem

export function editorNovaSequencia(ctx: Contexto & { voltar: () => void; criada: (id: string, titulo: string) => void }) {
  const nome = h("input", { class: "campo", type: "text", maxlength: String(LIMITE_TITULO_SEQUENCIA), placeholder: "Ex.: Primeiro contato", "aria-label": "Nome" });
  const acoes = botoesSalvar(async () => {
    await comBotao(acoes.botao, "Criando...", async () => {
      const r = await pedir<{ id: string }>({ tipo: "salvarSequencia", titulo: nome.value });
      if (!deuCerto(r, ctx) || !r.ok) return;
      avisar("Sequência criada. Agora os passos.");
      await ctx.mudou();
      ctx.criada(r.dados.id, nome.value.trim().replace(/\s+/g, " "));
    });
  }, ctx.voltar, "Criar");
  nome.addEventListener("keydown", (e) => e.key === "Enter" && acoes.botao.click());
  return h(
    "div",
    { class: "secao" },
    cabecalhoEditor("Respostas", "Nova sequência", ctx.voltar),
    h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, "Sequência"), h("div", { class: "cartao formulario" }, campoComRotulo("Nome", nome)), h("p", { class: "grupo-rodape" }, "Passos em ordem. No painel, cada clique põe um passo na conversa; quem envia é você.")),
    acoes.el,
  );
}

export function editorSequencia(
  conta: RespostasDaConta,
  seq: Sequencia,
  ctx: Contexto & { voltar: () => void; abrirPasso: (passo: PassoSequencia | null, numero: number) => void },
) {
  const nome = h("input", { class: "campo", type: "text", maxlength: String(LIMITE_TITULO_SEQUENCIA), "aria-label": "Nome" });
  nome.value = seq.titulo;
  const salvarNome = h("button", { class: "btn-pequeno neutro", type: "button" }, "Salvar nome");
  salvarNome.addEventListener("click", () =>
    comBotao(salvarNome, "Salvando...", async () => {
      const r = await pedir({ tipo: "salvarSequencia", id: seq.id, titulo: nome.value });
      if (!deuCerto(r, ctx)) return;
      avisar("Nome salvo.");
      seq.titulo = nome.value.trim().replace(/s+/g, " ");
      const h1 = salvarNome.closest(".secao")?.querySelector(".titulo-editor");
      if (h1) h1.textContent = seq.titulo;
      await ctx.mudou();
    }),
  );

  const respostas = conta.respostas.map((r) => ({ id: r.id, titulo: r.titulo, texto: r.texto }));
  const arquivos = conta.arquivos ?? [];
  let passos = (conta.passos ?? []).filter((p) => p.sequencia_id === seq.id).sort((a, b) => a.ordem - b.ordem);
  let organizando = false;
  const grupoPassos = h("section", { class: "grupo" });

  let ordenando = false;
  async function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (ordenando || j < 0 || j >= passos.length) return;
    const antes = passos;
    const nova = [...passos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    passos = nova;
    desenhar();
    ordenando = true;
    const r = await pedir({ tipo: "reordenarPassos", sequenciaId: seq.id, ids: nova.map((p) => p.id) });
    ordenando = false;
    if (!deuCerto(r, ctx)) {
      passos = antes;
      desenhar();
      return;
    }
    await ctx.mudou();
  }

  function desenhar() {
    const organizar = passos.length > 1 ? botaoTexto(organizando ? "Pronto" : "Organizar", () => ((organizando = !organizando), desenhar())) : null;
    const linhas = passos.map((p, i) => {
      const vazio = passoVazio(p, respostas, arquivos);
      const info = h(
        "div",
        { class: "info" },
        h("span", { class: "nome" }, `${i + 1}. ${tituloDoPasso(p, respostas, arquivos)}`),
        h("span", { class: vazio ? "detalhe estado-aviso" : "detalhe" }, vazio ? "Vazio: a resposta ou o arquivo foi apagado" : detalheDoPasso(p, respostas, arquivos)),
      );
      if (organizando) return h("div", { class: "linha-item" }, info, setas(`passo ${i + 1}`, i, passos.length, mover));
      const editar = h("button", { class: "btn-pequeno neutro", type: "button", "aria-label": `Editar passo ${i + 1}` }, icone("lapis", 14), "Editar");
      editar.addEventListener("click", () => ctx.abrirPasso(p, i + 1));
      return h("div", { class: "linha-item" }, info, editar);
    });
    const novo = passos.length < LIMITE_PASSOS && !organizando ? linhaNova("Novo passo", () => ctx.abrirPasso(null, passos.length + 1)) : null;
    grupoPassos.replaceChildren(
      cabecaDoGrupo(passos.length === 1 ? "1 passo" : `${passos.length} passos`, organizar),
      h("div", { class: "cartao" }, ...linhas, novo, passos.length === 0 && !novo ? h("p", { class: "linha detalhe" }, "Sem passos.") : null),
      h(
        "p",
        { class: "grupo-rodape" },
        passos.length >= LIMITE_PASSOS
          ? `Até ${LIMITE_PASSOS} passos por sequência.`
          : "Passo com texto e arquivo: o primeiro clique insere o texto, o segundo abre a prévia do arquivo (o áudio vai como mensagem de voz, depois de confirmar a conversa).",
      ),
    );
  }
  desenhar();

  return h(
    "div",
    { class: "secao" },
    cabecalhoEditor("Respostas", seq.titulo, ctx.voltar),
    h("section", { class: "grupo" }, h("h2", { class: "grupo-titulo" }, "Nome"), h("div", { class: "cartao formulario" }, h("div", { class: "linha-item" }, nome, salvarNome))),
    grupoPassos,
    linhaApagar("Apagar sequência", async () => {
      if (!(await confirmarApagar(`Apagar “${seq.titulo}”?`, "Os passos saem junto. A sequência sai do app e da extensão."))) return;
      const r = await pedir({ tipo: "apagarSequencia", id: seq.id });
      if (!deuCerto(r, ctx)) return;
      avisar("Sequência apagada.");
      await ctx.mudou();
      ctx.voltar();
    }),
  );
}

export function editorPasso(conta: RespostasDaConta, seq: Sequencia, passo: PassoSequencia | null, numero: number, ctx: Contexto & { voltar: () => void }) {
  let fonte: FontePasso = passo ? fonteDoPasso(passo) : "escrever";
  const vista = previa(conta.dados);
  const texto = caixaDeTexto(passo?.texto ?? "", LIMITE_TEXTO_PASSO, "Oi! Aqui é da {negocio}. Vou te mandar o catálogo.", () => vista.atualizar(texto.caixa.value));
  const respostas = conta.respostas;
  const arquivos = conta.arquivos ?? [];
  const escolhaResposta = h("select", { class: "seletor-cheio", "aria-label": "Resposta pronta" }, ...respostas.map((r) => h("option", { value: r.id }, r.titulo)));
  if (passo?.resposta_id && respostas.some((r) => r.id === passo.resposta_id)) escolhaResposta.value = passo.resposta_id;
  const escolhaArquivo = h(
    "select",
    { class: "seletor-cheio", "aria-label": "Foto, PDF ou áudio" },
    h("option", { value: "" }, "Nenhum"),
    ...arquivos.map((m) => h("option", { value: m.id }, `${ROTULO_TIPO[m.tipo]}: ${m.titulo}`)),
  );
  if (passo?.midia_id && arquivos.some((m) => m.id === passo.midia_id)) escolhaArquivo.value = passo.midia_id;
  const ficouVazio = passo ? passoVazio(passo, respostas, arquivos) : false;

  const corpoTexto = h("div", { class: "corpo-fonte" });
  function desenharFonte() {
    if (fonte === "escrever") {
      corpoTexto.replaceChildren(h("div", { class: "cartao formulario" }, campoComRotulo("Texto", texto.caixa, texto.contador)), texto.chips, vista.el);
      vista.atualizar(texto.caixa.value);
    } else if (fonte === "resposta") {
      corpoTexto.replaceChildren(
        respostas.length === 0
          ? h("p", { class: "grupo-rodape" }, "Nenhuma resposta pronta. Crie uma na lista de respostas.")
          : h("div", { class: "cartao formulario" }, campoComRotulo("Resposta pronta", escolhaResposta, "O passo usa o texto dela como estiver na hora.")),
      );
    } else corpoTexto.replaceChildren(h("p", { class: "grupo-rodape" }, "O passo só tem o arquivo."));
  }
  desenharFonte();

  const acoes = botoesSalvar(async () => {
    await comBotao(acoes.botao, "Salvando...", async () => {
      const r = await pedir({
        tipo: "salvarPasso",
        id: passo?.id,
        sequenciaId: seq.id,
        fonte,
        texto: texto.caixa.value,
        respostaId: fonte === "resposta" ? escolhaResposta.value : "",
        midiaId: escolhaArquivo.value,
      });
      if (!deuCerto(r, ctx)) return;
      avisar(passo ? "Passo salvo." : "Passo criado.");
      await ctx.mudou();
      ctx.voltar();
    });
  }, ctx.voltar);

  return h(
    "div",
    { class: "secao" },
    cabecalhoEditor(seq.titulo, passo ? `Passo ${numero}` : "Novo passo", ctx.voltar),
    h(
      "section",
      { class: "grupo" },
      h("h2", { class: "grupo-titulo" }, "Texto"),
      segmentado<FontePasso>(
        "Texto do passo",
        [
          { valor: "escrever", rotulo: "Escrever" },
          { valor: "resposta", rotulo: "Resposta" },
          { valor: "nenhum", rotulo: "Sem texto" },
        ],
        fonte,
        (v) => {
          fonte = v;
          desenharFonte();
        },
      ),
      corpoTexto,
      ficouVazio ? h("p", { class: "grupo-rodape estado-aviso" }, "A resposta pronta ou o arquivo deste passo foi apagado. Escolha outro texto ou arquivo.") : null,
    ),
    h(
      "section",
      { class: "grupo" },
      h("h2", { class: "grupo-titulo" }, "Arquivo"),
      h("div", { class: "cartao formulario" }, campoComRotulo("Foto, PDF ou áudio", escolhaArquivo)),
      h("p", { class: "grupo-rodape" }, arquivos.length === 0 ? "A biblioteca está vazia. Adicione arquivos na aba Mídia." : "Opcional. Com texto e arquivo, o texto entra primeiro."),
    ),
    acoes.el,
    passo
      ? linhaApagar("Apagar passo", async () => {
          if (!(await confirmarApagar(`Apagar o passo ${numero}?`, "O passo sai da sequência, no app e na extensão."))) return;
          const r = await pedir({ tipo: "apagarPasso", id: passo.id });
          if (!deuCerto(r, ctx)) return;
          avisar("Passo apagado.");
          await ctx.mudou();
          ctx.voltar();
        })
      : null,
  );
}

// ---------------------------------------------------------------------------------------------
// Arquivo da biblioteca: nome, resposta ligada e apagar

export function editorMidia(m: MidiaPainel, miniatura: HTMLElement, ctx: Contexto & { voltar: () => void }) {
  const nome = h("input", { class: "campo", type: "text", maxlength: String(LIMITE_TITULO_MIDIA), "aria-label": "Nome" });
  nome.value = m.titulo;
  const escolhaResposta = h("select", { class: "seletor-cheio", "aria-label": "Resposta pronta" }, h("option", { value: "" }, "Nenhuma"));
  escolhaResposta.disabled = true;
  // as respostas da conta, para ligar o arquivo a uma delas
  pedir<RespostasDaConta>({ tipo: "respostas" }).then((r) => {
    if (!r.ok) return;
    escolhaResposta.append(...r.dados.respostas.map((x) => h("option", { value: x.id }, x.titulo)));
    escolhaResposta.value = m.resposta_id && r.dados.respostas.some((x) => x.id === m.resposta_id) ? m.resposta_id : "";
    escolhaResposta.disabled = false;
  });

  const acoes = botoesSalvar(async () => {
    await comBotao(acoes.botao, "Salvando...", async () => {
      // enquanto a lista de respostas não chegou, a ligação fica como estava
      const respostaId = escolhaResposta.disabled ? m.resposta_id : escolhaResposta.value || null;
      const r = await pedir({ tipo: "salvarMidia", id: m.id, titulo: nome.value, respostaId });
      if (!deuCerto(r, ctx)) return;
      avisar("Arquivo salvo.");
      await ctx.mudou();
      ctx.voltar();
    });
  }, ctx.voltar);
  nome.addEventListener("keydown", (e) => e.key === "Enter" && acoes.botao.click());

  return h(
    "div",
    { class: "secao" },
    cabecalhoEditor("Mídia", m.titulo, ctx.voltar),
    h("section", { class: "grupo" }, h("div", { class: "cartao" }, h("div", { class: "produto" }, miniatura, h("div", { class: "info" }, h("span", { class: "nome" }, m.nome_arquivo), h("span", { class: "detalhe" }, detalheDaMidia(m)))))),
    h(
      "section",
      { class: "grupo" },
      h("h2", { class: "grupo-titulo" }, "Arquivo"),
      h("div", { class: "cartao formulario" }, campoComRotulo("Nome", nome, "Também é o nome com que o arquivo chega na conversa."), campoComRotulo("Junto da resposta", escolhaResposta, "Opcional. Aparece junto dela, com Anexar.")),
    ),
    acoes.el,
    linhaApagar("Apagar arquivo", async () => {
      if (!(await confirmarApagar(`Apagar “${m.titulo}”?`, "O arquivo sai do app e da extensão. Passo de sequência que usava ele fica sem arquivo."))) return;
      const r = await pedir({ tipo: "apagarMidia", id: m.id });
      if (!deuCerto(r, ctx)) return;
      avisar("Arquivo apagado.");
      await ctx.mudou();
      ctx.voltar();
    }),
  );
}
