"use client";

import { useLinkStatus } from "next/link";

// Classe para o <Link> da linha: escurece enquanto a navegação não termina (a SetaLink avisa por data-pendente).
export const linkPendente = "has-data-[pendente=true]:opacity-60";

// Círculo girando, do tamanho do texto, na cor atual. Sem animação com "reduzir movimento": fica um arco parado.
export function Spinner({ tamanho = 16, className = "" }: { tamanho?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className={`shrink-0 animate-spin motion-reduce:animate-none ${className}`}
    >
      <path d="M12 3a9 9 0 1 0 9 9" opacity="0.9" />
    </svg>
  );
}

// "›" no fim da linha que vira spinner enquanto a página de destino carrega. Tem de ficar DENTRO do <Link>.
// Ocupa sempre o mesmo espaço, então a linha não se mexe.
export function SetaLink({ className = "text-lg text-ink-faint" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" data-pendente={pending} className={`flex w-4 shrink-0 items-center justify-center ${className}`}>
      {pending ? <Spinner tamanho={14} className="text-ink-muted" /> : "›"}
    </span>
  );
}
