// Motivo do cancelamento da assinatura: pergunta opcional, lida pelo admin (migration 0071).

export const MOTIVOS_CANCELAMENTO = [
  { valor: "preco", label: "Achei caro" },
  { valor: "cartao", label: "Problema com o cartão" },
  { valor: "faltou_funcao", label: "Faltou uma função" },
  { valor: "vendo_pouco", label: "Estou vendendo pouco" },
  { valor: "rotina", label: "Não encaixou na minha rotina" },
  { valor: "outro", label: "Outro motivo" },
] as const;
export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number]["valor"];

// o mesmo limite está no banco
export const COMENTARIO_MAXIMO = 500;

export function ehMotivoCancelamento(v: unknown): v is MotivoCancelamento {
  return MOTIVOS_CANCELAMENTO.some((m) => m.valor === v);
}

export function rotuloDoCancelamento(v: string | null | undefined) {
  return MOTIVOS_CANCELAMENTO.find((m) => m.valor === v)?.label ?? "Motivo não reconhecido";
}
