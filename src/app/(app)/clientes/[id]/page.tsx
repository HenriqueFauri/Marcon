import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { lerTudo } from "@/lib/ler-tudo";
import type { Cliente, VendaStatus, VendaTipoPagamento } from "@/types/domain";
import { formatBRL, formatData, hojeISO, linkWhatsApp, somenteDigitos } from "@/lib/format";
import { ContatoModal } from "@/components/contato-modal";
import { Grupo, LinhaInfo } from "@/components/ajustes";
import { SetaLink, linkPendente } from "@/components/seta-link";
import {
  EmptyState,
  ErrorMessage,
  PageHeader,
  StatCard,
  Table,
  btnPrimary,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";
import { atualizarCliente } from "../actions";
import { linkCobrarTudo } from "./cobranca";
import { ExcluirCliente } from "./excluir-cliente";

export const metadata: Metadata = { title: "Cliente" };

interface Compra {
  id: string;
  data: string;
  valor_total: number;
  status: VendaStatus;
  tipo_pagamento: VendaTipoPagamento;
  forma_pagamento: string | null;
  canal: string | null;
}

interface ParcelaAberta {
  id: string;
  venda_id: string;
  numero_parcela: number;
  valor: number;
  vencimento: string;
  status_efetivo: string;
  vendas: { data: string; cliente_id: string | null } | null;
}

const vendasTexto = (n: number) => `${n} ${n === 1 ? "venda" : "vendas"}`;
const parcelasTexto = (n: number) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;

function IconTelefone(p: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// atalho no estilo Contatos do iPhone: ícone em cima do nome; sem telefone, fica apagado
function Atalho({ href, externo, icone, rotulo }: { href: string | null; externo?: boolean; icone: ReactNode; rotulo: string }) {
  const classe = "hairline flex flex-col items-center gap-1 rounded-2xl bg-surface px-2 py-2.5 text-[13px] font-medium";
  if (!href) {
    return (
      <span aria-disabled="true" className={`${classe} text-ink-faint`}>
        {icone}
        {rotulo}
      </span>
    );
  }
  return (
    <a
      href={href}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${classe} text-brand-text transition hover:bg-fill/60 active:scale-[0.98]`}
    >
      {icone}
      {rotulo}
    </a>
  );
}

export default async function ClienteFichaPage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: clienteData }, comprasRes, abertasRes, { data: { user } }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
    // as vendas e as parcelas vêm página a página: o PostgREST corta cada consulta em 1000 linhas
    lerTudo<Compra>((de, ate) =>
      supabase
        .from("vendas")
        .select("id, data, valor_total, status, tipo_pagamento, forma_pagamento, canal")
        .eq("cliente_id", id)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(de, ate),
    ).then(
      (linhas) => ({ linhas, erro: null as string | null }),
      (e: unknown) => ({ linhas: [] as Compra[], erro: e instanceof Error ? e.message : String(e) }),
    ),
    lerTudo<ParcelaAberta>((de, ate) =>
      supabase
        .from("parcelas_com_status")
        .select("id, venda_id, numero_parcela, valor, vencimento, status_efetivo, vendas!inner(data, cliente_id)")
        .eq("vendas.cliente_id", id)
        .neq("status", "pago")
        .order("vencimento")
        .order("created_at")
        .order("id")
        .range(de, ate) as unknown as PromiseLike<{ data: ParcelaAberta[] | null; error: unknown }>,
    ).then(
      (linhas) => ({ linhas, erro: null as string | null }),
      (e: unknown) => ({ linhas: [] as ParcelaAberta[], erro: e instanceof Error ? e.message : String(e) }),
    ),
    supabase.auth.getUser(),
  ]);

  if (!clienteData) notFound();
  const cliente = clienteData as Cliente;
  const chavePix = ((user?.user_metadata?.empresa_pix as string | undefined) ?? "").trim();
  const hoje = hojeISO();

  const compras = comprasRes.linhas.map((v) => ({ ...v, valor_total: Number(v.valor_total) }));
  const concluidas = compras.filter((v) => v.status === "concluida");
  const totalComprado = concluidas.reduce((s, v) => s + v.valor_total, 0);
  // as compras vêm da mais recente para a mais antiga
  const ultima = concluidas[0]?.data ?? null;

  const abertas = abertasRes.linhas.map((p) => ({ ...p, valor: Number(p.valor) }));
  const deve = abertas.reduce((s, p) => s + p.valor, 0);
  const atrasadas = abertas.filter((p) => p.status_efetivo === "atrasado");
  const deveAtrasado = atrasadas.reduce((s, p) => s + p.valor, 0);

  const whatsapp = linkWhatsApp(cliente.telefone);
  const digitos = somenteDigitos(cliente.telefone);
  const ligar = digitos.length >= 8 ? `tel:${digitos}` : null;
  const cobrar = linkCobrarTudo({ telefone: cliente.telefone, nome: cliente.nome, parcelas: abertas, chavePix, hoje });

  const dados = [
    { rotulo: "Telefone", valor: cliente.telefone },
    { rotulo: "E-mail", valor: cliente.email },
    { rotulo: "CPF ou CNPJ", valor: cliente.cpf_cnpj },
  ].filter((d) => d.valor);

  const pagamento = (v: Compra) =>
    v.status === "cancelada"
      ? "Cancelada"
      : [v.canal, v.tipo_pagamento === "a_prazo" ? "A prazo" : v.forma_pagamento].filter(Boolean).join(" · ") || "À vista";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/clientes", label: "Clientes" }} title={cliente.nome} />

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Atalho href={whatsapp} externo icone={<IconWhatsapp width={22} height={22} />} rotulo="WhatsApp" />
          <Atalho href={ligar} icone={<IconTelefone width={22} height={22} />} rotulo="Ligar" />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Total comprado" value={formatBRL(totalComprado)} hint={vendasTexto(concluidas.length)} />
          <StatCard
            label="Deve hoje"
            value={formatBRL(deve)}
            tone={deveAtrasado > 0 ? "negative" : deve > 0 ? "warning" : "neutral"}
            hint={deveAtrasado > 0 ? `${formatBRL(deveAtrasado)} atrasado` : deve > 0 ? parcelasTexto(abertas.length) : "Nada em aberto"}
          />
          <StatCard
            label="Última compra"
            value={ultima ? formatData(ultima) : "Nada"}
            className="col-span-2 lg:col-span-1"
          />
        </div>

        {(dados.length > 0 || cliente.observacoes) && (
          <Grupo titulo="Dados" semPadding>
            {dados.map((d) => (
              <LinhaInfo key={d.rotulo} rotulo={d.rotulo} valor={d.valor} />
            ))}
            {cliente.observacoes && (
              <p className="border-t border-line px-4 py-3 text-[15px] text-ink-2 first:border-t-0">{cliente.observacoes}</p>
            )}
          </Grupo>
        )}

        {abertasRes.erro ? (
          <ErrorMessage>Não foi possível carregar o que está em aberto: {abertasRes.erro}</ErrorMessage>
        ) : (
          abertas.length > 0 && (
            <Grupo
              titulo={`Em aberto · ${parcelasTexto(abertas.length)}`}
              semPadding
              rodape={
                chavePix ? (
                  <>A cobrança já vai com a sua chave PIX. Pra receber, toque na parcela e lance em A receber.</>
                ) : (
                  <>
                    Pra receber, toque na parcela e lance em A receber.{" "}
                    <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
                      Cadastre sua chave PIX
                    </Link>{" "}
                    pra ela ir junto na cobrança.
                  </>
                )
              }
            >
              <ul className="divide-y divide-line">
                {abertas.map((p) => {
                  const atrasada = p.status_efetivo === "atrasado";
                  return (
                    <li key={p.id}>
                      <Link
                        href={atrasada ? "/contas-a-receber?status=atrasadas" : "/contas-a-receber"}
                        className={`flex items-center gap-3 px-4 py-3 transition hover:bg-fill/60 active:bg-fill ${linkPendente}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] text-ink">
                            {p.vendas?.data ? `Venda de ${formatData(p.vendas.data)}` : "Venda"}
                          </span>
                          <span className={`block truncate text-[13px] ${atrasada ? "text-danger" : "text-ink-muted"}`}>
                            Parcela {p.numero_parcela} · {atrasada ? `Atrasada, venceu ${formatData(p.vencimento)}` : `vence ${formatData(p.vencimento)}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-[17px] tabular-nums text-ink">{formatBRL(p.valor)}</span>
                        <SetaLink />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line p-4">
                {cobrar ? (
                  <a href={cobrar} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full sm:w-auto`}>
                    <IconWhatsapp width={18} height={18} /> Cobrar tudo no WhatsApp
                  </a>
                ) : (
                  <p className="text-[13px] text-ink-muted">Cadastre o telefone do cliente pra cobrar pelo WhatsApp.</p>
                )}
              </div>
            </Grupo>
          )
        )}

        {comprasRes.erro ? (
          <ErrorMessage>Não foi possível carregar as compras: {comprasRes.erro}</ErrorMessage>
        ) : compras.length === 0 ? (
          <EmptyState
            title="Nenhuma compra ainda"
            description="As vendas feitas pra esse cliente aparecem aqui."
            action={
              <Link href="/vendas/novo" className={`${btnPrimary} w-full sm:w-auto`}>
                Nova venda
              </Link>
            }
          />
        ) : (
          <section>
            <h2 className="mb-1.5 px-4 text-[13px] uppercase text-ink-muted">Compras · {vendasTexto(compras.length)}</h2>
            <ul className="hairline divide-y divide-line overflow-hidden rounded-3xl bg-surface sm:hidden">
              {compras.map((v) => {
                const cancelada = v.status === "cancelada";
                return (
                  <li key={v.id}>
                    <Link
                      href={`/vendas/${v.id}`}
                      className={`flex items-center gap-3 px-4 py-3 transition active:bg-fill ${linkPendente} ${cancelada ? "opacity-50" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] text-ink">{formatData(v.data)}</span>
                        <span className="block truncate text-[13px] text-ink-muted">{pagamento(v)}</span>
                      </span>
                      <span className={`shrink-0 text-[17px] tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>
                        {formatBRL(v.valor_total)}
                      </span>
                      <SetaLink />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block">
              <Table compacta>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>Data</th>
                    <th className={thClass}>Pagamento</th>
                    <th className={`${thClass} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {compras.map((v) => {
                    const cancelada = v.status === "cancelada";
                    return (
                      <tr key={v.id} className={`hover:bg-fill/50 ${cancelada ? "opacity-50" : ""}`}>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <Link href={`/vendas/${v.id}`} className="text-ink hover:underline">
                            {formatData(v.data)}
                          </Link>
                        </td>
                        <td className={`${tdClass} text-ink-muted`}>{pagamento(v)}</td>
                        <td className={`${tdClass} text-right tabular-nums text-ink ${cancelada ? "line-through" : ""}`}>
                          {formatBRL(v.valor_total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </section>
        )}

        <div className="hairline overflow-hidden rounded-3xl bg-surface">
          <ContatoModal
            titulo="Editar cliente"
            trigger="Editar cliente"
            triggerClassName="w-full px-4 py-3 text-left text-[17px] text-brand-text transition hover:bg-fill/60 active:bg-fill"
            valores={cliente}
            comDocumento
            onSave={atualizarCliente.bind(null, cliente.id)}
            successMessage="Cliente atualizado."
          />
        </div>

        <div className="hairline overflow-hidden rounded-3xl bg-surface">
          <ExcluirCliente id={cliente.id} nome={cliente.nome} />
        </div>
      </div>
    </div>
  );
}
