// Arquivo em texto (base64) para passar pelas mensagens da extensão, que só levam JSON.
// Usado no service worker (que baixa) e no script da aba do WhatsApp (que monta o arquivo).

export function paraBase64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  const passo = 0x8000; // em pedaços: String.fromCharCode com milhões de argumentos estoura a pilha
  for (let i = 0; i < b.length; i += passo) bin += String.fromCharCode(...b.subarray(i, i + passo));
  return btoa(bin);
}

export function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  const bin = atob(texto);
  const b = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

// Arquivo que vai para a prévia de anexo do WhatsApp
export interface ArquivoAnexo {
  base64: string;
  mime: string;
  nome: string;
}
