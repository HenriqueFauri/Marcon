"use client";

import { useState } from "react";
import { Segmentado } from "@/components/ajustes";
import { formatBRL, formatDataCurta } from "@/lib/format";
import type { DetalheConta } from "../../dados";

type Aba = "mais" | "vendas" | "produtos";
const NA_TELA = 8;

// Vendas e produtos de uma conta, no fim da página: uma lista por vez, curta, com "Mostrar todos".
export function VendasDaConta({ detalhe }: { detalhe: Pick<DetalheConta, "mais_vendidos" | "ultimas_vendas" | "produtos" | "estoque"> }) {
  const [aba, setAba] = useState<Aba>(detalhe.mais_vendidos.length > 0 ? "mais" : "vendas");
  const [tudo, setTudo] = useState(false);

  const total = { mais: detalhe.mais_vendidos.length, vendas: detalhe.ultimas_vendas.length, produtos: detalhe.produtos.length }[aba];
  const limite = tudo ? total : NA_TELA;
  const maior = Math.max(1, ...detalhe.mais_vendidos.map((p) => Number(p.valor)));

  return (
    <section className="flex flex-col gap-3">
      <Segmentado
        rotulo="O que mostrar"
        valor={aba}
        opcoes={[
          { valor: "mais", label: "Mais vendidos" },
          { valor: "vendas", label: "Vendas" },
          { valor: "produtos", label: "Produtos" },
        ]}
        onMudar={(v) => {
          setAba(v);
          setTudo(false);
        }}
      />

      <div className="hairline overflow-hidden rounded-3xl bg-surface">
        {total === 0 ? (
          <p className="px-4 py-3 text-[15px] text-ink-muted">
            {aba === "mais" ? "Nada vendido nos últimos 90 dias." : aba === "vendas" ? "Nenhuma venda ainda." : "Nenhum produto ativo."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {aba === "mais" &&
              detalhe.mais_vendidos.slice(0, limite).map((p, i) => (
                <li key={`${p.nome}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] text-ink">{p.nome}</span>
                    {/* barra do quanto o produto vendeu perto do primeiro */}
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-fill">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(Number(p.valor) / maior) * 100}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[17px] tabular-nums text-ink">{formatBRL(Number(p.valor))}</span>
                    <span className="block text-[13px] tabular-nums text-ink-muted">{p.unidades} un.</span>
                  </span>
                </li>
              ))}

            {aba === "vendas" &&
              detalhe.ultimas_vendas.slice(0, limite).map((v, i) => {
                const cancelada = v.status === "cancelada";
                return (
                  <li key={`${v.criada}-${i}`} className={`flex items-center gap-3 px-4 py-3 ${cancelada ? "opacity-50" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] text-ink">{formatDataCurta(v.data)}</span>
                      <span className="block truncate text-[13px] text-ink-muted">
                        {cancelada ? "Cancelada" : [`${v.itens} ${v.itens === 1 ? "item" : "itens"}`, v.pagamento].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-[17px] tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>{formatBRL(Number(v.valor))}</span>
                      {!cancelada && (
                        <span className={`block text-[13px] tabular-nums ${Number(v.lucro) < 0 ? "text-danger" : "text-positive"}`}>
                          lucro {formatBRL(Number(v.lucro))}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}

            {aba === "produtos" &&
              detalhe.produtos.slice(0, limite).map((p, i) => (
                <li key={`${p.nome}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] text-ink">{p.nome}</span>
                    <span className={`block text-[13px] ${Number(p.estoque) <= 0 ? "text-danger" : "text-ink-muted"}`}>
                      {Number(p.estoque) <= 0 ? "Sem estoque" : `${p.estoque} em estoque`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(Number(p.preco))}</span>
                </li>
              ))}
          </ul>
        )}

        {total > NA_TELA && (
          <button
            type="button"
            onClick={() => setTudo(!tudo)}
            className="w-full border-t border-line px-4 py-3 text-left text-[15px] font-medium text-brand-text transition hover:bg-fill/60 active:bg-fill"
          >
            {tudo ? "Mostrar menos" : `Mostrar todos (${total})`}
          </button>
        )}
      </div>

      <p className="px-4 text-[13px] leading-snug text-ink-muted">
        {aba === "mais"
          ? "Últimos 90 dias, pelo valor vendido."
          : aba === "vendas"
            ? "As vendas mais recentes."
            : `${detalhe.estoque.produtos_ativos} produtos ativos, em ordem alfabética.`}
      </p>
    </section>
  );
}
