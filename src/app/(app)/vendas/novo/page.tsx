import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, Cliente, FormaPagamento, ProdutoComEstoque, ProdutoVariacao } from "@/types/domain";
import { EmptyState, PageHeader, btnPrimary } from "@/components/ui";
import { hojeISO } from "@/lib/format";
import { VendaForm, type Vendavel } from "./venda-form";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NovaVendaPage() {
  const supabase = await createClient();
  const [{ data: produtosData }, { data: variacoesData }, { data: clientesData }, { data: canaisData }, { data: formasData }] =
    await Promise.all([
      supabase.from("produtos_com_estoque").select("*").neq("status", "inativo").gt("estoque_total", 0).order("nome"),
      supabase.from("produto_variacoes").select("*").gt("estoque", 0).order("nome_combinacao"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("canais_venda").select("*").order("nome"),
      supabase.from("formas_pagamento").select("*").order("nome"),
    ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];

  // cada variação é um item vendável separado, com estoque, preço e custo próprios
  const vendaveis: Vendavel[] = produtos.flatMap((p): Vendavel[] => {
    if (!p.tem_variacoes) {
      return [
        {
          chave: p.id,
          produto_id: p.id,
          variacao_id: null,
          nome: p.nome,
          detalhe: [p.marca, p.sku].filter(Boolean).join(" · "),
          preco_varejo: Number(p.preco_varejo),
          preco_atacado: p.preco_atacado != null ? Number(p.preco_atacado) : null,
          custo: Number(p.custo),
          estoque: p.estoque_total,
        },
      ];
    }
    return variacoes
      .filter((v) => v.produto_id === p.id)
      .map((v) => ({
        chave: `${p.id}:${v.id}`,
        produto_id: p.id,
        variacao_id: v.id,
        nome: `${p.nome} — ${v.nome_combinacao}`,
        detalhe: [p.marca, v.sku].filter(Boolean).join(" · "),
        preco_varejo: Number(v.preco_venda ?? p.preco_varejo),
        preco_atacado: p.preco_atacado != null ? Number(p.preco_atacado) : null,
        custo: Number(v.custo ?? p.custo),
        estoque: v.estoque,
      }));
  });

  return (
    <div>
      <PageHeader title="Nova venda" back={{ href: "/vendas", label: "Vendas" }} />

      {vendaveis.length === 0 ? (
        <EmptyState
          title="Nenhum produto com estoque"
          description="Cadastre um produto ou registre uma entrada de estoque para poder vender."
          action={
            <Link href="/produtos" className={btnPrimary}>
              Ir para produtos
            </Link>
          }
        />
      ) : (
        <VendaForm
          vendaveis={vendaveis}
          clientes={(clientesData ?? []) as Cliente[]}
          canais={(canaisData ?? []) as CanalVenda[]}
          formas={(formasData ?? []) as FormaPagamento[]}
          hoje={hojeISO()}
        />
      )}
    </div>
  );
}
