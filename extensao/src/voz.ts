// Ponte do script da extensão (mundo isolado da aba do WhatsApp) com pagina.ts (mundo da página, onde
// fica a WA-JS). Mensagens por window.postMessage com id de pedido; resposta com prazo.

export type MotivoVoz = "carregando" | "sem-conversa" | "conversa-mudou" | "audio-invalido" | "ocupado" | "erro" | "sem-resposta";

export interface Conversa {
  id: string;
  nome: string;
}

export type RespostaPagina =
  | { ok: true; conversa?: Conversa | null }
  | { ok: false; motivo: MotivoVoz; detalhe?: string };

export function falarComPagina(acao: "conversa" | "enviarVoz", extra: Record<string, unknown> = {}, prazo = 5000): Promise<RespostaPagina> {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const fim = setTimeout(() => {
      window.removeEventListener("message", ouvir);
      resolve({ ok: false, motivo: "sem-resposta" });
    }, prazo);
    function ouvir(ev: MessageEvent) {
      const d = ev.data as { fonte?: string; id?: string } | undefined;
      if (ev.source !== window || d?.fonte !== "marcon-pagina" || d.id !== id) return;
      clearTimeout(fim);
      window.removeEventListener("message", ouvir);
      const { fonte: _f, id: _i, ...resto } = d as Record<string, unknown>;
      void _f;
      void _i;
      resolve(resto as RespostaPagina);
    }
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "marcon-ext", id, acao, ...extra }, location.origin);
  });
}

export function mensagemDeFalhaVoz(motivo: MotivoVoz | "sem-aba"): string {
  switch (motivo) {
    case "carregando":
      return "O WhatsApp ainda está carregando. Espere a lista de conversas aparecer e tente de novo.";
    case "sem-conversa":
      return "Abra a conversa no WhatsApp e tente de novo.";
    case "conversa-mudou":
      return "A conversa aberta mudou. Nada foi enviado. Confira e tente de novo.";
    case "audio-invalido":
      return "O áudio ficou inválido. Grave de novo.";
    case "ocupado":
      return "Ainda enviando o áudio anterior. Espere terminar.";
    case "sem-aba":
      return "Abra o WhatsApp Web nesta janela e tente de novo.";
    case "sem-resposta":
      return "O WhatsApp não respondeu. Recarregue a aba do WhatsApp (F5) e tente de novo. Confira na conversa se o áudio saiu antes de mandar outro.";
    case "erro":
      return "O WhatsApp não aceitou o envio. Confira na conversa se o áudio saiu antes de tentar de novo.";
  }
}
