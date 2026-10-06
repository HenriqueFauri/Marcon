const TIMEZONE = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number | null | undefined) {
  return brl.format(Number(value ?? 0));
}

// datas "YYYY-MM-DD" vindas do banco são datas puras: interpretar como meia-noite local
export function formatData(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR");
}

export function formatDataCurta(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// "hoje" no fuso do negócio — toISOString() usa UTC e vira o dia seguinte depois das 21h em Brasília
export function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function mesAtual() {
  return hojeISO().slice(0, 7);
}

export function mesValido(value: string | undefined | null) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function intervaloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const proximo = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
  return { inicio, fimExclusivo: proximo };
}

export function deslocarMes(mes: string, delta: number) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nomeDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const texto = new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function somenteDigitos(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

// link de WhatsApp a partir de um telefone brasileiro digitado de qualquer jeito
export function linkWhatsApp(telefone: string | null | undefined, mensagem?: string) {
  let digitos = somenteDigitos(telefone);
  if (digitos.length < 10) return null;
  if (!digitos.startsWith("55") || digitos.length <= 11) digitos = "55" + digitos;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${digitos}${texto}`;
}

export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// telefone brasileiro com máscara: (11) 99999-9999 ou (11) 9999-9999 (fixo)
export function formatarTelefone(value: string | null | undefined) {
  let d = somenteDigitos(value);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = d.length > 10 ? 5 : 4;
  return resto.length <= corte ? `(${ddd}) ${resto}` : `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
