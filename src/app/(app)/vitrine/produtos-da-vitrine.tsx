"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/toaster";
import { formatBRL } from "@/lib/format";
import { inputClass } from "@/components/ui";
import { Segmentado } from "./campos";
import { IconLink } from "@/components/icons";
import { definirDestaque, definirNaVitrine } from "./actions";

export interface ProdutoDaLista {
  id: string;
  nome: string;
  preco: number;
  naVitrine: boolean;
  destaque: boolean;
  foto: string | null;
  esgotado: boolean;
  semFoto: boolean;
}

type Filtro = "todos" | "dentro" | "fora";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "dentro", label: "Na vitrine" },
  { valor: "fora", label: "Fora" },
];

function Interruptor({ ligado, onMudar, rotulo }: { ligado: boolean; onMudar: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onMudar}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${ligado ? "bg-positive" : "bg-fill-strong"}`}
    >
      <span
        className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform ${ligado ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

// Lista de todos os produtos ativos para escolher o que aparece na loja sem abrir cada cadastro.
// Muda na hora na tela e grava em seguida; se o banco recusar, volta como estava.
export function ProdutosDaVitrine({ produtos: iniciais, linkDaLoja }: { produtos: ProdutoDaLista[]; linkDaLoja: string | null }) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [produtos, setProdutos] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter(
      (p) =>
        (filtro === "todos" || (filtro === "dentro" ? p.naVitrine : !p.naVitrine)) &&
        (!termo || p.nome.toLowerCase().includes(termo)),
    );
  }, [produtos, busca, filtro]);
  const total = produtos.filter((p) => p.naVitrine).length;
  const todosLigados = visiveis.length > 0 && visiveis.every((p) => p.naVitrine);

  function aplicar(ids: string[], mudanca: Partial<ProdutoDaLista>, gravar: () => Promise<{ ok: boolean; error?: string }>) {
    const antes = produtos;
    setProdutos((atual) => atual.map((p) => (ids.includes(p.id) ? { ...p, ...mudanca } : p)));
    startTransition(async () => {
      try {
        const r = await gravar();
        if (!r.ok) throw new Error(r.error);
      } catch (e) {
        setProdutos(antes);
        toast.error(e instanceof Error && e.message ? e.message : "Não consegui salvar. Tente de novo.");
      }
    });
  }

  function emMassa(valor: boolean) {
    const ids = visiveis.filter((p) => p.naVitrine !== valor).map((p) => p.id);
    if (ids.length === 0) return;
    aplicar(ids, { naVitrine: valor }, () => definirNaVitrine(ids, valor));
    toast.success(`${ids.length} ${ids.length === 1 ? "produto" : "produtos"} ${valor ? "na vitrine" : "fora da vitrine"}.`);
  }

  async function copiarLink(id: string) {
    if (!linkDaLoja) return;
    try {
      await navigator.clipboard.writeText(`${linkDaLoja}?p=${id}`);
      toast.success("Link do produto copiado.");
    } catch {
      toast.error("Não consegui copiar o link.");
    }
  }

  if (produtos.length === 0) {
    return (
      <p className="rounded-xl bg-fill/60 px-4 py-3 text-sm text-ink-2">
        Você ainda não tem produtos ativos.{" "}
        <Link href="/produtos/novo" className="font-medium text-brand-text hover:underline">
          Cadastrar produto
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto"
        aria-label="Buscar produto"
        className={inputClass}
      />
      <Segmentado rotulo="Filtrar produtos" valor={filtro} onMudar={setFiltro} opcoes={FILTROS} />
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] text-ink-muted">
          {total} de {produtos.length} na vitrine
        </p>
        {visiveis.length > 0 && (
          <button
            type="button"
            onClick={() => emMassa(!todosLigados)}
            className="text-[15px] font-medium text-brand-text transition hover:opacity-80"
          >
            {todosLigados ? "Tirar todos" : "Colocar todos"}
          </button>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nenhum produto nesta lista.</p>
      ) : (
        <ul className="-mx-4 divide-y divide-line border-t border-line sm:-mx-5">
          {visiveis.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-fill object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fill text-[15px] font-medium text-ink-faint" aria-hidden="true">
                  {p.nome.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/produtos/${p.id}`} className="line-clamp-2 text-[15px] leading-snug text-ink hover:underline">
                  {p.nome}
                </Link>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  <span className="tabular-nums">{formatBRL(p.preco)}</span>
                  {p.esgotado && <span className="text-warning"> · Esgotado</span>}
                </p>
              </div>
              {p.naVitrine && (
                <>
                  <button
                    type="button"
                    aria-pressed={p.destaque}
                    aria-label={p.destaque ? "Tirar dos destaques" : "Colocar nos destaques"}
                    title={p.destaque ? "Nos destaques" : "Colocar nos destaques"}
                    onClick={() => aplicar([p.id], { destaque: !p.destaque }, () => definirDestaque(p.id, !p.destaque))}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg transition hover:bg-fill ${
                      p.destaque ? "text-amber-500" : "text-ink-faint"
                    }`}
                  >
                    {p.destaque ? "★" : "☆"}
                  </button>
                  {linkDaLoja && (
                    <button
                      type="button"
                      aria-label="Copiar link do produto na vitrine"
                      title="Copiar link do produto"
                      onClick={() => copiarLink(p.id)}
                      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-fill hover:text-ink sm:flex"
                    >
                      <IconLink />
                    </button>
                  )}
                </>
              )}
              <Interruptor
                ligado={p.naVitrine}
                rotulo={`Mostrar ${p.nome} na vitrine`}
                onMudar={() => aplicar([p.id], { naVitrine: !p.naVitrine }, () => definirNaVitrine([p.id], !p.naVitrine))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
