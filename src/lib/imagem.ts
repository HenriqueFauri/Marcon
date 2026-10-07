// Foto de produto: reduz no navegador antes de enviar. Uma foto de celular tem
// 3 a 6 MB; reduzida para 2048 px em JPEG fica em algumas centenas de KB, sem
// diferença visível numa tela. O arquivo original continua na galeria do aparelho.
// JPEG (e não WebP) porque marketplaces e redes sociais aceitam JPEG em qualquer lugar.

export const MAX_FOTOS_POR_ITEM = 10; // por produto e por variação (o banco também impõe)
export const LADO_MAXIMO = 2048;
export const QUALIDADE_JPEG = 0.85;
export const TAMANHO_ORIGINAL_MAX = 30 * 1024 * 1024; // só para não travar o navegador
export const TAMANHO_ENVIO_MAX = 4 * 1024 * 1024; // mesmo limite do bucket
const JA_PEQUENA = 1024 * 1024;

function nomeJpeg(nome: string) {
  const semExtensao = nome.replace(/\.[^.]+$/, "");
  return `${semExtensao || "foto"}.jpg`;
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
    if (escala === 1 && arquivo.type === "image/jpeg" && arquivo.size <= JA_PEQUENA) return arquivo;

    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d");
    if (!contexto) return arquivo;

    // JPEG não tem transparência: PNG com fundo transparente ficaria preto sem isto
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(imagem, 0, 0, largura, altura);

    const blob = await paraBlob(canvas, "image/jpeg", QUALIDADE_JPEG);
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], nomeJpeg(arquivo.name), { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    imagem.close();
  }
}

// Logo da empresa: reduz para caber em 512 px e grava como PNG (guarda a transparência e é um
// formato que o PDF do recibo consegue embutir; WebP não). Fica leve para a memória e o PDF.
const LADO_LOGO = 512;

export async function comprimirLogo(arquivo: File): Promise<File> {
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    return arquivo;
  }
  try {
    const escala = Math.min(1, LADO_LOGO / Math.max(imagem.width, imagem.height));
    if (escala === 1 && arquivo.type === "image/png" && arquivo.size <= JA_PEQUENA / 4) return arquivo;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    const contexto = canvas.getContext("2d");
    if (!contexto) return arquivo;
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const blob = await paraBlob(canvas, "image/png", 1);
    if (!blob || blob.type !== "image/png" || (blob.size >= arquivo.size && arquivo.type === "image/png")) return arquivo;
    return new File([blob], nomeJpeg(arquivo.name).replace(/\.jpg$/, ".png"), { type: "image/png", lastModified: Date.now() });
  } finally {
    imagem.close();
  }
}
