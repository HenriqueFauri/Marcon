// Ajudas para levar as fotos do produto para fora do Marcon (marketplace, WhatsApp...).

export async function buscarImagem(url: string) {
  return (await fetch(url)).blob();
}

export function nomeArquivo(base: string, indice: number, tipo: string) {
  const slug =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "foto";
  const ext = tipo.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return `${slug}-${indice + 1}.${ext}`;
}

// a área de transferência só aceita PNG de forma confiável
export async function paraPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao converter"))), "image/png"),
  );
}

export function baixarBlob(blob: Blob, nome: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
