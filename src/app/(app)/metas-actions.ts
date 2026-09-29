"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";

// Aceita "10000", "10.000", "10.000,50" e "4200.50".
function valorMeta(formData: FormData, campo: string) {
  const original = String(formData.get(campo) ?? "").trim();
  if (!original) return null;
  let bruto = original.replace(/[^\d.,]/g, "");
  if (!bruto) return NaN;
  if (bruto.includes(",")) bruto = bruto.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(bruto) || (bruto.match(/\./g) ?? []).length > 1) bruto = bruto.replace(/\./g, "");
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN;
}

export async function atualizarMetas(formData: FormData): Promise<ActionResult> {
  try {
    const vendas = valorMeta(formData, "meta_vendas");
    const lucro = valorMeta(formData, "meta_lucro");
    if (Number.isNaN(vendas) || Number.isNaN(lucro)) {
      return { ok: false, error: "Digite um valor maior que zero, ou deixe em branco pra não ter meta." };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: { meta_vendas: vendas, meta_lucro: lucro } });
    if (error) return falha(error);

    revalidatePath("/", "layout");
    return ok("Metas salvas.");
  } catch (e) {
    return falha(e);
  }
}
