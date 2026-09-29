"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "./icons";

const CHAVE = "marcon-tema";
const COR_BARRA = { light: "#f2f2f7", dark: "#000000" } as const;

type Tema = "light" | "dark";

function lerTema(): Tema {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function assinar(aviso: () => void) {
  const obs = new MutationObserver(aviso);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function aplicar(tema: Tema) {
  if (tema === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
}

// O tema padrão é o claro (fundo branco). Quem quiser troca pro escuro aqui; a
// escolha fica guardada no aparelho.
export function ThemeToggle({ variante = "segmentado" }: { variante?: "segmentado" | "icone" }) {
  const tema = useSyncExternalStore(assinar, lerTema, () => "light" as Tema);

  if (variante === "icone") {
    const escuro = tema === "dark";
    return (
      <button
        type="button"
        onClick={() => aplicar(escuro ? "light" : "dark")}
        aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
        title={escuro ? "Tema claro" : "Tema escuro"}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-fill"
      >
        {escuro ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-full bg-fill p-0.5" role="group" aria-label="Tema">
      {(
        [
          ["light", "Claro", IconSun],
          ["dark", "Escuro", IconMoon],
        ] as const
      ).map(([valor, rotulo, Icone]) => (
        <button
          key={valor}
          type="button"
          onClick={() => aplicar(valor)}
          aria-pressed={tema === valor}
          className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium transition ${
            tema === valor ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Icone width={14} height={14} />
          {rotulo}
        </button>
      ))}
    </div>
  );
}
