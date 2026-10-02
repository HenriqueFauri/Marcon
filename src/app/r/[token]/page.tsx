import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL, formatData } from "@/lib/format";
import { Badge } from "@/components/ui";

// Recibo público de uma venda: o lojista manda o link ao cliente, que abre sem login.
// Os dados vêm da função recibo_publico (migration 0017), que devolve só o que o
// cliente deve ver. Sem custo, lucro nem observações internas.

export const metadata: Metadata = {
  title: "Recibo",
  robots: { index: false, follow: false },
};

interface Recibo {
  empresa: {
    nome: string | null;
    telefone: string | null;
    email: string | null;
    endereco: string | null;
    documento: string | null;
    logo_path: string | null;
  };
  venda: {
    data: string;
    cliente_nome: string | null;
    tipo_pagamento: "a_vista" | "a_prazo";
    forma_pagamento: string | null;
    valor_total: number;
    desconto: number;
    status: "concluida" | "cancelada";
  };
  itens: { nome: string; quantidade: number; preco_unitario: number }[];
  parcelas: {
    numero: number;
    vencimento: string;
    valor: number;
    status: "pendente" | "pago" | "atrasado";
    data_pagamento: string | null;
  }[];
}

const STATUS_PARCELA = {
  pendente: { label: "A vencer", tone: "warning" },
  pago: { label: "Paga", tone: "positive" },
  atrasado: { label: "Atrasada", tone: "negative" },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReciboPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("recibo_publico", { p_token: token });
  if (!data) notFound();
  const recibo = data as Recibo;
  const { empresa, venda, itens, parcelas } = recibo;

  // o bucket do logo é privado; a chave de serviço assina um link curto só para esta página
  let logoUrl: string | null = null;
  if (empresa.logo_path) {
    const admin = createAdminClient();
    const { data: assinada } = admin
      ? await admin.storage.from("logo-empresa").createSignedUrl(empresa.logo_path, 3600)
      : { data: null };
    logoUrl = assinada?.signedUrl ?? null;
  }

  const cancelada = venda.status === "cancelada";
  const subtotal = itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const pago = parcelas.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const emAberto = Number(venda.valor_total) - pago;
  const contato = [empresa.telefone, empresa.email].filter(Boolean).join(" · ");

  return (
    // o Clarity grava a tela: mascara nomes e valores do cliente de quem vendeu
    <main data-clarity-mask="true" className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
      <article className="hairline rounded-3xl bg-surface p-5 sm:p-7">
        <header className="flex items-start gap-3 border-b border-line pb-5">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-ink">{empresa.nome || "Recibo de venda"}</h1>
            {empresa.documento && <p className="text-xs text-ink-muted">{empresa.documento}</p>}
            {contato && <p className="text-xs text-ink-muted">{contato}</p>}
            {empresa.endereco && <p className="text-xs text-ink-muted">{empresa.endereco}</p>}
          </div>
        </header>

        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-5">
          <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink-2">Recibo</h2>
          <p className="text-sm text-ink-muted">{formatData(venda.data)}</p>
        </div>
        {venda.cliente_nome && <p className="mt-1 text-sm text-ink-2">Cliente: {venda.cliente_nome}</p>}

        {cancelada && (
          <p className="mt-4 rounded-2xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            Esta venda foi cancelada.
          </p>
        )}

        <ul className="mt-5 divide-y divide-line">
          {itens.map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="text-ink">{item.nome}</p>
                <p className="text-xs text-ink-muted">
                  {item.quantidade} × {formatBRL(item.preco_unitario)}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-ink">{formatBRL(item.quantidade * Number(item.preco_unitario))}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-2 space-y-1 border-t border-line pt-3 text-sm">
          {Number(venda.desconto) > 0 && (
            <>
              <div className="flex justify-between text-ink-muted">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {formatBRL(venda.desconto)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between text-base font-semibold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(venda.valor_total)}</dd>
          </div>
          <div className="flex justify-between text-ink-muted">
            <dt>Pagamento</dt>
            <dd>
              {[venda.tipo_pagamento === "a_prazo" ? "A prazo" : "À vista", venda.forma_pagamento].filter(Boolean).join(" · ")}
            </dd>
          </div>
        </dl>

        {parcelas.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Parcelas</h2>
              {!cancelada && (
                <p className="text-xs text-ink-muted">
                  {emAberto > 0 ? `${formatBRL(emAberto)} em aberto` : "Tudo pago"}
                </p>
              )}
            </div>
            <ul className="divide-y divide-line rounded-2xl bg-fill/60 px-4">
              {parcelas.map((p) => {
                const status = STATUS_PARCELA[p.status];
                return (
                  <li key={p.numero} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="text-ink">
                        {p.numero}/{parcelas.length} · {formatBRL(p.valor)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {p.data_pagamento ? `paga em ${formatData(p.data_pagamento)}` : `vence em ${formatData(p.vencimento)}`}
                      </p>
                    </div>
                    {!cancelada && <Badge tone={status.tone}>{status.label}</Badge>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">Este recibo se atualiza sozinho quando uma parcela é paga.</p>
          </section>
        )}
      </article>

      <p className="mt-6 text-center text-xs text-ink-muted">
        Recibo feito com o{" "}
        <Link href="/" className="font-medium text-brand-text hover:underline">
          Marcon
        </Link>
        , gestão de vendas para quem vende pelo celular.
      </p>
    </main>
  );
}
