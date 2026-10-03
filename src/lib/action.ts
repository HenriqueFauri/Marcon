// Resultado padrão das server actions. Erros esperados voltam como valor em vez
// de exceção: em produção o Next esconde a mensagem de erros lançados, e o
// usuário só veria "An error occurred".
// dados: contagens opcionais, para quem chama somar resultados de várias chamadas (importação em lotes)
// dados: contagens opcionais, para somar o resultado de várias chamadas (importação em lotes)
export type ActionResult = { ok: true; message?: string; id?: string; dados?: Record<string, number> } | { ok: false; error: string };

const MENSAGENS: [RegExp, string][] = [
  [/duplicate key|unique constraint/i, "Já existe um registro com esse nome."],
  [/violates foreign key/i, "Esse registro está em uso e não pode ser removido."],
  [/invalid input syntax for type (numeric|integer)/i, "Confira os valores numéricos."],
  [/Could not find the function/i, "O banco de dados está desatualizado. Rode as migrations mais recentes."],
  [/JWT|not authenticated|não autenticado/i, "Sua sessão expirou. Entre novamente."],
  [/fetch failed|network/i, "Sem conexão com o servidor. Tente de novo."],
];

export function mensagemDeErro(e: unknown, fallback = "Algo deu errado. Tente de novo.") {
  const bruto =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (!bruto) return fallback;
  for (const [padrao, mensagem] of MENSAGENS) {
    if (padrao.test(bruto)) return mensagem;
  }
  // mensagens das funções SQL já estão em português
  return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

export function ok(message?: string, dados?: Record<string, number>): ActionResult {
  return { ok: true, message, dados };
}

export function falha(e: unknown): ActionResult {
  return { ok: false, error: mensagemDeErro(e) };
}

export function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "").trim();
}

export function textoOuNull(formData: FormData, campo: string) {
  return texto(formData, campo) || null;
}

// aceita "12,50" e "12.50"
export function numero(formData: FormData, campo: string) {
  const bruto = texto(formData, campo).replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : NaN;
}
