// Biblioteca de mídia (extensão do WhatsApp Web, parte 3): fotos, PDFs e áudios que o dono anexa na
// conversa. Regras usadas pelo app e pela extensão (extensao/src/midias.ts reexporta este arquivo):
// sem import, para os dois lados compilarem igual. Os limites são os mesmos da migration 0074, que
// trava tudo de novo no banco e no Storage.

export type TipoMidia = "imagem" | "documento" | "audio";

export interface Midia {
  id: string;
  tipo: TipoMidia;
  titulo: string;
  nome_arquivo: string;
  path: string;
  mime: string;
  tamanho: number;
  duracao: number | null;
  origem: "arquivo" | "gravacao";
  resposta_id: string | null;
  created_at?: string;
}

export const BUCKET_MIDIAS = "midias";
export const LIMITE_ARQUIVO = 10 * 1024 * 1024; // 10 MB por arquivo (file_size_limit do bucket)
export const LIMITE_CONTA = 50 * 1024 * 1024; // 50 MB por conta
export const LIMITE_ARQUIVOS = 200; // arquivos por conta
export const LIMITE_TITULO_MIDIA = 80;
export const LIMITE_GRAVACAO_SEG = 120; // gravação na extensão: até 2 minutos

// Tipos que o WhatsApp abre como foto, documento ou áudio. extensão do arquivo -> mime e tipo.
// Áudio entra como arquivo de áudio (com play), nunca como mensagem de voz: ver extensao/README.md.
export const FORMATOS: Record<string, { mime: string; tipo: TipoMidia }> = {
  jpg: { mime: "image/jpeg", tipo: "imagem" },
  png: { mime: "image/png", tipo: "imagem" },
  webp: { mime: "image/webp", tipo: "imagem" },
  pdf: { mime: "application/pdf", tipo: "documento" },
  m4a: { mime: "audio/mp4", tipo: "audio" },
  mp3: { mime: "audio/mpeg", tipo: "audio" },
  ogg: { mime: "audio/ogg", tipo: "audio" },
  aac: { mime: "audio/aac", tipo: "audio" },
  amr: { mime: "audio/amr", tipo: "audio" },
};

// o que o celular e o computador costumam informar para o mesmo arquivo
const APELIDOS_EXTENSAO: Record<string, string> = { jpeg: "jpg", jfif: "jpg", mp4: "m4a", opus: "ogg", oga: "ogg" };
const APELIDOS_MIME: Record<string, string> = {
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mp4a-latm": "m4a",
  "audio/x-mp3": "mp3",
  "audio/mp3": "mp3",
  "audio/opus": "ogg",
  "audio/x-aac": "aac",
  "audio/3gpp": "amr",
};

// Atributo accept do campo de arquivo (o navegador do celular abre galeria, arquivos e gravações)
export const ACEITA = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".m4a", ".mp3", ".ogg", ".opus", ".aac", ".amr", "image/*", "audio/*", "application/pdf"].join(",");

// Extensão canônica de um arquivo, pelo nome e pelo tipo que o navegador informa. null: não aceito.
export function formatoDoArquivo(nome: string, mimeInformado: string): string | null {
  const bruto = (nome.split(".").pop() ?? "").toLowerCase();
  const pelaExtensao = nome.includes(".") ? (APELIDOS_EXTENSAO[bruto] ?? bruto) : "";
  if (pelaExtensao && FORMATOS[pelaExtensao]) {
    // .mp4 de vídeo não vale: só vira áudio quando o navegador diz que é áudio (ou não diz nada)
    if (bruto === "mp4" && mimeInformado && !mimeInformado.startsWith("audio/")) return null;
    return pelaExtensao;
  }
  const mime = (mimeInformado || "").toLowerCase().split(";")[0].trim();
  if (APELIDOS_MIME[mime]) return APELIDOS_MIME[mime];
  for (const [ext, f] of Object.entries(FORMATOS)) if (f.mime === mime) return ext;
  return null;
}

// Gravação do MediaRecorder: o formato que ele grava e que o WhatsApp aceita, na ordem de
// preferência. WebM fica de fora: o WhatsApp manda como documento, não como áudio.
export const GRAVACAO_FORMATOS = [
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
] as const;

