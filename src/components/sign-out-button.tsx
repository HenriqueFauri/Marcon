"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
    >
      Sair
    </button>
  );
}
