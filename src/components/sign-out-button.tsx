"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconLogout } from "./icons";

export function SignOutButton() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function handleSignOut() {
    setSaindo(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={saindo}
      className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-fill hover:text-ink disabled:opacity-50"
    >
      <IconLogout />
      {saindo ? "Saindo..." : "Sair"}
    </button>
  );
}
