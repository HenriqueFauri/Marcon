import { formatBRL, formatData, linkWhatsApp } from "@/lib/format";

// Cobrança de tudo o que o cliente deve numa mensagem só. Mesmo jeito da cobrança por parcela de
// A receber: "Olá, Fulano! Passando para lembrar..." e a chave PIX no fim, quando cadastrada.
const MAX_LINHAS = 6;

export function linkCobrarTudo({
  telefone,
  nome,
  parcelas,
  chavePix,
  hoje,
}: {
  telefone: string | null;
  nome: string;
  parcelas: { valor: number; vencimento: string }[];
  chavePix: string;
  hoje: string;
}) {
  if (parcelas.length === 0) return null;
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  const primeiro = nome.trim().split(" ")[0];
  const ola = `Olá${primeiro ? ", " + primeiro : ""}!`;
  const pix = chavePix ? `\n\nPra pagar no PIX, a chave é:\n${chavePix}` : "";
  const quando = (v: string) => `${v < hoje ? "venceu" : "vence"} ${formatData(v)}`;

  if (parcelas.length === 1) {
    const p = parcelas[0];
    return linkWhatsApp(telefone, `${ola} Passando para lembrar da parcela de ${formatBRL(p.valor)}, que ${quando(p.vencimento)}.${pix}`);
  }

  const linhas = parcelas.slice(0, MAX_LINHAS).map((p) => `• ${formatBRL(p.valor)}, ${quando(p.vencimento)}`);
  const resto = parcelas.length - MAX_LINHAS;
  if (resto > 0) linhas.push(`• e mais ${resto} ${resto === 1 ? "parcela" : "parcelas"}`);
  return linkWhatsApp(
    telefone,
    `${ola} Passando para lembrar das parcelas em aberto, que somam ${formatBRL(total)}:\n${linhas.join("\n")}${pix}`,
  );
}
