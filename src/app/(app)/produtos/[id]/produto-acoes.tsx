"use client";

import { useState } from "react";
import Link from "next/link";
import type { Fornecedor, ProdutoVariacao } from "@/types/domain";
import { Modal } from "@/components/modal";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { IconCart, IconMinus, IconPlus } from "@/components/icons";
import { EntradaEstoqueForm } from "./entrada-estoque-form";
import { SaidaEstoqueForm } from "./saida-estoque-form";

type Janela = "entrada" | "saida" | null;

// Ações do produto, um botão para cada: entrada e saída de estoque abrem em
// janela, e "Vender" leva pra nova venda já com o produto no carrinho.
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
  const [janela, setJanela] = useState<Janela>(null);

  return (
    <>
      <button
        type="button"
        disabled={precisaVariacao}
        onClick={() => setJanela("entrada")}
        title={precisaVariacao ? "Adicione uma variação antes de mexer no estoque." : "Compra de mercadoria"}
        className={btnSecondary}
      >
        <IconPlus width={16} height={16} className="text-positive" /> Entrada
      </button>
      <button
        type="button"
        disabled={precisaVariacao}
        onClick={() => setJanela("saida")}
        title={precisaVariacao ? "Adicione uma variação antes de mexer no estoque." : "Perda, brinde ou ajuste"}
        className={btnSecondary}
      >
        <IconMinus width={16} height={16} className="text-danger" /> Saída
      </button>
      <Link href={`/vendas/novo?produto=${produtoId}`} className={btnPrimary}>
        <IconCart width={16} height={16} /> Vender
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
    </>
  );
}
