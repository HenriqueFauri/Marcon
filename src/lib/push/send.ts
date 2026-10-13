import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Configurado sob demanda: se as chaves VAPID não estiverem no ambiente, as
// notificações são simplesmente ignoradas em vez de derrubar quem importa este
// módulo (setVapidDetails lança erro com valores vazios).
let configurado: boolean | null = null;

function configurar() {
  if (configurado !== null) return configurado;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    // uma vez por instância: sem isso o push fica desligado sem ninguém ver
    console.warn("[push] chaves VAPID ausentes, notificações desligadas neste ambiente");
    configurado = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configurado = true;
  } catch (err) {
    console.error("[push] VAPID inválido, notificações desativadas", err);
    configurado = false;
  }
  return configurado;
}

// O endereço da inscrição funciona como credencial: no log vai só o serviço (Apple, Google, Mozilla).
function servicoDe(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "endereço inválido";
  }
}

export interface ResultadoDoEnvio {
  // aparelhos inscritos, quantos receberam e quantos falharam
  aparelhos: number;
  enviados: number;
  falhas: number;
}

// `cliente` permite enviar fora de uma requisição (ex.: rotina agendada), sem cookies.
// Nunca lança por falha de envio: cada falha vai para o log e entra na contagem.
export async function enviarNotificacao(
  ownerId: string,
  title: string,
  body: string,
  url = "/",
  cliente?: SupabaseClient,
): Promise<ResultadoDoEnvio> {
  const resultado: ResultadoDoEnvio = { aparelhos: 0, enviados: 0, falhas: 0 };
  if (!configurar()) return resultado;

  const supabase = cliente ?? (await createClient());
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId);
  if (error) {
    console.error("[push] não foi possível ler as inscrições", { ownerId, erro: error.message });
    return resultado;
  }

  if (!subs || subs.length === 0) return resultado;
  resultado.aparelhos = subs.length;

  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        resultado.enviados++;
      } catch (err) {
        resultado.falhas++;
        const { statusCode, body: resposta, message } = err as { statusCode?: number; body?: string; message?: string };
        // 404 e 410: a inscrição não existe mais (app desinstalado, permissão retirada, endereço antigo)
        const expirada = statusCode === 404 || statusCode === 410;
        console.error(expirada ? "[push] inscrição expirada, removida" : "[push] falha no envio", {
          ownerId,
          inscricao: sub.id,
          servico: servicoDe(sub.endpoint),
          status: statusCode ?? null,
          erro: String(resposta || message || err).slice(0, 300),
        });
        if (expirada) {
          const { error: erroAoRemover } = await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          if (erroAoRemover) console.error("[push] não removeu a inscrição expirada", { inscricao: sub.id, erro: erroAoRemover.message });
        }
      }
    }),
  );
  return resultado;
}
