"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";
import { formatBRL } from "@/lib/format";

// O banco confere o saldo com a linha do afiliado travada (função pedir_saque, migration 0023).
export async function pedirSaque(chavePix: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pedir_saque", { p_chave: chavePix });
    if (error) return falha(error);
    revalidatePath("/indique");
    return ok(`Saque de ${formatBRL(Number(data))} pedido. Avisamos aqui quando o PIX for feito.`);
  } catch (e) {
    return falha(e);
  }
}
