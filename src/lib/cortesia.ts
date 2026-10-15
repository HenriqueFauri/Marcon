// Cortesia: o admin dá o plano Marcon sem cobrança, por um prazo e com um motivo (migration 0050).

export const PRAZOS_CORTESIA = [7, 15, 30] as const;
export type PrazoCortesia = (typeof PRAZOS_CORTESIA)[number];

export const MOTIVOS_CORTESIA = [
  { valor: "parceiro", label: "Parceiro" },
  { valor: "influenciador", label: "Influenciador" },
  { valor: "indicacao", label: "Indicação" },
  { valor: "suporte", label: "Suporte" },
  { valor: "outro", label: "Outro" },
] as const;
export type MotivoCortesia = (typeof MOTIVOS_CORTESIA)[number]["valor"];

export function ehPrazoCortesia(v: unknown): v is PrazoCortesia {
  return (PRAZOS_CORTESIA as readonly unknown[]).includes(v);
}

export function ehMotivoCortesia(v: unknown): v is MotivoCortesia {
  return MOTIVOS_CORTESIA.some((m) => m.valor === v);
}

export function rotuloDoMotivo(v: string | null | undefined) {
  return MOTIVOS_CORTESIA.find((m) => m.valor === v)?.label ?? null;
}
