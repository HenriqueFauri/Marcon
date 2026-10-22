import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ErrorMessage, PageHeader } from "@/components/ui";
import { FormCompra, type ProdutoOpcao } from "./form-compra";

export const metadata: Metadata = { title: "Nova compra" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovaCompraPage({ searchParams }: PageProps<"/fornecedores/compras/nova">) {
  const sp = await searchParams;
  const fornecedorParam = typeof sp.fornecedor === "string" && UUID.test(sp.fornecedor) ? sp.fornecedor : "";
  // itens=produtoId:quantidade,produtoId:quantidade (vem da lista de reposição)
  const itensParam =
    typeof sp.itens === "string"
      ? sp.itens
          .split(",")
          .map((par) => par.split(":"))
          .filter(([id, q]) => UUID.test(id ?? "") && Number.isInteger(Number(q)) && Number(q) > 0)
          .slice(0, 100)
          .map(([produtoId, q]) => ({ produtoId, quantidade: Number(q) }))
      : [];

  const supabase = await createClient();
  const [produtosRes, variacoesRes, fornecedoresRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, custo, tem_variacoes").eq("status", "ativo").order("nome").limit(1000),
    supabase.from("produto_variacoes").select("id, produto_id, nome_combinacao, custo").order("nome_combinacao").limit(5000),
    supabase.from("fornecedores").select("id, nome").order("nome"),
  ]);

  const erro = produtosRes.error ?? variacoesRes.error ?? fornecedoresRes.error;
  if (erro) {
    return (
      <div>
        <PageHeader title="Nova compra" back={{ href: "/fornecedores/compras", label: "Compras" }} />
        <ErrorMessage>Não foi possível carregar os dados: {erro.message}</ErrorMessage>
      </div>
    );
  }

  const variacoes = variacoesRes.data ?? [];
  const produtos: ProdutoOpcao[] = (produtosRes.data ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    custo: Number(p.custo),
    variacoes: p.tem_variacoes
      ? variacoes
          .filter((v) => v.produto_id === p.id)
          .map((v) => ({ id: v.id as string, nome: v.nome_combinacao as string, custo: Number(v.custo ?? p.custo) }))
      : [],
  }));
  const ids = new Set(produtos.map((p) => p.id));
  const fornecedores = (fornecedoresRes.data ?? []) as { id: string; nome: string }[];

  return (
    <div>
      <PageHeader title="Nova compra" back={{ href: "/fornecedores/compras", label: "Compras" }} />
      <FormCompra
        produtos={produtos}
        fornecedores={fornecedores}
        inicial={{
          fornecedorId: fornecedores.some((f) => f.id === fornecedorParam) ? fornecedorParam : "",
          itens: itensParam.filter((i) => ids.has(i.produtoId)),
        }}
      />
    </div>
  );
}
