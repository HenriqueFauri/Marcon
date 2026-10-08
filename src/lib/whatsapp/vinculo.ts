// Código que o vendedor manda para o número do Marcon para ligar o WhatsApp à conta.
// Alfabeto sem 0/1/I/O: não confunde quando alguém digita.
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MINUTOS_DO_CODIGO = 15;
export const PREFIXO = "MARCON";

export function gerarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

// aceita "MARCON-K7P2Q9", "marcon k7p2q9" e "MARCONK7P2Q9"
export function lerCodigo(texto: string) {
  const m = texto.toUpperCase().match(/MARCON[\s-]*([2-9A-HJ-NP-Z]{6})\b/);
  return m ? m[1] : null;
}

export function textoDoVinculo(codigo: string) {
  return `${PREFIXO}-${codigo}`;
}

// só os últimos dígitos aparecem na tela
export function telefoneMascarado(telefone: string) {
  return `...${telefone.slice(-4)}`;
}
