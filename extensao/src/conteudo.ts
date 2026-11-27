// Roda dentro do web.whatsapp.com. Só faz isto, sempre a pedido da própria extensão:
// 1) coloca o texto pronto na caixa de mensagem (sem enviar);
// 2) coloca uma foto ou PDF na prévia de anexo do WhatsApp (sem enviar);
// 3) diz o nome da conversa aberta e, depois do clique do dono em "Enviar áudio de voz" confirmado
//    para essa conversa, manda UM áudio de voz por pagina.ts (mundo da página, WA-JS);
// 4) no navegador sem painel lateral, mostra ou esconde o painel embutido.
// Não lê mensagens, não observa a página, não fala com servidor nenhum.
import { inserirTexto } from "./inserir.ts";
import { anexarArquivo, montarArquivo } from "./anexar.ts";
import { falarComPagina } from "./voz.ts";
import type { PedidoAba } from "./mensagens.ts";

const ID_PAINEL = "marcon-painel-embutido";

function alternarPainel() {
  const atual = document.getElementById(ID_PAINEL);
  if (atual) {
    atual.remove();
    return;
  }
  const caixa = document.createElement("div");
  caixa.id = ID_PAINEL;
  caixa.style.cssText = [
    "position:fixed",
    "top:0",
    "right:0",
    "width:380px",
    "max-width:100vw",
    "height:100vh",
    "z-index:2147483647",
    "box-shadow:-8px 0 24px rgba(0,0,0,.18)",
    "background:#f2f2f7",
  ].join(";");
  const quadro = document.createElement("iframe");
  quadro.src = chrome.runtime.getURL("painel.html?modo=embutido");
  // microfone: gravar áudio no painel embutido (o WhatsApp pode não repassar; aí o painel avisa)
  quadro.allow = "clipboard-write; microphone";
  quadro.title = "Marcon";
  quadro.style.cssText = "border:0;width:100%;height:100%;display:block";
  caixa.appendChild(quadro);
  document.documentElement.appendChild(caixa);
}

chrome.runtime.onMessage.addListener((pedido: PedidoAba, remetente, responder) => {
  if (remetente.id !== chrome.runtime.id) return false;
  if (pedido.tipo === "inserir") {
    inserirTexto(String(pedido.texto ?? ""))
      .then(responder)
      .catch(() => responder({ ok: false, motivo: "nao-entrou" }));
    return true;
  }
  if (pedido.tipo === "anexar") {
    Promise.resolve()
      .then(() => anexarArquivo(montarArquivo(pedido.arquivo)))
      .then(responder)
      .catch(() => responder({ ok: false, motivo: "nao-abriu" }));
    return true;
  }
  if (pedido.tipo === "conversa") {
    falarComPagina("conversa").then(responder);
    return true;
  }
  if (pedido.tipo === "enviarVoz") {
    // o envio espera a confirmação do servidor do WhatsApp: prazo maior
    falarComPagina("enviarVoz", { conversa: pedido.conversa, base64: pedido.base64 }, 60000).then(responder);
    return true;
  }
  if (pedido.tipo === "alternarPainel") {
    alternarPainel();
    responder({ ok: true });
  }
  return false;
});
