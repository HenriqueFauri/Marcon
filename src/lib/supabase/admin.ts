import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de serviço: ignora o RLS. Só para rotinas do servidor
// sem usuário logado (ex.: lembretes de cobrança). Nunca importar em código de cliente.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
