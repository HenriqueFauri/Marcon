"use client";

import { useEffect, useState } from "react";
import { removerInscricaoPush, salvarInscricaoPush } from "./push-actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function NotificacoesConfig() {
  const [suportado, setSuportado] = useState(false);
  const [inscrito, setInscrito] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSuportado(true);
    navigator.serviceWorker.ready.then(async (registration) => {
      const sub = await registration.pushManager.getSubscription();
      setInscrito(!!sub);
    });
  }, []);

  async function ativar() {
    setErro(null);
    setCarregando(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") throw new Error("permissão de notificação negada");

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = subscription.toJSON();
      await salvarInscricaoPush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setInscrito(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao ativar notificações");
    } finally {
      setCarregando(false);
    }
  }

  async function desativar() {
    setErro(null);
    setCarregando(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removerInscricaoPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setInscrito(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao desativar notificações");
    } finally {
      setCarregando(false);
    }
  }

  if (!suportado) {
    return (
      <p className="text-sm text-neutral-500">
        Seu navegador não suporta notificações push, ou o app ainda não foi aberto como PWA instalado.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        Receba um aviso a cada venda registrada e quando uma parcela for paga.
      </p>
      {inscrito ? (
        <button
          onClick={desativar}
          disabled={carregando}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          {carregando ? "Desativando..." : "Desativar notificações"}
        </button>
      ) : (
        <button
          onClick={ativar}
          disabled={carregando}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {carregando ? "Ativando..." : "Ativar notificações"}
        </button>
      )}
      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
    </div>
  );
}
