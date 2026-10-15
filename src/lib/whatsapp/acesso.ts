import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfirmado } from "@/lib/admin";
import { assistenteAtivo } from "./evolution";

// Único lugar que decide quem usa o assistente no WhatsApp. Liberação conta por conta, no /admin
// (tabela whatsapp_liberados, migration 0049). O padrão é nada: conta sem linha não vê o assistente.
//   usar   = vê o assistente, vincula o número e pergunta
//   lancar = também lança pelo WhatsApp (venda, produto, estoque e caixa, sempre com o resumo antes)
//   admin  = admin do Marcon (dois fatores): tudo liberado e cotas maiores
// WHATSAPP_ASSISTENTE_ATIVO continua como chave geral: vazia, ninguém usa, nem o admin.
export interface Acesso {
  usar: boolean;
  lancar: boolean;
  admin: boolean;
}

const NENHUM: Acesso = { usar: false, lancar: false, admin: false };

export async function acessoDoAssistente(user: User | null | undefined): Promise<Acesso> {
  if (!user || !assistenteAtivo()) return NENHUM;
  if (await adminConfirmado(user)) return { usar: true, lancar: true, admin: true };

  const db = createAdminClient();
  if (!db) return NENHUM;
  const { data, error } = await db.from("whatsapp_liberados").select("lancar").eq("owner_id", user.id).maybeSingle();
  if (error) {
    console.error("[whatsapp] acesso", error.message);
    return NENHUM; // na dúvida, não libera
  }
  if (!data) return NENHUM;
  return { usar: true, lancar: data.lancar === true, admin: false };
}
