"use client";

import { useState } from "react";
import Link from "next/link";
import type { Fornecedor, ProdutoVariacao } from "@/types/domain";
import { Modal } from "@/components/modal";
import { btnPrimary } from "@/components/ui";
import { IconCart, IconMegaphone, IconMinus, IconPencil, IconPlus } from "@/components/icons";
import { EntradaEstoqueForm } from "./entrada-estoque-form";
import { SaidaEstoqueForm } from "./saida-estoque-form";
import { AjusteEstoqueForm } from "./ajuste-estoque-form";

type Janela = "entrada" | "saida" | "ajuste" | null;

// Ações do produto, um botão para cada: entrada e saída de estoque abrem em
// janela, e "Vender" leva pra nova venda já com o produto no carrinho.
export function ProdutoAcoes({
  produtoId,
  custoAtual,
  estoqueAtual,
  variacoes,
  fornecedores,
  fornecedorPadrao,
  hoje,
  precisaVariacao,
}: {
  produtoId: string;
  custoAtual: number;
  estoqueAtual: number;
  variacoes: ProdutoVariacao[];
  fornecedores: Fornecedor[];
  fornecedorPadrao: string | null;
  hoje: string;
  precisaVariacao: boolean;
}) {
  const [janela, setJanela] = useState<Janela>(null);

  const travado = precisaVariacao ? "Adicione uma variação antes de mexer no estoque." : undefined;
  const atalho =
    "hairline flex flex-col items-center justify-center gap-1 rounded-2xl bg-surface px-1 py-3 text-[12px] font-medium text-ink-2 transition hover:bg-fill/60 active:scale-[0.97] disabled:opacity-40";
  const icone = "flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-brand-text";

  // atalhos como nos Contatos do iPhone (ícone em cima do nome) e "Vender" como ação principal
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="grid grid-cols-4 gap-2 sm:flex-1">
        <button type="button" disabled={precisaVariacao} onClick={() => setJanela("entrada")} title={travado ?? "Compra de mercadoria"} className={atalho}>
          <span className={icone}>
            <IconPlus width={17} height={17} />
          </span>
          Entrada
        </button>
        <button type="button" disabled={precisaVariacao} onClick={() => setJanela("saida")} title={travado ?? "Perda, brinde ou ajuste"} className={atalho}>
          <span className={icone}>
            <IconMinus width={17} height={17} />
          </span>
          Saída
        </button>
        <button
          type="button"
          disabled={precisaVariacao}
          onClick={() => setJanela("ajuste")}
          title={travado ?? "Corrigir a quantidade, sem mexer no caixa"}
          className={atalho}
        >
          <span className={icone}>
            <IconPencil width={16} height={16} />
          </span>
          Ajustar
        </button>
        <Link href={`/anuncios/${produtoId}`} className={atalho}>
          <span className={icone}>
            <IconMegaphone width={16} height={16} />
          </span>
          Anúncios
        </Link>
      </div>
      <Link href={`/vendas/novo?produto=${produtoId}`} className={`${btnPrimary} py-3 sm:px-8`}>
        <IconCart width={17} height={17} /> Vender
      </Link>

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

      <Modal
        open={janela === "ajuste"}
        onClose={() => setJanela(null)}
        title="Ajustar estoque"
        description="Diga quantas unidades você tem de verdade. O app corrige a contagem sem mexer no caixa."
      >
        <AjusteEstoqueForm
          produtoId={produtoId}
          estoqueAtual={estoqueAtual}
          variacoes={variacoes}
          onConcluido={() => setJanela(null)}
        />
      </Modal>
    </div>
  );
}
