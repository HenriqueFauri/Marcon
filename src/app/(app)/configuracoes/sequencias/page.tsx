import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { dadosDaConta } from "@/lib/respostas-servidor";
import type { MidiaResumo, PassoSequencia, RespostaResumo, Sequencia } from "@/lib/sequencias";
import { Sequencias } from "./sequencias";

export const metadata: Metadata = { title: "Sequências" };

// Lista em /configuracoes/sequencias; ?nova=1 cria, ?editar=<id> abre a sequência com os passos,
// ?editar=<id>&passo=<id|novo> abre o passo.
export default async function SequenciasPage({ searchParams }: PageProps<"/configuracoes/sequencias">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const editar = typeof sp.editar === "string" ? sp.editar : null;
  const [{ data: seqs }, { data: passos }, { data: respostas }, { data: midias }, dados] = await Promise.all([
    supabase.from("sequencias").select("id, titulo, ordem").order("ordem").order("created_at"),
    supabase.from("sequencia_passos").select("id, sequencia_id, ordem, texto, resposta_id, midia_id").order("ordem").order("created_at"),
    supabase.from("respostas_prontas").select("id, titulo, texto").order("ordem").order("created_at"),
    supabase.from("midias").select("id, tipo, titulo").order("created_at", { ascending: false }),
    editar ? enderecoDoApp().then((base) => dadosDaConta(supabase, user, base)) : Promise.resolve({}),
  ]);
  const sequencias = (seqs ?? []) as Sequencia[];
  const todos = (passos ?? []) as PassoSequencia[];
  const listaRespostas = (respostas ?? []) as RespostaResumo[];
  const listaMidias = (midias ?? []) as MidiaResumo[];

  if (sp.nova && !editar) {
    return <Sequencias key="nova" modo={{ tela: "nova" }} sequencias={sequencias} passos={todos} respostas={listaRespostas} midias={listaMidias} dados={dados} />;
  }

  if (editar) {
    const sequencia = sequencias.find((s) => s.id === editar);
    if (!sequencia) redirect("/configuracoes/sequencias");
    const daSequencia = todos.filter((p) => p.sequencia_id === sequencia.id);
    const passoId = typeof sp.passo === "string" ? sp.passo : null;
    if (passoId) {
      const passo = passoId === "novo" ? null : daSequencia.find((p) => p.id === passoId);
      if (passo === undefined) redirect(`/configuracoes/sequencias?editar=${sequencia.id}`);
      return (
        <Sequencias
          key={`${sequencia.id}:${passoId}`}
          modo={{ tela: "passo", sequencia, passo, numero: passo ? daSequencia.indexOf(passo) + 1 : daSequencia.length + 1 }}
          sequencias={sequencias}
          passos={daSequencia}
          respostas={listaRespostas}
          midias={listaMidias}
          dados={dados}
        />
      );
    }
    return (
      <Sequencias
        key={sequencia.id}
        modo={{ tela: "sequencia", sequencia }}
        sequencias={sequencias}
        passos={daSequencia}
        respostas={listaRespostas}
        midias={listaMidias}
        dados={dados}
      />
    );
  }

  return <Sequencias key="lista" modo={{ tela: "lista" }} sequencias={sequencias} passos={todos} respostas={listaRespostas} midias={listaMidias} dados={dados} />;
}
