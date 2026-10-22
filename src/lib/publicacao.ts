// F24: quanto falta para renovar um anúncio publicado. Datas "YYYY-MM-DD" puras (sem fuso).
const DIA = 86_400_000;

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(ate + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / DIA);
}

export type SituacaoPublicacao = { tipo: "em-dia" | "vence-logo" | "vencido"; idade: number; restam: number };

export function situacaoDaPublicacao(publicadoEm: string, renovarDias: number, hoje: string): SituacaoPublicacao {
  const idade = Math.max(0, diasEntre(publicadoEm, hoje));
  const restam = renovarDias - idade;
  const tipo = restam < 0 ? "vencido" : restam <= 3 ? "vence-logo" : "em-dia";
  return { tipo, idade, restam };
}

export function textoDaSituacao(s: SituacaoPublicacao) {
  const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);
  if (s.tipo === "vencido") return `Renovar: publicado há ${dias(s.idade)}`;
  if (s.tipo === "vence-logo") return s.restam === 0 ? "Renovar hoje" : `Renovar em ${dias(s.restam)}`;
  return `Publicado há ${dias(s.idade)}`;
}
