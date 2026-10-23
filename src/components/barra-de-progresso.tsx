"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Barra fina no topo durante qualquer navegação interna. Começa no clique em um link do app e termina
// quando o endereço (caminho ou filtros) muda. Sem biblioteca: um listener de clique e uma transição de largura.
const LIMITE_MS = 15000;

export function BarraDeProgresso() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const endereco = `${pathname}?${searchParams.toString()}`;
  const [fase, setFase] = useState<"parada" | "andando" | "fim">("parada");
  const [largura, setLargura] = useState(0);
  const enderecoAnterior = useRef(endereco);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function limpar() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  // o endereço mudou: a navegação terminou
  useEffect(() => {
    if (enderecoAnterior.current === endereco) return;
    enderecoAnterior.current = endereco;
    limpar();
    setLargura(100);
    setFase("fim");
    timers.current.push(setTimeout(() => setFase("parada"), 300));
  }, [endereco]);

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // mesmo endereço (ou só #âncora): o Next não navega, então a barra não pode ficar presa
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      limpar();
      setLargura(12);
      setFase("andando");
      // anda devagar até 85% e espera; se nada mudar em 15 s, some
      [250, 700, 1500, 3000, 6000].forEach((ms, i) => timers.current.push(setTimeout(() => setLargura(30 + i * 14), ms)));
      timers.current.push(setTimeout(() => setFase("parada"), LIMITE_MS));
    }
    document.addEventListener("click", aoClicar);
    return () => {
      document.removeEventListener("click", aoClicar);
      limpar();
    };
  }, []);

  if (fase === "parada") return null;
  return (
    <div role="progressbar" aria-label="Carregando a página" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className={`h-full bg-brand transition-[width,opacity] ease-out motion-reduce:transition-none ${
          fase === "fim" ? "opacity-0 duration-300" : "opacity-100 duration-700"
        }`}
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}
