import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import { buscarVitrine } from "@/lib/vitrine-servidor";
import {
  SLUG_REGEX,
  coresDaLoja,
  fundoEscuro,
  linkDoWhatsapp,
  rotuloDoAndamento,
  rotuloDoFrete,
  tokensDaLoja,
  type AndamentoDoPedido,
} from "@/lib/vitrine";
import { AtualizaSozinho } from "./atualiza-sozinho";

// Acompanhar o pedido (migration 0052): o cliente chega pelo link "Seu pedido" da loja. O token é um uuid
// sem como adivinhar; a função pedido_publico_vitrine só devolve andamento, itens e total (sem endereço).

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PedidoPublico {
  codigo: string;
  status: "novo" | "vendido" | "descartado";
  andamento: AndamentoDoPedido;
  andamento_em: string | null;
  entrega: "entrega" | "retirada";
  total: number;
  frete: number | null;
  regiao_frete: string | null;
  primeiro_nome: string | null;
  created_at: string;
  whatsapp: string;
  itens: { nome: string; variacao: string | null; quantidade: number }[];
}

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export default async function PedidoDoClientePage({ params }: PageProps<"/loja/[slug]/pedido/[token]">) {
  const { slug, token } = await params;
  const s = slug.toLowerCase();
  if (!SLUG_REGEX.test(s) || !UUID.test(token)) notFound();

  const supabase = await createClient();
  const [{ data }, vitrine] = await Promise.all([supabase.rpc("pedido_publico_vitrine", { p_slug: s, p_token: token }), buscarVitrine(s)]);
  const p = data as PedidoPublico | null;
  if (!p || !vitrine) notFound();

  const cores = coresDaLoja(vitrine.loja);
  const estilo = { ...tokensDaLoja(cores), colorScheme: fundoEscuro(cores.fundo) ? "dark" : "light" } as CSSProperties;
  const nomeLoja = vitrine.loja.nome ?? "Loja";
  const cancelado = p.status === "descartado";
  const concluido = p.status === "vendido";

  // etapas do cliente: recebido, separado, saiu/pronto; "concluído" vem quando o vendedor registra a venda
  const etapas: { chave: AndamentoDoPedido; rotulo: string }[] = (["recebido", "separado", "saiu"] as const).map((a) => ({
    chave: a,
    rotulo: rotuloDoAndamento(a, p.entrega),
  }));
  const atual = concluido ? etapas.length : etapas.findIndex((e) => e.chave === p.andamento);

  return (
    <div style={estilo} className="min-h-dvh bg-canvas text-ink">
      <AtualizaSozinho ativo={!cancelado && !concluido} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="truncate text-lg font-semibold tracking-tight">{nomeLoja}</h1>
          <a href={`/loja/${s}`} className="shrink-0 text-[13px] font-medium text-ink-2 hover:underline">
            Voltar à loja
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
        <div>
          <p className="text-[13px] text-ink-muted">Pedido #{p.codigo}</p>
          <h2 className="text-[26px] font-bold leading-tight tracking-tight">
            {cancelado
              ? "Pedido cancelado"
              : concluido
                ? p.entrega === "entrega"
                  ? "Pedido entregue"
                  : "Pedido concluído"
                : rotuloDoAndamento(p.andamento, p.entrega)}
          </h2>
          <p className="mt-1 text-[15px] text-ink-muted">
            {p.primeiro_nome ? `${p.primeiro_nome}, feito` : "Feito"} em {quando(p.created_at)}.
            {cancelado && " Se foi engano, chame a loja no WhatsApp."}
          </p>
        </div>

        {!cancelado && (
          <ol className="rounded-2xl border border-line bg-surface px-4 py-2" aria-label="Andamento do pedido">
            {etapas.map((e, i) => {
              const feito = i < atual || concluido;
              const agora = i === atual && !concluido;
              return (
                <li key={e.chave} className="flex items-center gap-3 py-3 text-[15px]">
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      feito || agora ? "bg-[var(--loja)] text-[var(--loja-texto)]" : "bg-fill text-ink-muted"
                    }`}
                  >
                    {feito ? "✓" : i + 1}
                  </span>
                  <span className={feito || agora ? "font-medium text-ink" : "text-ink-muted"}>{e.rotulo}</span>
                  {agora && p.andamento_em && <span className="ml-auto text-[13px] text-ink-muted">{quando(p.andamento_em)}</span>}
                </li>
              );
            })}
          </ol>
        )}

        <section className="rounded-2xl border border-line bg-surface px-4 py-3" aria-label="Itens do pedido">
          <ul className="divide-y divide-line">
            {p.itens.map((i, n) => (
              <li key={n} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                <span className="min-w-0">
                  {i.nome}
                  {i.variacao && <span className="text-ink-muted"> · {i.variacao}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-ink-muted">{i.quantidade}x</span>
              </li>
            ))}
          </ul>
          {p.entrega === "entrega" && (
            <p className="flex justify-between border-t border-line pt-2.5 text-[15px] text-ink-muted">
              <span>Frete{p.regiao_frete ? ` (${p.regiao_frete})` : ""}</span>
              <span className="tabular-nums">{rotuloDoFrete(p.frete)}</span>
            </p>
          )}
          <p className="flex justify-between pt-2 text-[17px] font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(p.total)}</span>
          </p>
        </section>

        <a
          href={linkDoWhatsapp(p.whatsapp, `Olá! Sobre o meu pedido #${p.codigo}:`)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-[var(--loja-botao)] px-5 py-3 text-[15px] font-semibold text-[var(--loja-botao-texto)] shadow-sm transition hover:brightness-105 active:scale-[0.98]"
        >
          Falar com a loja
        </a>
      </main>
    </div>
  );
}
