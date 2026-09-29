"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "./icons";
import { inputClass } from "./ui";

// Busca que vive na URL (?q=), com um pequeno atraso pra não navegar a cada tecla.
export function SearchInput({ placeholder = "Buscar..." }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function atualizar(novo: string) {
    setValor(novo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (novo.trim()) params.set("q", novo.trim());
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width={16} height={16} />
      <input
        type="search"
        value={valor}
        onChange={(e) => atualizar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={searchParams.get("buscar") === "1"}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}
