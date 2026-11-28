import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { dadosDaConta } from "@/lib/respostas-servidor";
import type { RespostaPronta } from "@/lib/respostas";
import { RespostasProntas } from "./respostas-prontas";

export const metadata: Metadata = { title: "Respostas prontas" };

// Lista em /configuracoes/respostas; ?nova=1 abre o formulário vazio e ?editar=<id> a resposta.
export default async function RespostasProntasPage({ searchParams }: PageProps<"/configuracoes/respostas">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, dados] = await Promise.all([
    supabase.from("respostas_prontas").select("id, titulo, texto, atalho, ordem").order("ordem").order("created_at"),
    enderecoDoApp().then((base) => dadosDaConta(supabase, user, base)),
  ]);
  const respostas = (data ?? []) as RespostaPronta[];

  const editar = typeof sp.editar === "string" ? sp.editar : null;
  let editando: RespostaPronta | null | undefined;
  if (editar) {
    editando = respostas.find((r) => r.id === editar);
    if (!editando) redirect("/configuracoes/respostas");
  } else if (sp.nova) {
    editando = null;
  }

  return <RespostasProntas key={editar ?? (sp.nova ? "nova" : "lista")} respostas={respostas} dados={dados} editando={editando} />;
}
