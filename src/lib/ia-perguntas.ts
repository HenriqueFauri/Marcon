// Perguntas rápidas antes de escrever o anúncio com IA. O que o vendedor responde aqui vira
// fato no texto; o que ele deixa em branco a IA não diz. Sem imports de servidor: a tela e a action usam.

export const ESTADOS = [
  { id: "novo_caixa", rotulo: "Novo, na caixa", curto: "Novo na caixa" },
  { id: "novo", rotulo: "Novo, sem caixa", curto: "Novo" },
  { id: "seminovo", rotulo: "Seminovo, sem marcas de uso", curto: "Seminovo" },
  { id: "usado_bom", rotulo: "Usado, em bom estado", curto: "Usado, bom estado" },
  { id: "usado_marcas", rotulo: "Usado, com marcas de uso", curto: "Usado com marcas" },
] as const;

export const ENTREGAS = [
  { id: "retirada", rotulo: "Só retirada em mãos", curto: "Só retirada" },
  { id: "entrega", rotulo: "Só entrega (combinar)", curto: "Só entrega" },
  { id: "ambos", rotulo: "Retirada em mãos ou combinar entrega", curto: "Retirada ou entrega" },
] as const;

export interface PerguntasIA {
  estado: string; // id de ESTADOS, ou "" se o vendedor não quis dizer
  entrega: string; // id de ENTREGAS, ou ""
  acompanha: string; // o que vem junto (cabo, caixa, divisor...)
  dica: string; // qualquer outra coisa que o vendedor queira que apareça
}

export const PERGUNTAS_VAZIAS: PerguntasIA = { estado: "", entrega: "", acompanha: "", dica: "" };

export const LIMITE_ACOMPANHA = 150;
export const LIMITE_DICA = 300;

// Servidor: não confia no que veio da tela. Valor desconhecido vira "não informado".
export function limparPerguntas(p: PerguntasIA): PerguntasIA {
  return {
    estado: ESTADOS.some((e) => e.id === p.estado) ? p.estado : "",
    entrega: ENTREGAS.some((e) => e.id === p.entrega) ? p.entrega : "",
    acompanha: String(p.acompanha ?? "").trim().slice(0, LIMITE_ACOMPANHA),
    dica: String(p.dica ?? "").trim().slice(0, LIMITE_DICA),
  };
}

export function rotuloDoEstado(id: string) {
  return ESTADOS.find((e) => e.id === id)?.rotulo ?? null;
}

export function rotuloDaEntrega(id: string) {
  return ENTREGAS.find((e) => e.id === id)?.rotulo ?? null;
}
