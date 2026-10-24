// O PostgREST devolve no máximo 1000 linhas por consulta. lerTudo lê página a página até acabar.
// A consulta precisa de ordem estável (termine o .order com uma coluna única, como o id), senão
// uma linha pode pular ou repetir entre as páginas.
export const PAGINA_SUPABASE = 1000;

export async function lerTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA_SUPABASE) {
    const { data, error } = await pagina(de, de + PAGINA_SUPABASE - 1);
    if (error) throw error instanceof Error ? error : new Error((error as { message?: string }).message ?? String(error));
    tudo.push(...(data ?? []));
    if (!data || data.length < PAGINA_SUPABASE) return tudo;
  }
}
