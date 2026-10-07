import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, Cliente, FormaPagamento, ProdutoComEstoque, ProdutoVariacao } from "@/types/domain";
import { EmptyState, PageHeader, btnPrimary } from "@/components/ui";
import { hojeISO } from "@/lib/format";
import { IconX } from "@/components/icons";
import { AvisoDeLimite, LimiteAtingido } from "@/components/limite-do-plano";
import { AVISAR_QUANDO_FALTAREM, lerUso, restante } from "@/lib/uso";
import type { PedidoRecebido } from "@/lib/vitrine";
import { VendaForm, type PedidoParaVenda, type Vendavel } from "./venda-form";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NovaVendaPage({ searchParams }: PageProps<"/vendas/novo">) {
  const sp = await searchParams;
  const produtoInicial = typeof sp.produto === "string" ? sp.produto : null;
  const pedidoId = typeof sp.pedido === "string" ? sp.pedido : null;
  const supabase = await createClient();
  // vindo de um pedido da vitrine (Registrar venda): a venda abre preenchida
  const { data: pedidoData } = pedidoId
    ? await supabase.from("vitrine_pedidos").select("*").eq("id", pedidoId).eq("status", "novo").maybeSingle()
    : { data: null };
  const [{ data: produtosData }, { data: variacoesData }, { data: clientesData }, { data: canaisData }, { data: formasData }] =
    await Promise.all([
      supabase.from("produtos_com_estoque").select("*").neq("status", "inativo").gt("estoque_total", 0).order("nome"),
      // sem filtro de estoque: variação esgotada aparece em cinza no seletor, em vez de sumir
      supabase.from("produto_variacoes").select("*").order("nome_combinacao"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("canais_venda").select("*").order("nome"),
      supabase.from("formas_pagamento").select("*").order("nome"),
    ]);

  // plano grátis: 30 vendas por mês. O banco barra; aqui só se explica antes de o erro aparecer
  const uso = await lerUso(supabase);
  const vendasRestantes = uso ? restante(uso.vendasMes, uso.limites.vendasMes) : null;

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
          produto_nome: p.nome,
          rotulo: null,
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
        produto_nome: p.nome,
        rotulo: v.nome_combinacao,
        detalhe: [p.marca, v.sku].filter(Boolean).join(" · "),
        preco_varejo: Number(v.preco_venda ?? p.preco_varejo),
        preco_atacado: p.preco_atacado != null ? Number(p.preco_atacado) : null,
        custo: Number(v.custo ?? p.custo),
        estoque: v.estoque,
      }));
  });

  const pedidoRecebido = pedidoData as PedidoRecebido | null;
  const chaves = new Set(vendaveis.map((v) => v.chave));
  const pedido: PedidoParaVenda | null = pedidoRecebido
    ? {
        id: pedidoRecebido.id,
        codigo: pedidoRecebido.codigo,
        itens: pedidoRecebido.itens.map((i) => ({
          chave: i.variacao_id ? `${i.produto_id}:${i.variacao_id}` : i.produto_id,
          quantidade: Number(i.quantidade),
          preco: Number(i.preco),
        })),
        desconto: Number(pedidoRecebido.desconto),
        clienteNome: pedidoRecebido.cliente_nome,
        pagamento: pedidoRecebido.pagamento,
        // itens que acabaram no estoque depois do pedido não dá para vender
        semEstoque: pedidoRecebido.itens
          .filter((i) => !chaves.has(i.variacao_id ? `${i.produto_id}:${i.variacao_id}` : i.produto_id))
          .map((i) => (i.variacao ? `${i.nome} (${i.variacao})` : i.nome)),
      }
    : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <Link
          href="/vendas"
          aria-label="Fechar"
          className="glass flex h-11 w-11 items-center justify-center rounded-full text-ink shadow-sm ring-1 ring-line/60"
        >
          <IconX width={18} height={18} strokeWidth={2.4} />
        </Link>
        <h1 className="text-[17px] font-semibold text-ink">Nova venda</h1>
        <span className="h-11 w-11" aria-hidden="true" />
      </div>
      <div className="hidden lg:block">
        <PageHeader title="Nova venda" back={{ href: "/vendas", label: "Vendas" }} />
      </div>

      {uso && vendasRestantes === 0 ? (
        <LimiteAtingido
          titulo="Você chegou ao limite de vendas do mês"
          texto={`O plano grátis tem ${uso.limites.vendasMes} vendas por mês e você já registrou ${uso.vendasMes}. Assine o plano Marcon para vender sem limite, ou espere o mês virar.`}
        />
      ) : vendaveis.length === 0 ? (
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
        <>
          {vendasRestantes !== null && vendasRestantes <= AVISAR_QUANDO_FALTAREM && (
            <AvisoDeLimite>
              {vendasRestantes === 1
                ? "Falta 1 venda este mês no plano grátis."
                : `Faltam ${vendasRestantes} vendas este mês no plano grátis.`}
            </AvisoDeLimite>
          )}
          <VendaForm
            vendaveis={vendaveis}
            clientes={(clientesData ?? []) as Cliente[]}
            canais={(canaisData ?? []) as CanalVenda[]}
            formas={(formasData ?? []) as FormaPagamento[]}
            hoje={hojeISO()}
            produtoInicial={produtoInicial}
            pedido={pedido}
          />
        </>
      )}
    </div>
  );
}
