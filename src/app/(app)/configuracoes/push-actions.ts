"use server";

import { createClient } from "@/lib/supabase/server";

export async function salvarInscricaoPush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("não autenticado");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      owner_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

export async function removerInscricaoPush(endpoint: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}
