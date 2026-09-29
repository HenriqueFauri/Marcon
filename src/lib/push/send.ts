import webpush from "web-push";
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
    configurado = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configurado = true;
  } catch (err) {
    console.error("VAPID inválido, notificações desativadas", err);
    configurado = false;
  }
  return configurado;
}

export async function enviarNotificacao(ownerId: string, title: string, body: string, url = "/") {
  if (!configurar()) return;

  const supabase = await createClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId);

  if (!subs || subs.length === 0) return;

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
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}
