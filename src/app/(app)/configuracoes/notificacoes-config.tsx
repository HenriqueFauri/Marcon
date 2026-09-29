"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/toaster";
import { mensagemDeErro } from "@/lib/action";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { removerInscricaoPush, salvarInscricaoPush } from "./push-actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

const semAssinatura = () => () => {};
const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function NotificacoesConfig() {
  const toast = useToast();
  const suportado = useSyncExternalStore(semAssinatura, pushSuportado, () => false);
  const [inscrito, setInscrito] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!suportado) return;
    let ativo = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        if (ativo) setInscrito(!!sub);
      })
      .catch(() => {
        if (ativo) setInscrito(false);
      });
    return () => {
      ativo = false;
    };
  }, [suportado]);

  async function ativar() {
    setCarregando(true);
    try {
      if (!vapid) throw new Error("As notificações ainda não foram configuradas no servidor.");
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        throw new Error("Permissão negada. Libere as notificações para este site nas configurações do navegador.");
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = subscription.toJSON();
      const r = await salvarInscricaoPush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      if (!r.ok) {
        await subscription.unsubscribe();
        throw new Error(r.error);
      }
      setInscrito(true);
      toast.success("Notificações ativadas neste dispositivo.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Erro ao ativar notificações."));
    } finally {
      setCarregando(false);
    }
  }

  async function desativar() {
    setCarregando(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const r = await removerInscricaoPush(subscription.endpoint);
        if (!r.ok) throw new Error(r.error);
        await subscription.unsubscribe();
      }
      setInscrito(false);
      toast.success("Notificações desativadas neste dispositivo.");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Erro ao desativar notificações."));
    } finally {
      setCarregando(false);
    }
  }

  if (!suportado) {
    return (
      <p className="text-sm text-neutral-500">
        Este navegador não suporta notificações. No iPhone, instale o app primeiro (Compartilhar → Adicionar à Tela de
        Início) e abra por lá.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        Receba um aviso a cada venda registrada e quando uma parcela for recebida. Vale só para este dispositivo.
      </p>
      {inscrito === null ? (
        <p className="text-sm text-neutral-500">Verificando...</p>
      ) : inscrito ? (
        <button onClick={desativar} disabled={carregando} className={btnSecondary}>
          {carregando ? "Desativando..." : "Desativar notificações"}
        </button>
      ) : (
        <button onClick={ativar} disabled={carregando} className={btnPrimary}>
          {carregando ? "Ativando..." : "Ativar notificações"}
        </button>
      )}
    </div>
  );
}
