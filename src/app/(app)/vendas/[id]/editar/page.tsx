import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CanalVenda, Cliente, FormaPagamento, Venda, VendaItem } from "@/types/domain";
import { hojeISO } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { EditarVendaForm } from "./editar-venda-form";

export const metadata: Metadata = { title: "Editar venda" };

export default async function EditarVendaPage({ params }: PageProps<"/vendas/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: vendaData }, { data: itensData }, { data: clientes }, { data: canais }, { data: formas }] =
    await Promise.all([
      supabase.from("vendas").select("*").eq("id", id).maybeSingle(),
      supabase.from("venda_itens").select("*").eq("venda_id", id).order("produto_nome"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("canais_venda").select("*").order("nome"),
      supabase.from("formas_pagamento").select("*").order("nome"),
    ]);

  if (!vendaData) notFound();
  const venda = vendaData as Venda;
  if (venda.status === "cancelada") redirect(`/vendas/${id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/vendas/${id}`, label: "Venda" }} title="Editar venda" />
      <EditarVendaForm
        venda={venda}
        itens={(itensData ?? []) as VendaItem[]}
        clientes={(clientes ?? []) as Cliente[]}
        canais={(canais ?? []) as CanalVenda[]}
        formas={(formas ?? []) as FormaPagamento[]}
        hoje={hojeISO()}
      />
    </div>
  );
}
