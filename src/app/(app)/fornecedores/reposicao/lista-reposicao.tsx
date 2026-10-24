"use client";

import Link from "next/link";
import { useState } from "react";
import { Grupo } from "@/components/ajustes";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";
import { linkWhatsApp } from "@/lib/format";

export interface ItemReposicao {
  id: string;
  nome: string;
  estoque: number;
  vendido30: number;
  sugestao: number;
}

export interface GrupoReposicao {
  chave: string;
  fornecedorId: string | null;
  nome: string;
  telefone: string | null;
  itens: ItemReposicao[];
}

// Uma lista por fornecedor. Dá pra ajustar a quantidade e tirar item; o texto do WhatsApp e o
// atalho "Registrar compra" seguem o que está marcado.
export function ListaReposicao({ grupos }: { grupos: GrupoReposicao[] }) {
  const [qtds, setQtds] = useState<Record<string, string>>(() =>
    Object.fromEntries(grupos.flatMap((g) => g.itens.map((i) => [i.id, String(i.sugestao)]))),
  );
  const [fora, setFora] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setFora((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {grupos.map((g) => {
        const escolhidos = g.itens
          .filter((i) => !fora.has(i.id))
          .map((i) => ({ ...i, qtd: Number(qtds[i.id]) }))
          .filter((i) => Number.isInteger(i.qtd) && i.qtd > 0);

        const mensagem =
          `Oi${g.fornecedorId ? `, ${g.nome.split(" ")[0]}` : ""}! Preciso repor:\n\n` +
          escolhidos.map((i) => `• ${i.qtd}x ${i.nome}`).join("\n") +
          `\n\nPode me passar os valores e o prazo?`;
        const zap = escolhidos.length === 0 ? null : (linkWhatsApp(g.telefone, mensagem) ?? `https://wa.me/?text=${encodeURIComponent(mensagem)}`);
        const compra = `/fornecedores/compras/nova?${g.fornecedorId ? `fornecedor=${g.fornecedorId}&` : ""}itens=${escolhidos
          .map((i) => `${i.id}:${i.qtd}`)
          .join(",")}`;

        return (
          <Grupo
            key={g.chave}
            titulo={g.nome}
            semPadding
            rodape={g.telefone || !g.fornecedorId ? undefined : "Sem telefone cadastrado: o WhatsApp abre pra você escolher o contato."}
          >
            <ul className="divide-y divide-line">
              {g.itens.map((i) => {
                const marcado = !fora.has(i.id);
                return (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(i.id)}
                      aria-label={`Incluir ${i.nome} na lista`}
                      className="h-5 w-5 shrink-0 accent-[var(--color-brand-fill,currentColor)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[17px] ${marcado ? "text-ink" : "text-ink-muted line-through"}`}>{i.nome}</p>
                      <p className="text-[13px] text-ink-muted">
                        {i.estoque <= 0 ? "Zerado" : i.estoque === 1 ? "Resta 1" : `Restam ${i.estoque}`} · vendeu {i.vendido30} em 30 dias
                      </p>
                    </div>
                    <input
                      value={qtds[i.id] ?? ""}
                      onChange={(e) => setQtds((atual) => ({ ...atual, [i.id]: e.target.value }))}
                      inputMode="numeric"
                      aria-label={`Quantidade de ${i.nome}`}
                      disabled={!marcado}
                      className="w-16 shrink-0 rounded-xl border border-transparent bg-fill px-2 py-2 text-center text-[17px] tabular-nums text-ink outline-none focus:border-brand focus:bg-surface disabled:opacity-50"
                    />
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row">
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full sm:w-auto`}>
                  <IconWhatsapp width={16} height={16} /> Enviar no WhatsApp
                </a>
              ) : (
                <span className={`${btnPrimary} w-full opacity-50 sm:w-auto`} aria-disabled="true">
                  <IconWhatsapp width={16} height={16} /> Enviar no WhatsApp
                </span>
              )}
              {escolhidos.length > 0 && (
                <Link href={compra} className={`${btnSecondary} w-full sm:w-auto`}>
                  Registrar a compra
                </Link>
              )}
            </div>
          </Grupo>
        );
      })}
    </div>
  );
}
