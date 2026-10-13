"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconAlert, IconX } from "@/components/icons";

// A inscrição de push é por aparelho e por endereço do app: se o endereço muda ou o app é
// reinstalado, os avisos param sem ninguém ver. Este lembrete aparece no Início só em aparelho que
// suporta push e está sem inscrição. Dispensar vale para este aparelho; se as notificações forem
// ativadas e a inscrição sumir depois, ele volta a aparecer.
const CHAVE = "marcon-aviso-push-dispensado";

function lerDispensa() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function gravarDispensa(dispensado: boolean) {
  try {
    if (dispensado) localStorage.setItem(CHAVE, "1");
    else localStorage.removeItem(CHAVE);
  } catch {}
}

export function AvisoNotificacoes() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const suportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // sem a chave no servidor não há o que ativar (Staging, por exemplo)
    if (!suportado || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    let ativo = true;
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => {
        if (!ativo) return;
        if (inscricao) gravarDispensa(false);
        else if (!lerDispensa()) setVisivel(true);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  if (!visivel) return null;

  return (
    <div className="hairline flex items-center gap-3 rounded-3xl bg-surface py-2 pl-4 pr-1.5">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-tile-warning text-on-tile-warning">
        <IconAlert width={17} height={17} />
      </span>
      <p className="flex-1 text-[15px] leading-snug text-ink">Os avisos estão desligados neste aparelho.</p>
      <Link href="/configuracoes#notificacoes" className="shrink-0 px-1 text-[15px] font-semibold text-brand-text">
        Ativar
      </Link>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => {
          gravarDispensa(true);
          setVisivel(false);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-fill"
      >
        <IconX width={16} height={16} />
      </button>
    </div>
  );
}
