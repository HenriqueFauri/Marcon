import "server-only";
import type { AudioRecebido } from "./evolution";

// Voz para texto das mensagens do assistente. Única peça que fala com o provedor de transcrição
// (hoje a OpenAI); para trocar, reescreva só transcrever(). O áudio não é guardado: só o texto,
// e só na conversa de 24 horas.

export const SEGUNDOS_MAXIMOS = Number(process.env.WHATSAPP_AUDIO_MAX_SEGUNDOS ?? 60);
const BYTES_MAXIMOS = 5 * 1024 * 1024;

export function transcricaoAtiva() {
  return !!process.env.TRANSCRICAO_API_KEY;
}

// Dica de vocabulário: ajuda o modelo a acertar o que o vendedor mais fala. Os nomes dos produtos
// dele entram aqui (só nome e marca, nada de preço ou cliente), cortados para caber no pedido.
const DICA = "Vendedor brasileiro no WhatsApp. Vocabulário: vendi, PIX, dinheiro, cartão, estoque, caixa, produto, cliente, R$.";
const MAX_DICA = 800;

function dicaComProdutos(produtos: string[]) {
  let texto = DICA;
  const nomes = [...new Set(produtos.map((p) => p.trim()).filter(Boolean))];
  if (nomes.length) texto += " Produtos da loja:";
  for (const n of nomes) {
    if (texto.length + n.length + 2 > MAX_DICA) break;
    texto += ` ${n};`;
  }
  return texto;
}

// Devolve o texto falado, ou null quando não deu para entender.
export async function transcrever(audio: AudioRecebido, produtos: string[] = []): Promise<string | null> {
  const chave = process.env.TRANSCRICAO_API_KEY;
  if (!chave || !audio.base64) return null;

  const bytes = Buffer.from(audio.base64, "base64");
  if (!bytes.length || bytes.length > BYTES_MAXIMOS) return null;

  // o WhatsApp manda "audio/ogg; codecs=opus": o provedor quer só o tipo e uma extensão que conheça
  const tipo = audio.mimetype.split(";")[0].trim() || "audio/ogg";
  const extensao = tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("mpeg") ? "mp3" : "ogg";

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: tipo }), `audio.${extensao}`);
  form.append("model", process.env.TRANSCRICAO_MODELO || "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("prompt", dicaComProdutos(produtos));
  form.append("response_format", "json");

  const resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  if (!resposta.ok) {
    // o corpo do erro não tem dado do cliente: ajuda a achar saldo, permissão ou modelo errado
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 300);
    throw new Error(`Transcrição respondeu ${resposta.status}: ${detalhe}`);
  }
  const { text } = (await resposta.json()) as { text?: string };
  const limpo = (text ?? "").trim().slice(0, 1000);
  return limpo || null;
}
