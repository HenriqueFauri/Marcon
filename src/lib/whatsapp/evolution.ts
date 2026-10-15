import "server-only";

// Única peça que fala com o provedor do WhatsApp. Hoje é a Evolution API (não oficial, só para
// teste). Para trocar pela API oficial da Meta, reescreva só enviarMensagem() e extrairMensagem().

export function whatsappConfigurado() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

// Liga e desliga o assistente inteiro. Só as contas em WHATSAPP_EMAILS enxergam.
export function assistenteAtivo() {
  return process.env.WHATSAPP_ASSISTENTE_ATIVO === "1" && whatsappConfigurado();
}

export function contaPodeUsar(email: string | null | undefined) {
  const lista = (process.env.WHATSAPP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // lista vazia = ninguém: esquecer a variável nunca abre o assistente para todas as contas
  return !!email && lista.includes(email.toLowerCase());
}

// Escrever (lançar venda) tem chave própria e lista própria. Lista vazia = ninguém escreve.
export function escritaAtiva() {
  return process.env.WHATSAPP_ESCRITA === "1";
}

export function contaPodeEscrever(email: string | null | undefined) {
  const lista = (process.env.WHATSAPP_EMAILS_ESCRITA ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
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

// Mensagem de voz. O áudio chega dentro do evento quando a instância da Evolution está com
// webhook base64 ligado (docs/whatsapp-assistente.md); sem ele, base64 vem vazio.
export interface AudioRecebido {
  base64?: string;
  mimetype: string;
  segundos: number;
}

export interface MensagemRecebida {
  id: string;
  telefone: string; // só dígitos
  texto: string; // vazio quando é áudio: a rota transcreve e preenche
  audio?: AudioRecebido;
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
// conversa direta, de texto ou de voz (grupo, mensagem enviada por nós, outras mídias e status viram null).
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
  if (texto.trim()) return { id: chave.id, telefone, texto: texto.trim().slice(0, 1000) };

  const voz = msg.audioMessage as { mimetype?: string; seconds?: number; base64?: string } | undefined;
  if (!voz) return null;
  const base64 = [msg.base64, voz.base64].find((b): b is string => typeof b === "string" && b.length > 0);
  return {
    id: chave.id,
    telefone,
    texto: "",
    audio: { base64, mimetype: voz.mimetype || "audio/ogg", segundos: Number(voz.seconds) || 0 },
  };
}
