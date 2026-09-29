"use server";

import { createClient } from "@/lib/supabase/server";
import { falha, ok, type ActionResult } from "@/lib/action";

export async function salvarInscricaoPush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        owner_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) return falha(error);
    return ok();
  } catch (e) {
    return falha(e);
  }
}

export async function removerInscricaoPush(endpoint: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) return falha(error);
    return ok();
  } catch (e) {
    return falha(e);
  }
}
