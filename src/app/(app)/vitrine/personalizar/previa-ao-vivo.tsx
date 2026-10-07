"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PREVIA_DADOS, PREVIA_PRONTA, type DadosDaPrevia } from "@/lib/vitrine";
import { btnSecondary } from "@/components/ui";

const LARGO = "(min-width: 1024px)";
const assinarLargura = (avisar: () => void) => {
  const mq = window.matchMedia(LARGO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
};

// A loja de verdade (/previa-da-loja) num iframe, com o que está no formulário por cima do salvo.
// Computador: moldura de celular fixa ao lado do formulário. Celular: botão que abre em tela cheia.
// Um iframe só por vez, para não carregar a loja duas vezes.
export function PreviaAoVivo({ dados }: { dados: DadosDaPrevia }) {
  const largo = useSyncExternalStore(assinarLargura, () => window.matchMedia(LARGO).matches, () => false);
  const [aberta, setAberta] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const atual = useRef(dados);

  const enviar = useCallback(() => {
    iframe.current?.contentWindow?.postMessage({ tipo: PREVIA_DADOS, dados: atual.current }, window.location.origin);
  }, []);

  useEffect(() => {
    atual.current = dados;
    enviar();
  }, [dados, enviar]);

  // a loja avisa quando carregou (e de novo se recarregar); aí recebe o estado atual
  useEffect(() => {
    function receber(e: MessageEvent) {
      if (e.origin === window.location.origin && e.source === iframe.current?.contentWindow && e.data?.tipo === PREVIA_PRONTA) enviar();
    }
    window.addEventListener("message", receber);
    return () => window.removeEventListener("message", receber);
  }, [enviar]);

  // tela cheia no celular: trava a rolagem da página de trás
  useEffect(() => {
    if (!aberta || largo) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberta, largo]);

  const loja = <iframe ref={iframe} src="/previa-da-loja" title="Prévia da loja" className="h-full w-full border-0 bg-canvas" />;

  if (largo) {
    return (
      <aside aria-label="Prévia da loja" className="sticky top-6">
        <p className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">Prévia</p>
        <div className="h-[min(760px,calc(100dvh-7rem))] w-[390px] overflow-hidden rounded-[44px] border-[8px] border-[#1d1d1f] bg-[#1d1d1f] shadow-xl">
          <div className="h-full overflow-hidden rounded-[36px]">{loja}</div>
        </div>
        <p className="mt-1.5 px-4 text-[13px] text-ink-muted">Mostra o que ainda não foi salvo. Toque nos produtos para testar.</p>
      </aside>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className={`${btnSecondary} w-full py-3`}>
        Ver prévia da loja
      </button>
      {aberta && (
        <div role="dialog" aria-modal="true" aria-label="Prévia da loja" className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <div className="glass flex items-center justify-between border-b border-line px-4 pb-2.5 pt-[max(env(safe-area-inset-top),0.625rem)]">
            <span className="w-12" />
            <span className="text-[17px] font-semibold text-ink">Prévia</span>
            <button type="button" onClick={() => setAberta(false)} className="w-12 text-right text-[17px] font-semibold text-brand-text">
              OK
            </button>
          </div>
          <div className="min-h-0 flex-1">{loja}</div>
        </div>
      )}
    </>
  );
}
