import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { hojeISO } from "@/lib/format";
import { btnPrimary } from "@/components/ui";
import { IconBox, IconPalette, IconReceipt, IconSettings, IconTicket } from "@/components/icons";
import type { PedidoRecebido } from "@/lib/vitrine";
import { Grupo, LinhaLink } from "./campos";
import { DivulgarProduto, type ProdutoParaDivulgar } from "./divulgar-produto";
import { LinkDaLoja } from "./link-da-loja";
import { LinhaDoPedido } from "./pedidos/linha-do-pedido";

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

// Visão geral: o link (com QR), pedidos novos, o próximo passo, divulgar um produto e como a loja está indo.
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
    { data: pedidosData, count: pedidosNovos },
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("slug, ativa, banner_paths, banner_titulo").maybeSingle(),
    supabase
      .from("produtos")
      .select("id, nome, preco_varejo, tem_variacoes, estoque_atual, destaque")
      .eq("status", "ativo")
      .eq("na_vitrine", true)
      .order("created_at", { ascending: false }),
    supabase.from("formas_pagamento").select("id", { count: "exact", head: true }),
    supabase.from("vitrine_metricas").select("visitas, pedidos").gte("dia", desde),
    supabase.from("vitrine_metricas_produto").select("produto_id, aberturas").gte("dia", desde),
    supabase.from("vitrine_cupons").select("id", { count: "exact", head: true }).eq("ativo", true),
    // sem a migration 0037 a consulta falha e a página segue sem o bloco de pedidos
    supabase.from("vitrine_pedidos").select("*", { count: "exact" }).eq("status", "novo").order("created_at", { ascending: false }).limit(3),
    enderecoDoApp(),
  ]);

  const meta = user?.user_metadata ?? {};
  const marcados = marcadosData ?? [];
  const ids = marcados.map((p) => p.id);
  const [{ data: fotosData }, { data: variacoesData }] = await Promise.all([
    ids.length
      ? supabase.from("produto_fotos").select("produto_id, path, variacao_id").in("produto_id", ids).order("ordem")
      : Promise.resolve({ data: [] as { produto_id: string; path: string; variacao_id: string | null }[] }),
    ids.length
      ? supabase.from("produto_variacoes").select("produto_id, preco_venda, estoque").in("produto_id", ids)
      : Promise.resolve({ data: [] as { produto_id: string; preco_venda: number | null; estoque: number }[] }),
  ]);
  const comFoto = new Set((fotosData ?? []).map((f) => f.produto_id as string));
  const semFoto = marcados.filter((p) => !comFoto.has(p.id)).length;

  // estoque e preço como a loja mostra: com variações, esgotado só se todas zeraram; preço "a partir de"
  const variacoesDe = new Map<string, { preco: number | null; estoque: number }[]>();
  for (const v of variacoesData ?? []) {
    const lista = variacoesDe.get(v.produto_id) ?? [];
    lista.push({ preco: v.preco_venda === null ? null : Number(v.preco_venda), estoque: Number(v.estoque) });
    variacoesDe.set(v.produto_id, lista);
  }
  const situacao = marcados.map((p) => {
    const vs = p.tem_variacoes ? (variacoesDe.get(p.id) ?? []) : [];
    const esgotado = p.tem_variacoes ? !vs.some((v) => v.estoque > 0) : Number(p.estoque_atual) <= 0;
    const precos = vs.length ? vs.map((v) => v.preco ?? Number(p.preco_varejo)) : [Number(p.preco_varejo)];
    return { ...p, esgotado, preco: Math.min(...precos), varia: Math.min(...precos) !== Math.max(...precos) };
  });
  const esgotados = situacao.filter((p) => p.esgotado).length;

  // primeira foto de cada produto (a do produto antes das de variação), assinada para a miniatura
  const fotoDe = new Map<string, string>();
  for (const foto of [...(fotosData ?? [])].sort((a, b) => Number(!!a.variacao_id) - Number(!!b.variacao_id)))
    if (!fotoDe.has(foto.produto_id)) fotoDe.set(foto.produto_id, foto.path);
  const { data: assinadas } = fotoDe.size
    ? await supabase.storage.from("produto-fotos").createSignedUrls([...fotoDe.values()], 3600)
    : { data: [] };
  const urlDe = new Map((assinadas ?? []).flatMap((a) => (a.path && a.signedUrl ? [[a.path, a.signedUrl] as const] : [])));
  // para divulgar: só o que está à venda, destaques primeiro
  const paraDivulgar: ProdutoParaDivulgar[] = situacao
    .filter((p) => !p.esgotado)
    .sort((a, b) => Number(b.destaque) - Number(a.destaque))
    .map((p) => ({ id: p.id, nome: p.nome, preco: p.preco, varia: p.varia, foto: urlDe.get(fotoDe.get(p.id) ?? "") ?? null }));

  const pedidosRecentes = (pedidosData ?? []) as PedidoRecebido[];

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
  const linkDaLoja = vitrine ? `${base}/loja/${vitrine.slug}` : "";

  // Próximo passo: com a loja pronta, uma sugestão só (a mais importante), a partir do que já sabemos
  const temBanner = ((vitrine?.banner_paths as string[] | undefined) ?? []).length > 0 || !!vitrine?.banner_titulo;
  const sugestoes: Passo[] = [];
  if (esgotados > 0)
    sugestoes.push({
      feito: false,
      titulo: `${esgotados} ${esgotados === 1 ? "produto da vitrine está esgotado" : "produtos da vitrine estão esgotados"}`,
      ajuda: "Aparecem no fim da loja como esgotados. Reponha o estoque ou tire da vitrine.",
      href: "/vitrine/produtos",
    });
  if (situacao.length > 0 && !situacao.some((p) => p.destaque))
    sugestoes.push({ feito: false, titulo: "Escolha os produtos em destaque", ajuda: "Eles aparecem no topo da loja, antes de todos.", href: "/vitrine/produtos" });
  if (!temBanner)
    sugestoes.push({ feito: false, titulo: "Coloque um banner", ajuda: "Uma imagem ou frase no topo da loja chama a atenção pra novidade.", href: "/vitrine/personalizar" });
  if ((cuponsAtivos ?? 0) === 0)
    sugestoes.push({ feito: false, titulo: "Crie um cupom de boas-vindas", ajuda: "Um desconto pequeno ajuda o cliente a fechar o primeiro pedido.", href: "/vitrine/cupons" });
  const proximo = pendentes.length === 0 ? sugestoes[0] : undefined;

  return (
    <div className="flex flex-col gap-7">
      <Grupo titulo="Sua loja">
        {vitrine?.ativa ? (
          <LinkDaLoja link={linkDaLoja} nomeLoja={(meta.nome_negocio as string | undefined) || "loja"} />
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

      {(pedidosNovos ?? 0) > 0 && (
        <Grupo
          titulo={
            <span className="flex justify-between">
              <span>Pedidos novos</span>
              <span className="normal-case">{pedidosNovos}</span>
            </span>
          }
          semPadding
        >
          {pedidosRecentes.map((p) => (
            <LinhaDoPedido key={p.id} pedido={p} />
          ))}
          {(pedidosNovos ?? 0) > pedidosRecentes.length && (
            <Link
              href="/vitrine/pedidos"
              className="block border-t border-line px-4 py-3 text-[15px] font-medium text-brand-text transition hover:bg-fill/60"
            >
              Ver todos os pedidos
            </Link>
          )}
        </Grupo>
      )}

      {proximo && (
        <Grupo titulo="Próximo passo" semPadding>
          <Link href={proximo.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-fill/60 active:bg-fill">
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] text-ink">{proximo.titulo}</span>
              <span className="block text-[13px] leading-snug text-ink-muted">{proximo.ajuda}</span>
            </span>
            <span aria-hidden="true" className="text-lg text-ink-faint">
              ›
            </span>
          </Link>
        </Grupo>
      )}

      {vitrine?.ativa && paraDivulgar.length > 0 && (
        <Grupo titulo="Divulgar um produto" rodape="O link do produto mostra a foto e o preço dele no Zap.">
          <DivulgarProduto produtos={paraDivulgar} linkDaLoja={linkDaLoja} />
        </Grupo>
      )}

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
            href="/vitrine/pedidos"
            icone={<IconReceipt className={tile} />}
            tom="bg-info text-white"
            rotulo="Pedidos"
            detalhe={(pedidosNovos ?? 0) === 0 ? "Nenhum novo" : `${pedidosNovos} ${pedidosNovos === 1 ? "novo" : "novos"}`}
          />
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
