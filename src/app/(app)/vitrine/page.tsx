import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { lerUso } from "@/lib/uso";
import { hojeISO } from "@/lib/format";
import { Badge, Card, PageHeader, btnPrimary } from "@/components/ui";
import { BannerImagens } from "./banner-imagens";
import { Cupons, type CupomDaLista } from "./cupons";
import { LinkDaLoja } from "./link-da-loja";
import { ProdutosDaVitrine, type ProdutoDaLista } from "./produtos-da-vitrine";
import { VitrineForm } from "./vitrine-form";

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
  href?: string;
}

export default async function VitrinePage() {
  const supabase = await createClient();
  const hoje = hojeISO();
  const desde = diasAtras(hoje, DIAS_METRICAS - 1);
  const [
    {
      data: { user },
    },
    { data: vitrine },
    { data: produtosData },
    { data: estoquesData },
    { data: fotosData },
    { count: formasPagamento },
    { data: cuponsData },
    { data: metricasData },
    { data: metricasProdutoData },
    uso,
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("*").maybeSingle(),
    // da tabela, não da view: a view produtos_com_estoque não tem as colunas da vitrine
    supabase.from("produtos").select("id, nome, preco_varejo, na_vitrine, destaque").eq("status", "ativo").order("nome"),
    supabase.from("produtos_com_estoque").select("id, estoque_total").eq("status", "ativo"),
    supabase.from("produto_fotos").select("produto_id, path, variacao_id").order("ordem").order("created_at"),
    supabase.from("formas_pagamento").select("id", { count: "exact", head: true }),
    supabase.from("vitrine_cupons").select("id, codigo, tipo, valor, minimo, validade, ativo").order("created_at", { ascending: false }),
    supabase.from("vitrine_metricas").select("visitas, pedidos").gte("dia", desde),
    supabase.from("vitrine_metricas_produto").select("produto_id, aberturas").gte("dia", desde),
    lerUso(supabase),
    enderecoDoApp(),
  ]);

  const meta = user?.user_metadata ?? {};
  const temPlano = uso ? uso.plano !== "gratis" : true;
  const nomeNegocio = (meta.nome_negocio as string | undefined) ?? "";

  if (!temPlano) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Vitrine" description="Sua loja online com link: o cliente escolhe os produtos e o pedido chega pronto no seu WhatsApp." />
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] font-semibold text-ink">A vitrine faz parte do plano Marcon.</p>
            <p className="text-sm text-ink-2">
              Com ela você manda um link só no status e nos grupos, o cliente vê fotos e preços, monta o pedido e ele chega pronto
              no seu WhatsApp. Sem precisar responder &quot;ainda tem?&quot; um por um.
            </p>
            {vitrine && <p className="text-xs text-ink-muted">Sua loja e as escolhas de produtos continuam guardadas e voltam ao assinar.</p>}
            <Link href="/assinatura" className={`${btnPrimary} mt-1`}>
              Ver o plano Marcon
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // capa de cada produto: a primeira foto geral; foto de variação só se não houver nenhuma geral
  const capa = new Map<string, string>();
  const capaGeral = new Map<string, string>();
  for (const f of fotosData ?? []) {
    if (f.variacao_id === null && !capaGeral.has(f.produto_id)) capaGeral.set(f.produto_id, f.path);
    if (!capa.has(f.produto_id)) capa.set(f.produto_id, f.path);
  }
  for (const [id, path] of capaGeral) capa.set(id, path);
  const caminhos = [...new Set(capa.values())];
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("produto-fotos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const urlPorCaminho = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));
  const estoque = new Map((estoquesData ?? []).map((e) => [e.id as string, Number(e.estoque_total ?? 0)]));

  const produtos: ProdutoDaLista[] = (produtosData ?? []).map((p) => {
    const caminho = capa.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      preco: Number(p.preco_varejo),
      naVitrine: p.na_vitrine,
      destaque: p.destaque,
      foto: caminho ? (urlPorCaminho.get(caminho) ?? null) : null,
      semFoto: !caminho,
      esgotado: (estoque.get(p.id) ?? 0) <= 0,
    };
  });
  const marcados = produtos.filter((p) => p.naVitrine);

  const visitas = (metricasData ?? []).reduce((s, m) => s + Number(m.visitas), 0);
  const pedidos = (metricasData ?? []).reduce((s, m) => s + Number(m.pedidos), 0);
  const aberturas = new Map<string, number>();
  for (const m of metricasProdutoData ?? []) aberturas.set(m.produto_id, (aberturas.get(m.produto_id) ?? 0) + Number(m.aberturas));
  const nomePorId = new Map(produtos.map((p) => [p.id, p.nome]));
  const maisVistos = [...aberturas.entries()]
    .filter(([id]) => nomePorId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const cupons = (cuponsData ?? []).map((c) => ({ ...c, valor: Number(c.valor), minimo: c.minimo === null ? null : Number(c.minimo) })) as CupomDaLista[];

  const paths = (vitrine?.banner_paths as string[] | undefined) ?? [];
  const { data: bannerAssinado } =
    paths.length > 0 ? await supabase.storage.from("vitrine-banner").createSignedUrls(paths, 3600) : { data: [] };
  const imagens = paths.flatMap((path) => {
    const url = bannerAssinado?.find((a) => a.path === path)?.signedUrl;
    return url ? [{ path, url }] : [];
  });

  const passos: Passo[] = [
    { feito: !!vitrine, titulo: "Criar a loja", ajuda: "Escolha o endereço e o WhatsApp lá embaixo e salve." },
    { feito: !!vitrine?.ativa, titulo: "Colocar no ar", ajuda: 'Ligue "Vitrine no ar" e salve.' },
    { feito: marcados.length > 0, titulo: "Escolher os produtos", ajuda: "Ligue os produtos na lista abaixo." },
    {
      feito: marcados.length > 0 && marcados.every((p) => !p.semFoto),
      titulo: "Foto em todos os produtos da vitrine",
      ajuda: "Produto com foto vende muito mais. Envie as fotos em Anúncios.",
      href: "/anuncios",
    },
    { feito: !!meta.empresa_logo_path, titulo: "Logo da loja", ajuda: "Envie em Configurações, Dados da empresa.", href: "/configuracoes" },
    {
      feito: (formasPagamento ?? 0) > 0,
      titulo: "Formas de pagamento",
      ajuda: "O cliente escolhe no pedido. Cadastre em Configurações.",
      href: "/configuracoes",
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const link = vitrine ? `${base}/loja/${vitrine.slug}` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Vitrine"
        description="Sua loja online com link: o cliente escolhe os produtos e o pedido chega pronto no seu WhatsApp."
      />
      <div className="flex flex-col gap-6">
        <Card
          title="Sua loja"
          action={
            vitrine ? (
              <Badge tone={vitrine.ativa ? "positive" : "neutral"}>{vitrine.ativa ? "No ar" : "Desligada"}</Badge>
            ) : (
              <Badge tone="info">Não criada</Badge>
            )
          }
        >
          {link && vitrine?.ativa ? (
            <LinkDaLoja link={link} nomeLoja={nomeNegocio || "loja"} />
          ) : (
            <p className="text-sm text-ink-2">
              {vitrine ? 'A loja está desligada. Ligue "Vitrine no ar" lá embaixo para o link abrir.' : "Siga os passos abaixo e sua loja fica pronta em poucos minutos."}
            </p>
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
              <ul className="flex flex-col gap-2">
                {passos.map((p) => (
                  <li key={p.titulo} className="flex items-start gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        p.feito ? "bg-positive text-white" : "border border-line-strong text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <div className={p.feito ? "text-ink-muted line-through" : "text-ink"}>
                      <span className="font-medium">{p.titulo}</span>
                      {!p.feito && (
                        <span className="block text-xs text-ink-muted">
                          {p.href ? (
                            <Link href={p.href} className="hover:underline">
                              {p.ajuda}
                            </Link>
                          ) : (
                            p.ajuda
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {vitrine && (
          <Card title="Desempenho" description={`Últimos ${DIAS_METRICAS} dias. Pedido enviado é quem tocou em "Enviar pedido pelo WhatsApp".`}>
            <div className="grid grid-cols-3 gap-2">
              <Numero valor={visitas} rotulo="visitas" />
              <Numero valor={pedidos} rotulo="pedidos enviados" />
              <Numero valor={visitas > 0 ? `${Math.round((pedidos / visitas) * 100)}%` : "0%"} rotulo="viraram pedido" />
            </div>
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

        <Card title="Produtos na vitrine" description="Escolha o que aparece na loja. Custo e quantidade em estoque nunca aparecem.">
          <ProdutosDaVitrine produtos={produtos} linkDaLoja={vitrine?.ativa ? link : null} />
        </Card>

        <Card title="Cupons de desconto" description="Crie um código para divulgar. O cliente digita no pedido e o desconto vai junto na mensagem.">
          <Cupons cupons={cupons} hoje={hoje} />
        </Card>

        <Card title="Aparência e pedidos">
          <VitrineForm
            config={
              vitrine
                ? {
                    slug: vitrine.slug,
                    ativa: vitrine.ativa,
                    whatsapp: vitrine.whatsapp,
                    cor: vitrine.cor,
                    tema: vitrine.tema,
                    boasVindas: vitrine.boas_vindas ?? "",
                    anuncio: vitrine.anuncio ?? "",
                    entrega: vitrine.entrega,
                    freteFixo: vitrine.frete_fixo === null ? "" : String(vitrine.frete_fixo).replace(".", ","),
                    instagram: vitrine.instagram ?? "",
                    mostrarEndereco: vitrine.mostrar_endereco,
                    ultimasUnidades: vitrine.ultimas_unidades,
                    bannerTitulo: vitrine.banner_titulo ?? "",
                    bannerSubtitulo: vitrine.banner_subtitulo ?? "",
                    bannerBotao: vitrine.banner_botao ?? "",
                  }
                : null
            }
            nomeNegocio={nomeNegocio}
            telefoneEmpresa={(meta.empresa_telefone as string | undefined) ?? ""}
            temEndereco={!!(meta.empresa_endereco as string | undefined)}
            base={base}
            bannerImagens={<BannerImagens imagens={imagens} habilitado={!!vitrine} />}
          />
        </Card>
      </div>
    </div>
  );
}
