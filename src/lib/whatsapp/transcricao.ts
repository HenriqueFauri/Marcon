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

export interface Transcricao {
  texto: string;
  // de 0 a 1: quão seguro o provedor está do que ouviu, na média. null = o provedor não informou
  confianca: number | null;
  // palavras em que o provedor ficou em dúvida (quase sempre ruído, nome próprio ou número)
  duvidosas: string[];
}

const DUVIDA = 0.5; // palavra abaixo disso é marcada como duvidosa
// abaixo disso o áudio inteiro é ruído: melhor pedir de novo do que responder a uma frase inventada
export const CONFIANCA_MINIMA = Number(process.env.WHATSAPP_AUDIO_CONFIANCA_MINIMA ?? 0.3);

interface Pedaco {
  token?: string;
  logprob?: number;
}

// O provedor devolve a probabilidade de cada pedaço de palavra. Junta os pedaços em palavras
// (um pedaço que começa com espaço abre palavra nova) e fica com o pior pedaço de cada uma.
function lerConfianca(pedacos: Pedaco[] | undefined): Pick<Transcricao, "confianca" | "duvidosas"> {
  const validos = (pedacos ?? []).filter((p): p is Required<Pedaco> => typeof p.token === "string" && typeof p.logprob === "number");
  if (!validos.length) return { confianca: null, duvidosas: [] };

  const palavras: { texto: string; p: number }[] = [];
  for (const { token, logprob } of validos) {
    const p = Math.exp(logprob);
    const ultima = palavras[palavras.length - 1];
    if (!ultima || /^\s/.test(token)) palavras.push({ texto: token.trim(), p });
    else {
      ultima.texto += token;
      ultima.p = Math.min(ultima.p, p);
    }
  }
  const media = Math.exp(validos.reduce((soma, v) => soma + v.logprob, 0) / validos.length);
  const duvidosas = palavras
    .filter((w) => w.p < DUVIDA)
    .map((w) => w.texto.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 3);
  return { confianca: Math.round(media * 100) / 100, duvidosas: [...new Set(duvidosas)].slice(0, 8) };
}

async function pedir(chave: string, audio: Blob, nome: string, modelo: string, dica: string, comConfianca: boolean) {
  const form = new FormData();
  form.append("file", audio, nome);
  form.append("model", modelo);
  form.append("language", "pt");
  form.append("prompt", dica);
  form.append("response_format", "json");
  if (comConfianca) form.append("include[]", "logprobs");
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(25000),
  });
}

// Devolve o que foi falado e o quanto dá para confiar, ou null quando não veio nada.
export async function transcrever(audio: AudioRecebido, produtos: string[] = []): Promise<Transcricao | null> {
  const chave = process.env.TRANSCRICAO_API_KEY;
  if (!chave || !audio.base64) return null;

  const bytes = Buffer.from(audio.base64, "base64");
  if (!bytes.length || bytes.length > BYTES_MAXIMOS) return null;

  // o WhatsApp manda "audio/ogg; codecs=opus": o provedor quer só o tipo e uma extensão que conheça
  const tipo = audio.mimetype.split(";")[0].trim() || "audio/ogg";
  const extensao = tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("mpeg") ? "mp3" : "ogg";
  const arquivo = new Blob([new Uint8Array(bytes)], { type: tipo });
  const modelo = process.env.TRANSCRICAO_MODELO || "gpt-4o-mini-transcribe";
  const dica = dicaComProdutos(produtos);

  // a confiança por palavra só existe nos modelos gpt-4o; se o provedor recusar o pedido, vai sem ela
  let comConfianca = modelo.startsWith("gpt-4o");
  let resposta = await pedir(chave, arquivo, `audio.${extensao}`, modelo, dica, comConfianca);
  if (resposta.status === 400 && comConfianca) {
    comConfianca = false;
    resposta = await pedir(chave, arquivo, `audio.${extensao}`, modelo, dica, false);
  }
  if (!resposta.ok) {
    // o corpo do erro não tem dado do cliente: ajuda a achar saldo, permissão ou modelo errado
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 300);
    throw new Error(`Transcrição respondeu ${resposta.status}: ${detalhe}`);
  }
  const corpo = (await resposta.json()) as { text?: string; logprobs?: Pedaco[] };
  const texto = (corpo.text ?? "").trim().slice(0, 1000);
  if (!texto) return null;

  const lido = lerConfianca(corpo.logprobs);
  // sem o texto (é do cliente): só o que serve para calibrar os cortes de confiança
  console.info(`[whatsapp] voz: ${modelo}, ${audio.segundos}s, confiança ${lido.confianca ?? "sem dado"}, ${lido.duvidosas.length} palavra(s) em dúvida`);
  return { texto, ...lido };
}
