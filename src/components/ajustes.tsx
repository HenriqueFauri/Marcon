"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Peças no padrão do Início (Ajustes do iPhone): grupos com título pequeno em cima, linhas que
// navegam e interruptores. Vieram da vitrine (src/app/(app)/vitrine/campos.tsx, que reexporta daqui).

export function Grupo({
  titulo,
  rodape,
  children,
  semPadding = false,
}: {
  titulo?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
  semPadding?: boolean;
}) {
  return (
    <section>
      {titulo && <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">{titulo}</h2>}
      <div className={`hairline overflow-hidden rounded-3xl bg-surface ${semPadding ? "" : "flex flex-col gap-4 p-4 sm:p-5"}`}>
        {children}
      </div>
      {rodape && <p className="mt-1.5 px-4 text-[13px] leading-snug text-ink-muted">{rodape}</p>}
    </section>
  );
}

// interruptor do iOS; o checkbox de verdade continua no formulário (name/defaultChecked).
// Com onMudar ele salva na hora, sem formulário (ex.: ajustes do assistente no WhatsApp).
export function Interruptor({
  name,
  padrao,
  titulo,
  ajuda,
  onMudar,
  desabilitado,
}: {
  name: string;
  padrao: boolean;
  titulo: string;
  ajuda?: ReactNode;
  onMudar?: (ligado: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[17px] text-ink">{titulo}</span>
        {ajuda && <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{ajuda}</span>}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={padrao}
        disabled={desabilitado}
        onChange={onMudar ? (e) => onMudar(e.currentTarget.checked) : undefined}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-fill-strong transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-[27px] after:w-[27px] after:rounded-full after:bg-white after:shadow-[0_2px_6px_rgba(0,0,0,0.2)] after:transition-transform peer-checked:bg-positive peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30 peer-disabled:opacity-50"
      />
    </label>
  );
}

// linha que navega; com externo abre em outra aba (ex.: link do WhatsApp com a pergunta pronta)
export function LinhaLink({
  href,
  icone,
  tom,
  rotulo,
  detalhe,
  externo = false,
}: {
  href: string;
  icone?: ReactNode;
  tom?: string;
  rotulo: ReactNode;
  detalhe?: ReactNode;
  externo?: boolean;
}) {
  const classe =
    "flex items-center gap-3 border-t border-line px-4 py-3 text-[17px] text-ink transition first:border-t-0 hover:bg-fill/60 active:bg-fill";
  const conteudo = (
    <>
      {icone && <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${tom}`}>{icone}</span>}
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {detalhe && <span className="max-w-[45%] truncate text-ink-muted">{detalhe}</span>}
      <span aria-hidden="true" className="text-lg text-ink-faint">
        ›
      </span>
    </>
  );
  return externo ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classe}>
      {conteudo}
    </a>
  ) : (
    <Link href={href} className={classe}>
      {conteudo}
    </Link>
  );
}

// linha só de leitura (rótulo e valor), no mesmo ritmo das linhas que navegam
export function LinhaInfo({ rotulo, valor }: { rotulo: ReactNode; valor: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3 text-[17px] first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-ink">{rotulo}</span>
      <span className="max-w-[55%] truncate text-ink-muted">{valor}</span>
    </div>
  );
}
