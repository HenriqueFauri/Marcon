import "server-only";

// Única peça que fala com o provedor do WhatsApp. Hoje é a Evolution API (não oficial, só para
// teste). Para trocar pela API oficial da Meta, reescreva só enviarMensagem() e extrairMensagem().

export function whatsappConfigurado() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

// Liga e desliga o assistente inteiro. Se WHATSAPP_EMAILS existir, só essas contas enxergam.
export function assistenteAtivo() {
  return process.env.WHATSAPP_ASSISTENTE_ATIVO === "1" && whatsappConfigurado();
}

export function contaPodeUsar(email: string | null | undefined) {
  const lista = (process.env.WHATSAPP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!lista.length) return true;
  return !!email && lista.includes(email.toLowerCase());
}

export async function enviarMensagem(telefone: string, texto: string) {
  const base = process.env.EVOLUTION_API_URL;
  const chave = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE;
  if (!base || !chave || !instancia) throw new Error("Evolution não configurada");
  const resposta = await fetch(`${base.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instancia)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: chave },
    body: JSON.stringify({ number: telefone, text: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`Evolution respondeu ${resposta.status}`);
}

export interface MensagemRecebida {
  id: string;
  telefone: string; // só dígitos
  texto: string;
}

interface Chave {
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  senderPn?: string;
  participant?: string;
  fromMe?: boolean;
}

function digitos(jid: string | undefined) {
  if (!jid) return null;
  const [numero, dominio] = jid.split("@");
  if (dominio !== "s.whatsapp.net") return null;
  const so = numero.split(":")[0].replace(/\D/g, "");
  return so || null;
}

// Payload do evento MESSAGES_UPSERT da Evolution v2. Devolve null para o que não é texto de uma
// conversa direta (grupo, mensagem enviada por nós, mídia, status).
export function extrairMensagem(corpo: unknown): MensagemRecebida | null {
  const c = corpo as { event?: string; data?: { key?: Chave; message?: Record<string, unknown> } } | null;
  if (!c || typeof c !== "object") return null;
  if (c.event && c.event.toLowerCase().replace(/_/g, ".") !== "messages.upsert") return null;
  const chave = c.data?.key;
  const msg = c.data?.message;
  if (!chave || !msg || chave.fromMe || !chave.id) return null;
  if (chave.remoteJid?.endsWith("@g.us") || chave.remoteJid === "status@broadcast") return null;

  // o WhatsApp novo pode trazer um identificador (@lid) no lugar do telefone; o telefone vem no campo alternativo
  const telefone = digitos(chave.remoteJid) ?? digitos(chave.remoteJidAlt) ?? digitos(chave.senderPn);
  if (!telefone) return null;

  const texto =
    (typeof msg.conversation === "string" && msg.conversation) ||
    ((msg.extendedTextMessage as { text?: string } | undefined)?.text ?? "");
  if (!texto.trim()) return null;
  return { id: chave.id, telefone, texto: texto.trim().slice(0, 1000) };
}
