import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { hojeISO } from "@/lib/format";
import { btnPrimary } from "@/components/ui";
import { IconBox, IconPalette, IconSettings, IconTicket } from "@/components/icons";
import { Grupo, LinhaLink } from "./campos";
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
    <div className="rounded-2xl bg-fill/60 px-2 py-3 text-center">
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
    { count: cuponsAtivos },
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("slug, ativa").maybeSingle(),
    supabase.from("produtos").select("id, nome").eq("status", "ativo").eq("na_vitrine", true),
    supabase.from("formas_pagamento").select("id", { count: "exact", head: true }),
    supabase.from("vitrine_metricas").select("visitas, pedidos").gte("dia", desde),
    supabase.from("vitrine_metricas_produto").select("produto_id, aberturas").gte("dia", desde),
    supabase.from("vitrine_cupons").select("id", { count: "exact", head: true }).eq("ativo", true),
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

  const pendentes = passos.filter((p) => !p.feito);
  const tile = "h-[17px] w-[17px]";

  return (
    <div className="flex flex-col gap-7">
      <Grupo titulo="Sua loja">
        {vitrine?.ativa ? (
          <LinkDaLoja link={`${base}/loja/${vitrine.slug}`} nomeLoja={(meta.nome_negocio as string | undefined) || "loja"} />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] text-ink-2">
              {vitrine
                ? 'A loja está desligada: o link mostra "loja não encontrada".'
                : "Em poucos minutos você tem um link com seus produtos para mandar no status e nos grupos."}
            </p>
            <Link href="/vitrine/configuracoes" className={btnPrimary}>
              {vitrine ? "Colocar no ar" : "Criar minha loja"}
            </Link>
          </div>
        )}
      </Grupo>

      {pendentes.length > 0 && (
        <Grupo
          titulo={
            <span className="flex justify-between">
              <span>Para deixar pronta</span>
              <span className="normal-case">
                {feitos} de {passos.length}
              </span>
            </span>
          }
          semPadding
        >
          {pendentes.map((p) => (
            <Link
              key={p.titulo}
              href={p.href}
              className="flex items-center gap-3 border-t border-line px-4 py-3 transition first:border-t-0 hover:bg-fill/60 active:bg-fill"
            >
              <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-line-strong" />
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] text-ink">{p.titulo}</span>
                <span className="block text-[13px] leading-snug text-ink-muted">{p.ajuda}</span>
              </span>
              <span aria-hidden="true" className="text-lg text-ink-faint">
                ›
              </span>
            </Link>
          ))}
        </Grupo>
      )}

      {/* no celular as seções ficam aqui, como no Ajustes do iPhone; no computador, nas abas do topo */}
      <div className="sm:hidden">
        <Grupo titulo="Gerenciar" semPadding>
          <LinhaLink
            href="/vitrine/produtos"
            icone={<IconBox className={tile} />}
            tom="bg-brand text-on-brand"
            rotulo="Produtos"
            detalhe={marcados.length === 0 ? "Nenhum" : `${marcados.length} na loja`}
          />
          <LinhaLink
            href="/vitrine/personalizar"
            icone={<IconPalette className={tile} />}
            tom="bg-tile-warning text-on-tile-warning"
            rotulo="Personalizar"
          />
          <LinhaLink
            href="/vitrine/configuracoes"
            icone={<IconSettings className={tile} />}
            tom="bg-ink-muted text-surface"
            rotulo="Configurações"
          />
          <LinhaLink
            href="/vitrine/cupons"
            icone={<IconTicket className={tile} />}
            tom="bg-tile-positive text-on-tile-positive"
            rotulo="Cupons"
            detalhe={(cuponsAtivos ?? 0) === 0 ? "Nenhum" : `${cuponsAtivos} ${cuponsAtivos === 1 ? "ativo" : "ativos"}`}
          />
        </Grupo>
      </div>

      {vitrine && (
        <Grupo
          titulo={
            <span className="flex justify-between">
              <span>Desempenho</span>
              <span className="normal-case">Últimos {DIAS_METRICAS} dias</span>
            </span>
          }
          rodape={maisVistos.length === 0 ? "Suas visitas logado não contam. Divulgue o link e os números aparecem aqui." : undefined}
        >
          <div className="grid grid-cols-3 gap-2">
            <Numero valor={visitas} rotulo="visitas" />
            <Numero valor={pedidos} rotulo="pedidos" />
            <Numero valor={visitas > 0 ? `${Math.round((pedidos / visitas) * 100)}%` : "0%"} rotulo="conversão" />
          </div>
          {maisVistos.length > 0 && (
            <div>
              <p className="mb-1 text-[13px] text-ink-muted">Mais vistos</p>
              <ol className="divide-y divide-line">
                {maisVistos.map(([id, n], i) => (
                  <li key={id} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                    <Link href={`/produtos/${id}`} className="min-w-0 truncate text-ink hover:underline">
                      <span className="mr-2 tabular-nums text-ink-muted">{i + 1}</span>
                      {nomePorId.get(id)}
                    </Link>
                    <span className="shrink-0 tabular-nums text-ink-muted">{n}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Grupo>
      )}
    </div>
  );
}
