// Roda no mundo da própria página do WhatsApp Web, junto da biblioteca WA-JS (wa.js, Apache 2.0), que
// expõe as funções internas do WhatsApp. Só atende dois pedidos do script da extensão, sempre depois
// de um clique do dono no painel:
// 1) "conversa": nome e id da conversa aberta (para o painel mostrar para quem vai);
// 2) "enviarVoz": envia UM áudio OGG/Opus como mensagem de voz na conversa aberta, só se ela ainda é a
//    mesma que o dono confirmou. Sem fila, sem atraso, sem "gravando" simulado.
// Não lê mensagens, não observa conversas, não fala com servidor nenhum.

interface Pedido {
  fonte: "marcon-ext";
  id: string;
  acao: "conversa" | "enviarVoz";
  conversa?: string;
  base64?: string;
}

interface ChatWpp {
  id: { _serialized: string };
  formattedTitle?: string;
  name?: string;
  contact?: { formattedName?: string; pushname?: string };
}

interface Wpp {
  isReady?: boolean;
  chat: {
    getActiveChat(): ChatWpp | undefined;
    sendFileMessage(chatId: unknown, conteudo: string, opcoes: Record<string, unknown>): Promise<unknown>;
  };
}

const LIMITE_BASE64 = 8 * 1024 * 1024; // ~6 MB de áudio: bem acima de 2 minutos em Opus

function wpp(): Wpp | null {
  const w = (window as unknown as { WPP?: Wpp }).WPP;
  return w && w.isReady ? w : null;
}

function nomeDa(chat: ChatWpp): string {
  return (chat.formattedTitle || chat.name || chat.contact?.formattedName || chat.contact?.pushname || "Conversa sem nome").slice(0, 80);
}

let enviando = false;

window.addEventListener("message", async (ev: MessageEvent) => {
  const p = ev.data as Pedido | undefined;
  if (ev.source !== window || !p || p.fonte !== "marcon-ext" || typeof p.id !== "string") return;
  const responder = (r: Record<string, unknown>) => window.postMessage({ fonte: "marcon-pagina", id: p.id, ...r }, location.origin);

  const w = wpp();
  if (!w) return responder({ ok: false, motivo: "carregando" });
  try {
    const chat = w.chat.getActiveChat();
    if (p.acao === "conversa") {
      return responder({ ok: true, conversa: chat ? { id: chat.id._serialized, nome: nomeDa(chat) } : null });
    }
    if (p.acao === "enviarVoz") {
      if (!chat) return responder({ ok: false, motivo: "sem-conversa" });
      if (chat.id._serialized !== p.conversa) return responder({ ok: false, motivo: "conversa-mudou" });
      if (typeof p.base64 !== "string" || p.base64.length === 0 || p.base64.length > LIMITE_BASE64) {
        return responder({ ok: false, motivo: "audio-invalido" });
      }
      // um envio por vez: um segundo clique enquanto o primeiro vai não manda outro
      if (enviando) return responder({ ok: false, motivo: "ocupado" });
      enviando = true;
      try {
        await w.chat.sendFileMessage(chat.id, `data:audio/ogg;base64,${p.base64}`, {
          type: "audio",
          isPtt: true,
          waveform: true,
          mimetype: "audio/ogg; codecs=opus",
          delay: 0, // nunca "gravando..." simulado antes de mandar
        });
      } finally {
        enviando = false;
      }
      return responder({ ok: true });
    }
  } catch (e) {
    return responder({ ok: false, motivo: "erro", detalhe: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
