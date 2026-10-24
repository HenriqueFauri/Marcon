import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { lerTudo } from "@/lib/ler-tudo";
import { lerCapas } from "@/lib/capas";
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
  const repetirId = typeof sp.repetir === "string" && /^[0-9a-f-]{36}$/i.test(sp.repetir) ? sp.repetir : null;
  const supabase = await createClient();
  // vindo de um pedido da vitrine (Registrar venda): a venda abre preenchida
  const { data: pedidoData } = pedidoId
    ? await supabase.from("vitrine_pedidos").select("*").eq("id", pedidoId).eq("status", "novo").maybeSingle()
    : { data: null };
  // "Repetir venda": o RLS limita ao dono; id de outro dono simplesmente não preenche nada
  const [{ data: vendaRepetida }, { data: itensRepetidos }] = repetirId
    ? await Promise.all([
        supabase.from("vendas").select("cliente_nome, canal, forma_pagamento, desconto").eq("id", repetirId).maybeSingle(),
        supabase.from("venda_itens").select("produto_id, variacao_id, produto_nome, quantidade").eq("venda_id", repetirId),
      ])
    : [{ data: null }, { data: null }];
  // listas que podem passar de 1000 linhas vêm página a página (o PostgREST corta cada consulta em 1000);
  // das fotos vem só a capa de cada produto
  const [produtosData, variacoesData, clientesData, { data: canaisData }, { data: formasData }, capas] = await Promise.all([
    lerTudo((de, ate) =>
      supabase
        .from("produtos_com_estoque")
        .select("*")
        .neq("status", "inativo")
        .order("nome")
        .order("id")
        .range(de, ate),
    ).catch(() => []),
    // sem filtro de estoque: produto e variação zerados também aparecem (venda de encomenda)
    lerTudo((de, ate) => supabase.from("produto_variacoes").select("*").order("nome_combinacao").order("id").range(de, ate)).catch(
      () => [],
    ),
    lerTudo((de, ate) => supabase.from("clientes").select("*").order("nome").order("id").range(de, ate)).catch(() => []),
    supabase.from("canais_venda").select("*").order("nome"),
    supabase.from("formas_pagamento").select("*").order("nome"),
    lerCapas(supabase).catch(() => new Map<string, { path: string; totalFotos: number }>()),
  ]);

  // plano grátis: 30 vendas por mês. O banco barra; aqui só se explica antes de o erro aparecer
  const uso = await lerUso(supabase);
  const vendasRestantes = uso ? restante(uso.vendasMes, uso.limites.vendasMes) : null;

  const variacoes = (variacoesData ?? []) as ProdutoVariacao[];
  // com estoque primeiro, zerados no fim (cada parte na ordem de nome que já vem do banco).
  // Com variações conta só o que é positivo: uma variação negativa não esconde as outras
  const positivoPorProduto = new Map<string, number>();
  for (const v of variacoes) {
    positivoPorProduto.set(v.produto_id, (positivoPorProduto.get(v.produto_id) ?? 0) + Math.max(Number(v.estoque), 0));
  }
  const temEstoque = (p: ProdutoComEstoque) =>
    (p.tem_variacoes ? (positivoPorProduto.get(p.id) ?? 0) : Number(p.estoque_total)) > 0;
  const lidos = (produtosData ?? []) as ProdutoComEstoque[];
  const produtos = [...lidos.filter(temEstoque), ...lidos.filter((p) => !temEstoque(p))];

  // capa de cada produto à venda: a primeira foto geral; foto de variação só se não houver nenhuma geral.
  // Uma chamada de assinatura para a lista toda
  const capa = new Map<string, string>();
  for (const p of produtos) {
    const c = capas.get(p.id);
    if (c) capa.set(p.id, c.path);
  }
  const caminhos = [...new Set(capa.values())];
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  const fotoDe = (produtoId: string) => {
    const caminho = capa.get(produtoId);
    return caminho ? (urlPorCaminho.get(caminho) ?? null) : null;
  };

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
          detalhe: [p.marca, p.sku, p.codigo_barras].filter(Boolean).join(" · "),
          preco_varejo: Number(p.preco_varejo),
          preco_atacado: p.preco_atacado != null ? Number(p.preco_atacado) : null,
          custo: Number(p.custo),
          estoque: p.estoque_total,
          foto: fotoDe(p.id),
        },
      ];
    }
    return variacoes
      .filter((v) => v.produto_id === p.id)
      .map((v) => ({
        chave: `${p.id}:${v.id}`,
        produto_id: p.id,
        variacao_id: v.id,
        nome: `${p.nome} · ${v.nome_combinacao}`,
        produto_nome: p.nome,
        rotulo: v.nome_combinacao,
        detalhe: [p.marca, v.sku].filter(Boolean).join(" · "),
        preco_varejo: Number(v.preco_venda ?? p.preco_varejo),
        preco_atacado: p.preco_atacado != null ? Number(p.preco_atacado) : null,
        custo: Number(v.custo ?? p.custo),
        estoque: v.estoque,
        foto: fotoDe(p.id),
      }));
  });

  const pedidoRecebido = pedidoData as PedidoRecebido | null;
  const chaves = new Set(vendaveis.map((v) => v.chave));
  const pedidoRepetido: PedidoParaVenda | null =
    vendaRepetida && itensRepetidos
      ? {
          id: null,
          codigo: "",
          repetida: { cliente: vendaRepetida.cliente_nome },
          canal: vendaRepetida.canal,
          itens: itensRepetidos
            .map((i) => (i.produto_id ? (i.variacao_id ? `${i.produto_id}:${i.variacao_id}` : i.produto_id) : null))
            .flatMap((chave, n) => {
              const v = chave ? vendaveis.find((x) => x.chave === chave) : undefined;
              return v ? [{ chave: v.chave, quantidade: Number(itensRepetidos[n].quantidade), preco: v.preco_varejo }] : [];
            }),
          desconto: Number(vendaRepetida.desconto ?? 0),
          clienteNome: vendaRepetida.cliente_nome,
          pagamento: vendaRepetida.forma_pagamento,
          semEstoque: itensRepetidos
            .filter((i) => !i.produto_id || !chaves.has(i.variacao_id ? `${i.produto_id}:${i.variacao_id}` : i.produto_id))
            .map((i) => i.produto_nome),
        }
      : null;
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
        // itens que saíram de venda (inativos ou apagados) depois do pedido
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
          title="Nenhum produto cadastrado"
          description="Cadastre um produto pra poder vender."
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
            pedido={pedido ?? pedidoRepetido}
          />
        </>
      )}
    </div>
  );
}
