import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { hojeISO } from "@/lib/format";
import { Card, btnPrimary } from "@/components/ui";
import { LinkDaLoja } from "./link-da-loja";

export const metadata: Metadata = { title: "Vitrine" };

const DIAS_METRICAS = 30;

function diasAtras(dia: string, dias: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function Numero({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <div className="rounded-2xl bg-fill/60 px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums text-ink">{valor}</p>
      <p className="text-xs text-ink-muted">{rotulo}</p>
    </div>
  );
}

interface Passo {
  feito: boolean;
  titulo: string;
  ajuda: string;
  href: string;
}

// Visão geral: o link para divulgar, o que falta para a loja ficar pronta e como ela está indo.
export default async function VitrineVisaoGeralPage() {
  const supabase = await createClient();
  const desde = diasAtras(hojeISO(), DIAS_METRICAS - 1);
  const [
    {
      data: { user },
    },
    { data: vitrine },
    { data: marcadosData },
    { count: formasPagamento },
    { data: metricasData },
    { data: metricasProdutoData },
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
    supabase.from("produtos").select("id, nome").eq("status", "ativo").eq("na_vitrine", true),
    supabase.from("formas_pagamento").select("id", { count: "exact", head: true }),
    supabase.from("vitrine_metricas").select("visitas, pedidos").gte("dia", desde),
    supabase.from("vitrine_metricas_produto").select("produto_id, aberturas").gte("dia", desde),
    enderecoDoApp(),
  ]);

  const meta = user?.user_metadata ?? {};
  const marcados = marcadosData ?? [];
  const { data: fotosData } = marcados.length
    ? await supabase.from("produto_fotos").select("produto_id").in("produto_id", marcados.map((p) => p.id))
    : { data: [] };
  const comFoto = new Set((fotosData ?? []).map((f) => f.produto_id as string));
  const semFoto = marcados.filter((p) => !comFoto.has(p.id)).length;

  const passos: Passo[] = [
    { feito: !!vitrine, titulo: "Criar a loja", ajuda: "Escolha o endereço e o WhatsApp que recebe os pedidos.", href: "/vitrine/configuracoes" },
    { feito: !!vitrine?.ativa, titulo: "Colocar no ar", ajuda: 'Ligue "Vitrine no ar" em Configurações.', href: "/vitrine/configuracoes" },
    { feito: marcados.length > 0, titulo: "Escolher os produtos", ajuda: "Ligue os produtos que aparecem na loja.", href: "/vitrine/produtos" },
    {
      feito: marcados.length > 0 && semFoto === 0,
      titulo: "Foto em todos os produtos da vitrine",
      ajuda: semFoto > 0 ? `${semFoto} ${semFoto === 1 ? "produto está" : "produtos estão"} sem foto. Envie em Anúncios.` : "Envie as fotos em Anúncios.",
      href: "/anuncios",
    },
    { feito: !!meta.empresa_logo_path, titulo: "Logo da loja", ajuda: "Envie em Configurações, Dados da empresa.", href: "/configuracoes" },
    { feito: (formasPagamento ?? 0) > 0, titulo: "Formas de pagamento", ajuda: "O cliente escolhe no pedido.", href: "/configuracoes" },
  ];
  const feitos = passos.filter((p) => p.feito).length;

  const visitas = (metricasData ?? []).reduce((s, m) => s + Number(m.visitas), 0);
  const pedidos = (metricasData ?? []).reduce((s, m) => s + Number(m.pedidos), 0);
  const aberturas = new Map<string, number>();
  for (const m of metricasProdutoData ?? []) aberturas.set(m.produto_id, (aberturas.get(m.produto_id) ?? 0) + Number(m.aberturas));
  const nomePorId = new Map(marcados.map((p) => [p.id, p.nome]));
  const maisVistos = [...aberturas.entries()]
    .filter(([id]) => nomePorId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Sua loja">
        {vitrine?.ativa ? (
          <LinkDaLoja link={`${base}/loja/${vitrine.slug}`} nomeLoja={(meta.nome_negocio as string | undefined) || "loja"} />
        ) : vitrine ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink-2">A loja está desligada: o link mostra &quot;loja não encontrada&quot;.</p>
            <Link href="/vitrine/configuracoes" className={btnPrimary}>
              Colocar no ar
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink-2">Em poucos minutos você tem um link com seus produtos para mandar no status e nos grupos.</p>
            <Link href="/vitrine/configuracoes" className={btnPrimary}>
              Criar minha loja
            </Link>
          </div>
        )}

        {feitos < passos.length && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">Primeiros passos</p>
              <p className="text-xs text-ink-muted">
                {feitos} de {passos.length}
              </p>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
            </div>
            <ul className="flex flex-col gap-1">
              {passos.map((p) => (
                <li key={p.titulo}>
                  <Link
                    href={p.href}
                    className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm transition ${p.feito ? "" : "hover:bg-fill"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        p.feito ? "bg-positive text-white" : "border border-line-strong text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={`min-w-0 flex-1 ${p.feito ? "text-ink-muted line-through" : "text-ink"}`}>
                      <span className="font-medium">{p.titulo}</span>
                      {!p.feito && <span className="block text-xs text-ink-muted">{p.ajuda}</span>}
                    </span>
                    {!p.feito && <span className="shrink-0 text-ink-muted">›</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {vitrine && (
        <Card
          title="Desempenho"
          description={`Últimos ${DIAS_METRICAS} dias. Visita e produto aberto contam uma vez por dia em cada aparelho; suas próprias visitas logado não contam.`}
        >
          <div className="grid grid-cols-3 gap-2">
            <Numero valor={visitas} rotulo="visitas" />
            <Numero valor={pedidos} rotulo="pedidos enviados" />
            <Numero valor={visitas > 0 ? `${Math.round((pedidos / visitas) * 100)}%` : "0%"} rotulo="viraram pedido" />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Pedido enviado é quem tocou em &quot;Enviar pedido pelo WhatsApp&quot;. O mesmo carrinho enviado de novo não conta duas vezes.
          </p>
          {maisVistos.length > 0 ? (
            <div className="mt-4">
              <p className="mb-1.5 text-[13px] font-semibold text-ink">Produtos mais vistos</p>
              <ol className="divide-y divide-line text-sm">
                {maisVistos.map(([id, n], i) => (
                  <li key={id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/produtos/${id}`} className="min-w-0 truncate text-ink hover:underline">
                      <span className="mr-2 tabular-nums text-ink-muted">{i + 1}.</span>
                      {nomePorId.get(id)}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                      {n} {n === 1 ? "vez" : "vezes"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">Divulgue o link: os números aparecem aqui conforme os clientes visitam.</p>
          )}
        </Card>
      )}
    </div>
  );
}
