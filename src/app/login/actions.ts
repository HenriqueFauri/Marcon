"use server";

import { createClient } from "@/lib/supabase/server";
import { vincularIndicacao } from "@/lib/indicacao-servidor";

// Chamada logo depois do cadastro com senha, quando a sessão já existe.
// (Google e link de confirmação passam por /auth/callback.)
export async function vincularIndicacaoDoCadastro() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await vincularIndicacao(user);
}
