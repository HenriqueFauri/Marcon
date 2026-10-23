"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatBRL } from "@/lib/format";
import type { PontoEvolucao } from "@/lib/relatorios";
import { formatCompacto } from "./formato";

// Faturamento (barra clara) e lucro (barra cheia, dentro dela) ao longo do período. Feito só de
// divs e porcentagens: serve em qualquer largura, sem medir nada. Toque ou passe o dedo nas
// colunas para ver o valor; as setas do teclado fazem o mesmo.

export function GraficoEvolucao({ pontos, tituloTotal }: { pontos: PontoEvolucao[]; tituloTotal: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const n = pontos.length;

  const maxV = Math.max(0, ...pontos.map((p) => Math.max(p.faturamento, p.lucro)));
  const minV = Math.min(0, ...pontos.map((p) => p.lucro));
  const faixa = maxV - minV || 1;
  const y = (v: number) => ((v - minV) / faixa) * 100; // % a partir de baixo
  const zero = y(0);

  const totalFat = pontos.reduce((s, p) => s + p.faturamento, 0);
  const totalLucro = pontos.reduce((s, p) => s + p.lucro, 0);
  const destaque = sel !== null ? pontos[sel] : null;

  const passo = Math.max(1, Math.ceil(n / 7));
  const guias = minV < 0 ? [maxV, 0, minV] : [maxV, maxV / 2];

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    setSel(i);
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") setSel((s) => Math.min(n - 1, (s ?? -1) + 1));
    else if (e.key === "ArrowLeft") setSel((s) => Math.max(0, (s ?? n) - 1));
    else if (e.key === "Escape") setSel(null);
    else return;
    e.preventDefault();
  }

  const gap = n > 40 ? "gap-px" : n > 20 ? "gap-[2px]" : "gap-1.5";
  // o aviso fica sobre a coluna, mas encostado na borda nas pontas para não sair da tela
  const lado = sel === null ? "" : sel < n * 0.2 ? "left-0" : sel > n * 0.8 ? "right-0" : "-translate-x-1/2";
  const posicao = sel !== null && lado.includes("translate") ? { left: `${((sel + 0.5) / n) * 100}%` } : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2" aria-live="polite">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-muted">{destaque ? destaque.titulo : tituloTotal}</p>
          <p className="break-words text-[26px] font-bold leading-tight tracking-tight tabular-nums text-ink">
            {formatBRL(destaque ? destaque.faturamento : totalFat)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[13px] text-ink-muted">Lucro</p>
          <p className={`break-words text-[20px] font-semibold tabular-nums ${(destaque ? destaque.lucro : totalLucro) < 0 ? "text-danger" : "text-ink"}`}>
            {formatBRL(destaque ? destaque.lucro : totalLucro)}
          </p>
        </div>
      </div>

      <div
        role="group"
        tabIndex={0}
        aria-label={`Faturamento e lucro, ${n} ${n === 1 ? "ponto" : "pontos"}. Use as setas para ver cada um.`}
        onKeyDown={aoTeclar}
        onBlur={() => setSel(null)}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <div
          className="relative h-48 touch-pan-y select-none sm:h-60"
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}
        >
          {guias.map((g, i) => (
            <div key={i} className="pointer-events-none absolute inset-x-0" style={{ bottom: `${y(g)}%` }}>
              <div className={`border-t ${g === 0 && minV < 0 ? "border-line-strong" : "border-dashed border-line"}`} />
              <span className="absolute left-0 top-0.5 text-[11px] tabular-nums text-ink-muted">{formatCompacto(g)}</span>
            </div>
          ))}

          <div className={`absolute inset-0 flex ${gap}`}>
            {pontos.map((p, i) => {
              const apagada = sel !== null && sel !== i;
              return (
                <div key={p.chave} className={`relative h-full min-w-0 flex-1 transition-opacity ${apagada ? "opacity-40" : ""}`}>
                  {p.faturamento > 0 && (
                    <div
                      className="graf-barra absolute inset-x-0 rounded-t-md bg-brand/40"
                      style={{ bottom: `${zero}%`, height: `${(p.faturamento / faixa) * 100}%`, animationDelay: `${Math.min(i * 12, 360)}ms` }}
                    />
                  )}
                  {p.lucro !== 0 && (
                    <div
                      className={`graf-barra absolute inset-x-[18%] ${p.lucro > 0 ? "rounded-t-sm bg-brand" : "rounded-b-sm bg-danger"}`}
                      style={{
                        bottom: `${p.lucro > 0 ? zero : y(p.lucro)}%`,
                        height: `${(Math.abs(p.lucro) / faixa) * 100}%`,
                        animationDelay: `${Math.min(i * 12 + 80, 440)}ms`,
                        transformOrigin: p.lucro > 0 ? "bottom" : "top",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {destaque && (
            <div
              className={`pointer-events-none absolute top-0 z-10 w-44 -translate-y-2 rounded-2xl bg-surface p-3 text-[13px] shadow-lg ring-1 ring-line ${lado}`}
              style={posicao}
              role="presentation"
            >
              <p className="font-semibold text-ink">{destaque.titulo}</p>
              <p className="mt-1 flex items-center justify-between gap-2 text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand/40" />
                  Vendido
                </span>
                <span className="tabular-nums text-ink">{formatBRL(destaque.faturamento)}</span>
              </p>
              <p className="flex items-center justify-between gap-2 text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${destaque.lucro < 0 ? "bg-danger" : "bg-brand"}`} />
                  Lucro
                </span>
                <span className={`tabular-nums ${destaque.lucro < 0 ? "text-danger" : "text-ink"}`}>{formatBRL(destaque.lucro)}</span>
              </p>
              <p className="mt-0.5 text-ink-muted">
                {destaque.vendas} {destaque.vendas === 1 ? "venda" : "vendas"}
              </p>
            </div>
          )}
        </div>

        <div className={`mt-1.5 flex ${gap}`} aria-hidden="true">
          {pontos.map((p, i) => (
            <div key={p.chave} className="relative h-4 min-w-0 flex-1">
              {i % passo === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-ink-muted">{p.rotulo}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand/40" /> Vendido
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand" /> Lucro
        </span>
      </div>

      <table className="sr-only">
        <caption>Faturamento e lucro por período</caption>
        <thead>
          <tr>
            <th>Período</th>
            <th>Vendido</th>
            <th>Lucro</th>
          </tr>
        </thead>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.chave}>
              <td>{p.titulo}</td>
              <td>{formatBRL(p.faturamento)}</td>
              <td>{formatBRL(p.lucro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
