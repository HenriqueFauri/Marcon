"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/toaster";
import { formatBRL } from "@/lib/format";
import { EmptyState, btnPrimary, inputClass } from "@/components/ui";
import { SetaLink, linkPendente } from "@/components/seta-link";
import { Grupo, Segmentado, SoInterruptor } from "./campos";
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
    toast.success(
      `${ids.length} ${ids.length === 1 ? "produto" : "produtos"} ${valor ? "na vitrine" : "fora da vitrine"}.`,
      { desfazer: () => aplicar(ids, { naVitrine: !valor }, () => definirNaVitrine(ids, !valor)) },
    );
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
      <EmptyState
        title="Nenhum produto ativo"
        description="Cadastre seus produtos e escolha aqui quais aparecem na loja."
        action={
          <Link href="/produtos/novo" className={btnPrimary}>
            Cadastrar produto
          </Link>
        }
      />
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
        <EmptyState
          title="Nenhum produto nesta lista"
          description={busca.trim() ? `Nada corresponde a “${busca.trim()}”.` : "Troque o filtro para ver os outros produtos."}
        />
      ) : (
        <Grupo semPadding>
        <ul className="divide-y divide-line">
          {visiveis.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-fill object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fill text-[15px] font-medium text-ink-faint" aria-hidden="true">
                  {p.nome.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {/* abre como o produto aparece na loja (capa, fotos, texto), não o cadastro */}
                <Link href={`/vitrine/produtos/${p.id}`} className="line-clamp-2 text-[15px] leading-snug text-ink hover:underline">
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
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition hover:bg-fill ${
                      p.destaque ? "text-warning" : "text-ink-faint"
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
                      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-fill hover:text-ink sm:flex"
                    >
                      <IconLink />
                    </button>
                  )}
                </>
              )}
              {/* a key muda com o valor: o switch acompanha o "Colocar todos" e a volta quando o banco recusa */}
              <SoInterruptor
                key={`${p.id}-${p.naVitrine}`}
                name={`na_vitrine_${p.id}`}
                ligado={p.naVitrine}
                rotulo={`Mostrar ${p.nome} na vitrine`}
                onMudar={(novo) => {
                  aplicar([p.id], { naVitrine: novo }, () => definirNaVitrine([p.id], novo));
                  if (!novo) toast.success(`${p.nome} saiu da vitrine.`, { desfazer: () => aplicar([p.id], { naVitrine: true }, () => definirNaVitrine([p.id], true)) });
                }}
              />
              <Link
                href={`/vitrine/produtos/${p.id}`}
                aria-label={`Ajustar como ${p.nome} aparece na loja`}
                className={`-mr-2 flex h-9 w-6 shrink-0 items-center justify-center ${linkPendente}`}
              >
                <SetaLink />
              </Link>
            </li>
          ))}
        </ul>
        </Grupo>
      )}
    </div>
  );
}
