"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Fornecedor, ProdutoVariacao } from "@/types/domain";
import { Modal } from "@/components/modal";
import { btnPrimary } from "@/components/ui";
import { IconCart, IconChevronDown, IconMinus, IconPlus } from "@/components/icons";
import { EntradaEstoqueForm } from "./entrada-estoque-form";
import { SaidaEstoqueForm } from "./saida-estoque-form";

type Janela = "entrada" | "saida" | null;

// Botão "Ações" do produto: entrada e saída de estoque abrem em janela, e
// "Vender" leva pra nova venda já com o produto no carrinho.
export function ProdutoAcoes({
  produtoId,
  custoAtual,
  variacoes,
  fornecedores,
  fornecedorPadrao,
  hoje,
  precisaVariacao,
}: {
  produtoId: string;
  custoAtual: number;
  variacoes: ProdutoVariacao[];
  fornecedores: Fornecedor[];
  fornecedorPadrao: string | null;
  hoje: string;
  precisaVariacao: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [janela, setJanela] = useState<Janela>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const item =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-ink transition hover:bg-fill disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  function abrir(j: Exclude<Janela, null>) {
    setMenu(false);
    setJanela(j);
  }

  return (
    <>
      <div ref={raiz} className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          className={btnPrimary}
        >
          Ações <IconChevronDown width={16} height={16} strokeWidth={2.4} />
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl bg-surface p-1.5 shadow-xl shadow-black/15 ring-1 ring-line"
          >
            <button role="menuitem" type="button" disabled={precisaVariacao} onClick={() => abrir("entrada")} className={item}>
              <IconPlus width={18} height={18} className="text-positive" />
              <span>
                Entrada de estoque
                <span className="block text-xs text-ink-muted">Compra de mercadoria</span>
              </span>
            </button>
            <button role="menuitem" type="button" disabled={precisaVariacao} onClick={() => abrir("saida")} className={item}>
              <IconMinus width={18} height={18} className="text-danger" />
              <span>
                Saída de estoque
                <span className="block text-xs text-ink-muted">Perda, brinde ou ajuste</span>
              </span>
            </button>
            <Link role="menuitem" href={`/vendas/novo?produto=${produtoId}`} className={item} onClick={() => setMenu(false)}>
              <IconCart width={18} height={18} className="text-brand-text" />
              <span>
                Vender este produto
                <span className="block text-xs text-ink-muted">Abre a nova venda</span>
              </span>
            </Link>
            {precisaVariacao && (
              <p className="px-3 pb-2 pt-1 text-xs text-warning">Adicione uma variação antes de mexer no estoque.</p>
            )}
          </div>
        )}
      </div>

      <Modal
        open={janela === "entrada"}
        onClose={() => setJanela(null)}
        title="Entrada de estoque"
        description="Soma no estoque, recalcula o custo médio e lança a saída no caixa."
        size="lg"
      >
        <EntradaEstoqueForm
          produtoId={produtoId}
          custoAtual={custoAtual}
          variacoes={variacoes}
          fornecedores={fornecedores}
          fornecedorPadrao={fornecedorPadrao}
          hoje={hoje}
          onConcluido={() => setJanela(null)}
        />
      </Modal>

      <Modal
        open={janela === "saida"}
        onClose={() => setJanela(null)}
        title="Saída de estoque"
        description="Tira unidades do estoque sem ser venda."
      >
        <SaidaEstoqueForm produtoId={produtoId} variacoes={variacoes} hoje={hoje} onConcluido={() => setJanela(null)} />
      </Modal>
    </>
  );
}
