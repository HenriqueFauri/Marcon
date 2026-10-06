// CPF e CNPJ: máscara enquanto digita e validação pelos dígitos verificadores.
// O Asaas recusa documento inválido, então é melhor avisar antes de chamar.

export function formatarDocumento(valor: string) {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function cpfValido(d: string) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== Number(d[tamanho])) return false;
  }
  return true;
}

function cnpjValido(d: string) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  for (const tamanho of [12, 13]) {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    if ((resto < 2 ? 0 : 11 - resto) !== Number(d[tamanho])) return false;
  }
  return true;
}

export function documentoValido(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

// "CPF 000.000.000-00" ou "CNPJ 00.000.000/0000-00" pelo tamanho; outro tamanho sai como foi digitado
export function rotuloDocumento(valor: string | null | undefined) {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 11) return `CPF ${formatarDocumento(d)}`;
  if (d.length === 14) return `CNPJ ${formatarDocumento(d)}`;
  return valor?.trim() ? `Documento ${valor.trim()}` : null;
}
