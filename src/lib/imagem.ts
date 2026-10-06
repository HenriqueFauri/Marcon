// Foto de produto: reduz e converte para WebP no navegador antes de enviar. Uma foto de
// celular tem 3 a 6 MB; reduzida para 2048 px em WebP fica em algumas dezenas a poucas
// centenas de KB, sem diferença visível numa tela. O arquivo original continua na galeria
// do aparelho. Navegador que não gera WebP (Safari antigo) cai para JPEG. Para levar a foto
// a um marketplace, a tela de anúncios converte de volta para JPEG (ver paraJpeg).

export const MAX_FOTOS_POR_ITEM = 10; // por produto e por variação (o banco também impõe)
export const LADO_MAXIMO = 2048;
export const QUALIDADE_WEBP = 0.82;
export const QUALIDADE_JPEG = 0.85;
export const TAMANHO_ORIGINAL_MAX = 30 * 1024 * 1024; // só para não travar o navegador
export const TAMANHO_ENVIO_MAX = 4 * 1024 * 1024; // mesmo limite do bucket
const JA_PEQUENA = 1024 * 1024;

function trocarExtensao(nome: string, extensao: string) {
  const semExtensao = nome.replace(/.[^.]+$/, "");
  return `${semExtensao || "foto"}.${extensao}`;
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

// devolve o arquivo reduzido, ou o original se não der para (ou não valer a pena) reduzir
export async function comprimirImagem(arquivo: File): Promise<File> {
  let imagem: ImageBitmap;
  try {
    // "from-image" respeita a orientação da câmera (foto de celular vem "deitada" no arquivo)
    imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    return arquivo; // formato que o navegador não abre (ex.: HEIC no Chrome do computador)
  }

  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
    if (escala === 1 && arquivo.type === "image/webp" && arquivo.size <= JA_PEQUENA) return arquivo;

    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d");
    if (!contexto) return arquivo;

    // WebP guarda transparência; o fundo branco só entra no plano B (JPEG não tem alfa)
    contexto.drawImage(imagem, 0, 0, largura, altura);
    let blob = await paraBlob(canvas, "image/webp", QUALIDADE_WEBP);
    let tipo = "image/webp";
    if (blob?.type !== "image/webp") {
      // o navegador devolveu PNG no lugar: usa JPEG, que também é leve
      contexto.globalCompositeOperation = "destination-over";
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, largura, altura);
      blob = await paraBlob(canvas, "image/jpeg", QUALIDADE_JPEG);
      tipo = "image/jpeg";
    }
    if (!blob || blob.type !== tipo || blob.size >= arquivo.size) return arquivo;
    return new File([blob], trocarExtensao(arquivo.name, tipo === "image/webp" ? "webp" : "jpg"), {
      type: tipo,
      lastModified: Date.now(),
    });
  } finally {
    imagem.close();
  }
}

// Marketplaces e redes sociais aceitam JPEG em qualquer lugar, WebP nem sempre: ao baixar
// ou compartilhar uma foto para anunciar, entrega JPEG (fundo branco no lugar da transparência).
export async function paraJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;
  const imagem = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imagem.width;
    canvas.height = imagem.height;
    const contexto = canvas.getContext("2d");
    if (!contexto) return blob;
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(imagem, 0, 0);
    const jpeg = await paraBlob(canvas, "image/jpeg", 0.92);
    return jpeg?.type === "image/jpeg" ? jpeg : blob;
  } finally {
    imagem.close();
  }
}
