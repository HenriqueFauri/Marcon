"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { IconPlus } from "@/components/icons";
import type { Vendavel } from "./venda-form";

// Um produto na lista de venda. Produto com variações vira um só item, com um
// seletor (cor, tamanho...) em vez de uma linha por variação.
export interface GrupoVendavel {
  produtoId: string;
  nome: string;
  detalhe: string;
  itens: Vendavel[];
  temVariacoes: boolean;
}

export function agruparVendaveis(vendaveis: Vendavel[]): GrupoVendavel[] {
  const grupos = new Map<string, GrupoVendavel>();
  for (const v of vendaveis) {
    const existente = grupos.get(v.produto_id);
    if (existente) {
      existente.itens.push(v);
    } else {
      grupos.set(v.produto_id, {
        produtoId: v.produto_id,
        nome: v.produto_nome,
        detalhe: v.detalhe,
        itens: [v],
        temVariacoes: v.variacao_id !== null,
      });
    }
  }
  return [...grupos.values()];
}

// "Azul / M" -> ["Azul", "M"]. O app grava a variação como texto livre, então
// as dimensões vêm daqui. Só vale se todas as variações do produto tiverem o
// mesmo número de partes (2 ou 3); senão cada nome inteiro é uma opção.
function partesDe(rotulo: string | null) {
  return (rotulo ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
}

function niveisDoGrupo(itens: Vendavel[]) {
  const tamanhos = new Set(itens.map((v) => partesDe(v.rotulo).length));
  if (tamanhos.size !== 1) return 1;
  const n = [...tamanhos][0];
  return n >= 2 && n <= 3 ? n : 1;
}

function valorNoNivel(v: Vendavel, nivel: number, niveis: number) {
  if (niveis === 1) return v.rotulo ?? "";
  return partesDe(v.rotulo)[nivel] ?? "";
}

const ORDEM_TAMANHOS = ["PP", "XS", "P", "S", "M", "G", "L", "GG", "XL", "XG", "XGG", "XXL", "EG", "EGG"];

// tamanhos em ordem natural (P, M, G, GG), números do menor ao maior, o resto na ordem em que aparece
function ordenarValores(valores: string[]) {
  const pesoTamanho = (v: string) => ORDEM_TAMANHOS.indexOf(v.toUpperCase());
  if (valores.every((v) => pesoTamanho(v) >= 0)) return [...valores].sort((a, b) => pesoTamanho(a) - pesoTamanho(b));
  if (valores.every((v) => v !== "" && Number.isFinite(Number(v.replace(",", "."))))) {
    return [...valores].sort((a, b) => Number(a.replace(",", ".")) - Number(b.replace(",", ".")));
  }
  return valores;
}

function Seletor({
  grupo,
  noCarrinho,
  precoPadrao,
  onAdicionar,
}: {
  grupo: GrupoVendavel;
  noCarrinho: Map<string, number>;
  precoPadrao: (v: Vendavel) => number;
  onAdicionar: (v: Vendavel) => void;
}) {
  const niveis = niveisDoGrupo(grupo.itens);
  const [escolhas, setEscolhas] = useState<(string | null)[]>(() => Array(niveis).fill(null));

  const valoresDoNivel = (nivel: number) =>
    ordenarValores([...new Set(grupo.itens.map((v) => valorNoNivel(v, nivel, niveis)))]);

  // combinação que sobra depois das escolhas nos outros níveis: define o que ainda dá para escolher aqui
  const compativeis = (nivel: number) =>
    grupo.itens.filter((v) => escolhas.every((e, i) => i === nivel || e === null || valorNoNivel(v, i, niveis) === e));

  const escolhida =
    escolhas.every((e) => e !== null)
      ? grupo.itens.find((v) => escolhas.every((e, i) => valorNoNivel(v, i, niveis) === e))
      : undefined;

  function escolher(nivel: number, valor: string) {
    setEscolhas((prev) => prev.map((e, i) => (i === nivel ? (e === valor ? null : valor) : e)));
  }

  const qtdNoCarrinho = escolhida ? (noCarrinho.get(escolhida.chave) ?? 0) : 0;
  const restante = escolhida ? escolhida.estoque - qtdNoCarrinho : 0;
  const podeAdicionar = !!escolhida && restante > 0;

  return (
    <div className="flex flex-col gap-3 bg-fill/50 px-3 py-3">
      {Array.from({ length: niveis }, (_, nivel) => {
        const doNivel = compativeis(nivel);
        return (
          <div key={nivel} className="flex flex-wrap gap-2" role="group" aria-label={niveis === 1 ? "Opção" : `Opção ${nivel + 1}`}>
            {valoresDoNivel(nivel).map((valor) => {
              const daOpcao = doNivel.filter((v) => valorNoNivel(v, nivel, niveis) === valor);
              const emEstoque = daOpcao.reduce((s, v) => s + Math.max(v.estoque - (noCarrinho.get(v.chave) ?? 0), 0), 0);
              const marcada = escolhas[nivel] === valor;
              const semEstoque = emEstoque <= 0;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => escolher(nivel, valor)}
                  aria-pressed={marcada}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    marcada
                      ? "border-brand bg-brand-tint font-medium text-brand-text"
                      : semEstoque
                        ? "border-line text-ink-muted line-through opacity-50"
                        : "border-line-strong text-ink hover:bg-fill"
                  }`}
                >
                  {valor}
                  {niveis === 1 && (
                    <span className="ml-1.5 text-xs text-ink-muted no-underline">{semEstoque ? "esgotado" : emEstoque}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      <button
        type="button"
        disabled={!podeAdicionar}
        onClick={() => escolhida && onAdicionar(escolhida)}
        // o gradiente do botão principal é uma classe fora do Tailwind, então o estado desabilitado escolhe o fundo aqui
        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left text-[15px] font-medium transition disabled:cursor-not-allowed ${
          podeAdicionar ? "bg-brand-fill text-on-brand shadow-sm shadow-brand/30" : "bg-fill text-ink-muted"
        }`}
      >
        <span className="min-w-0 truncate">
          {!escolhida
            ? escolhas.every((e) => e !== null)
              ? "Combinação indisponível"
              : niveis === 1
                ? "Escolha uma opção"
                : "Escolha todas as opções"
            : restante <= 0
              ? `${escolhida.rotulo} · esgotado`
              : `Adicionar ${escolhida.rotulo}`}
        </span>
        {escolhida && restante > 0 && (
          <span className="flex shrink-0 items-center gap-2 tabular-nums">
            {formatBRL(precoPadrao(escolhida))}
            <span className="text-xs opacity-80">{restante} disp.</span>
            <IconPlus width={16} height={16} />
          </span>
        )}
      </button>
      {escolhida && qtdNoCarrinho > 0 && (
        <p className="-mt-1 text-xs text-ink-muted">
          {qtdNoCarrinho} no carrinho. Toque de novo para somar mais uma.
        </p>
      )}
    </div>
  );
}

export function ListaProdutos({
  grupos,
  noCarrinho,
  precoPadrao,
  onAdicionar,
  abertoInicial,
}: {
  grupos: GrupoVendavel[];
  noCarrinho: Map<string, number>;
  precoPadrao: (v: Vendavel) => number;
  onAdicionar: (v: Vendavel) => void;
  abertoInicial?: string | null;
}) {
  const [aberto, setAberto] = useState<string | null>(abertoInicial ?? null);

  if (grupos.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-ink-muted">Nada encontrado.</p>;
  }

  return (
    <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
      {grupos.map((g) => {
        const emCarrinho = g.itens.reduce((s, v) => s + (noCarrinho.get(v.chave) ?? 0), 0);
        const disponivel = g.itens.reduce((s, v) => s + Math.max(v.estoque - (noCarrinho.get(v.chave) ?? 0), 0), 0);
        const precos = g.itens.map(precoPadrao);
        const menor = Math.min(...precos);
        const maior = Math.max(...precos);
        const esgotado = disponivel <= 0;
        const expandido = g.temVariacoes && aberto === g.produtoId;

        const cabecalho = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-ink">{g.nome}</span>
              <span className="block truncate text-xs text-ink-muted">
                {g.temVariacoes
                  ? `${g.itens.length} ${g.itens.length === 1 ? "opção" : "opções"} · ${disponivel} disponível${disponivel === 1 ? "" : "is"}`
                  : `${disponivel} disponível${disponivel === 1 ? "" : "is"}`}
                {g.detalhe ? ` · ${g.detalhe}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-ink-2">
                {menor === maior ? formatBRL(menor) : `${formatBRL(menor)} – ${formatBRL(maior)}`}
              </span>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-brand-tint px-1 text-brand-text">
                {emCarrinho > 0 ? (
                  <span className="text-xs font-semibold">{emCarrinho}</span>
                ) : g.temVariacoes ? (
                  <span aria-hidden="true" className={`text-xs transition ${expandido ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                ) : (
                  <IconPlus width={16} height={16} />
                )}
              </span>
            </span>
          </>
        );

        return (
          <li key={g.produtoId}>
            <button
              type="button"
              onClick={() => (g.temVariacoes ? setAberto(expandido ? null : g.produtoId) : onAdicionar(g.itens[0]))}
              disabled={!g.temVariacoes && esgotado}
              aria-expanded={g.temVariacoes ? expandido : undefined}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-fill disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cabecalho}
            </button>
            {expandido && <Seletor grupo={g} noCarrinho={noCarrinho} precoPadrao={precoPadrao} onAdicionar={onAdicionar} />}
          </li>
        );
      })}
    </ul>
  );
}