export function formatoDeGravacao(suporta: (mime: string) => boolean): (typeof GRAVACAO_FORMATOS)[number] | null {
  return GRAVACAO_FORMATOS.find((f) => suporta(f.mime)) ?? null;
}

export function caminhoDaMidia(dono: string, id: string, ext: string): string {
  return `${dono}/${id}.${ext}`;
}

const CAMINHO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf|m4a|mp3|ogg|aac|amr)$/;
export function caminhoValido(path: string, dono: string): boolean {
  return CAMINHO.test(path) && path.startsWith(`${dono}/`);
}

// Título a partir do nome do arquivo ("catalogo_natal-2026.pdf" -> "catalogo natal 2026")
export function tituloDoArquivo(nome: string): string {
  const sem = nome.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return (sem || "Arquivo").slice(0, LIMITE_TITULO_MIDIA);
}

// Nome com que o arquivo chega na conversa: o título, sem barra nem caractere estranho, com a extensão
export function nomeParaEnvio(titulo: string, ext: string): string {
  const base = titulo
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${base || "arquivo"}.${ext}`;
}

export function extensaoDoCaminho(path: string): string {
  return path.split(".").pop() ?? "";
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatarDuracao(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const ROTULO_TIPO: Record<TipoMidia, string> = { imagem: "Foto", documento: "PDF", audio: "Áudio" };

// Linha de detalhe da lista ("PDF · 1,2 MB", "Áudio · 0:32 · gravado")
export function detalheDaMidia(m: Pick<Midia, "tipo" | "tamanho" | "duracao" | "origem">): string {
  const partes: string[] = [ROTULO_TIPO[m.tipo]];
  if (m.tipo === "audio" && m.duracao) partes.push(formatarDuracao(m.duracao));
  partes.push(formatarTamanho(m.tamanho));
  if (m.origem === "gravacao") partes.push("gravado");
  return partes.join(" · ");
}

export function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Busca na extensão: cada palavra no título, no tipo ou no nome do arquivo, sem ligar para acento
export function filtrarMidias<T extends Pick<Midia, "titulo" | "nome_arquivo" | "tipo">>(lista: T[], termo: string): T[] {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return lista;
  return lista.filter((m) => {
    const alvo = semAcento(`${m.titulo} ${m.nome_arquivo} ${ROTULO_TIPO[m.tipo]}`);
    return palavras.every((p) => alvo.includes(p));
  });
}

// Confere um arquivo escolhido antes de enviar. Devolve a extensão canônica ou a mensagem de erro.
export function conferirArquivo(nome: string, mime: string, tamanho: number): { ok: true; ext: string } | { ok: false; erro: string } {
  const ext = formatoDoArquivo(nome, mime);
  if (!ext) return { ok: false, erro: "Esse tipo de arquivo não vai. Use foto (JPG, PNG, WebP), PDF ou áudio (M4A, MP3, OGG, OPUS, AAC, AMR)." };
  if (tamanho <= 0) return { ok: false, erro: "O arquivo está vazio." };
  if (tamanho > LIMITE_ARQUIVO) return { ok: false, erro: `O arquivo passa de ${formatarTamanho(LIMITE_ARQUIVO)}. Use um menor.` };
  return { ok: true, ext };
}

// Nome do arquivo na biblioteca (também é o nome com que ele chega na conversa)
export function conferirTituloMidia(bruto: unknown): { ok: true; titulo: string } | { ok: false; erro: string } {
  const titulo = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!titulo) return { ok: false, erro: "Dê um nome para o arquivo." };
  if (titulo.length > LIMITE_TITULO_MIDIA) return { ok: false, erro: `O nome vai até ${LIMITE_TITULO_MIDIA} letras.` };
  return { ok: true, titulo };
}

// Mensagens do gatilho preparar_midia (limite da conta, arquivo sumido) já vêm em português
export function erroDaMidiaNoBanco(m: string): string | null {
  if (/Limite de 200|passou de 50 MB|Arquivo não encontrado/.test(m)) return m;
  if (/relacionado/.test(m)) return "Resposta pronta não encontrada.";
  return null;
}

// Storage recusou a subida pela política do bucket: a conta chegou ao limite
export const ERRO_BIBLIOTECA_CHEIA = `A biblioteca chegou ao limite (${formatarTamanho(LIMITE_CONTA)} ou ${LIMITE_ARQUIVOS} arquivos). Apague algum arquivo antes.`;
