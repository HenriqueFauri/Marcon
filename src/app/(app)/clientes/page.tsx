import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { lerTudo } from "@/lib/ler-tudo";
import type { Cliente } from "@/types/domain";
import { formatBRL, formatDataCurta, linkWhatsApp } from "@/lib/format";
import { vendasConcluidas } from "@/lib/relatorios";
import { ContatoModal } from "@/components/contato-modal";
import { ConfirmButton } from "@/components/confirm-button";
import { SearchInput } from "@/components/search-input";
import {
  EmptyState,
  ErrorMessage,
  PageHeader,
  Segmentos,
  Table,
  btnIcon,
  btnPrimary,
  tbodyClass,
  tdClass,
  thClass,
  theadClass,
} from "@/components/ui";
import { IconPencil, IconPlus, IconWhatsapp } from "@/components/icons";
import { atualizarCliente, criarCliente, excluirCliente } from "./actions";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  const termo = q ? `%${q.replace(/[%_,()]/g, " ")}%` : null;

  // clientes e parcelas em aberto vêm página a página: o PostgREST corta cada consulta em 1000 linhas
  const [{ data, error }, abertasData, vendasFeitas] = await Promise.all([
    lerTudo((de, ate) => {
      let query = supabase.from("clientes").select("*").order("nome").order("id");
      if (termo) query = query.or(`nome.ilike.${termo},telefone.ilike.${termo},email.ilike.${termo},cpf_cnpj.ilike.${termo}`);
      return query.range(de, ate);
    }).then(
      (linhas) => ({ data: linhas, error: null }),
      (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
    ),
    // saldo em aberto por cliente: se falhar, a lista segue sem esse detalhe
    lerTudo((de, ate) =>
      supabase
        .from("parcelas_com_status")
        .select("valor, status_efetivo, vendas(cliente_id)")
        .neq("status", "pago")
        .order("id")
        .range(de, ate),
    ).catch(() => []),
    // total comprado e última compra: se falhar, a lista segue sem esse detalhe
    vendasConcluidas(supabase, "2000-01-01", null).catch(() => []),
  ]);

  const novo = (
    <ContatoModal
      titulo="Novo cliente"
      trigger={
        <>
          <IconPlus width={16} height={16} /> Novo cliente
        </>
      }
      triggerClassName={btnPrimary}
      comDocumento
      onSave={criarCliente}
      successMessage="Cliente cadastrado."
    />
  );

  if (error) {
    return (
      <div>
        <PageHeader title="Clientes" action={novo} />
        <ErrorMessage>Não foi possível carregar os clientes: {error.message}</ErrorMessage>
      </div>
    );
  }

  const clientes = (data ?? []) as Cliente[];

  // saldo em aberto (a prazo/parcelado) por cliente
  const emAberto = new Map<string, { valor: number; atrasado: boolean }>();
  for (const p of (abertasData ?? []) as unknown as {
    valor: number;
    status_efetivo: string;
    vendas: { cliente_id: string | null } | null;
  }[]) {
    const id = p.vendas?.cliente_id;
    if (!id) continue;
    const atual = emAberto.get(id) ?? { valor: 0, atrasado: false };
    atual.valor += Number(p.valor);
    atual.atrasado ||= p.status_efetivo === "atrasado";
    emAberto.set(id, atual);
  }

  // total comprado e última compra por cliente
  const compras = new Map<string, { total: number; ultima: string }>();
  for (const v of vendasFeitas) {
    if (!v.cliente_id) continue;
    const c = compras.get(v.cliente_id) ?? { total: 0, ultima: v.data };
    c.total += v.valor_total;
    if (v.data > c.ultima) c.ultima = v.data;
    compras.set(v.cliente_id, c);
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={novo}
      />

      <Segmentos
        rotulo="Clientes"
        substituir={false}
        className="mb-4 w-full sm:w-80"
        itens={[
          { href: "/clientes", label: "Lista", ativo: true },
          { href: "/clientes/insights", label: "Insights", ativo: false },
        ]}
      />

      <div className="mb-4">
        <SearchInput placeholder="Buscar por nome, telefone, e-mail..." />
      </div>

      {clientes.length === 0 ? (
        q ? (
          <EmptyState title="Nenhum cliente encontrado" description={`Nada corresponde a “${q}”.`} />
        ) : (
          <EmptyState
            title="Nenhum cliente cadastrado"
            description="Cadastre seus clientes para saber quem deve quanto e cobrar pelo WhatsApp com um toque."
            action={novo}
          />
        )
      ) : (
        <Table compacta>
          {/* no celular as linhas viram lista: sem cabeçalho, o valor em aberto vai embaixo do nome */}
          <thead className={`${theadClass} hidden sm:table-header-group`}>
            <tr>
              <th className={thClass}>Nome</th>
              <th className={`${thClass} hidden sm:table-cell`}>Contato</th>
              <th className={`${thClass} hidden text-right sm:table-cell`}>Em aberto</th>
              <th className={`${thClass} text-right`}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {clientes.map((c) => {
              const saldo = emAberto.get(c.id);
              const comprou = compras.get(c.id);
              const whatsapp = linkWhatsApp(c.telefone);
              return (
                <tr key={c.id} className="hover:bg-fill/50">
                  <td className={tdClass}>
                    <p className="text-[17px] text-ink sm:text-[15px] sm:font-medium">{c.nome}</p>
                    <p className="text-[13px] text-ink-muted sm:hidden">
                      {[c.telefone, saldo ? `${formatBRL(saldo.valor)} em aberto` : null].filter(Boolean).join(" · ") || "Sem telefone"}
                    </p>
                    {comprou && (
                      <p className="text-[13px] text-ink-muted">
                        Comprou {formatBRL(comprou.total)} · última em {formatDataCurta(comprou.ultima)}
                      </p>
                    )}
                    {c.observacoes && <p className="max-w-xs truncate text-xs text-ink-muted">{c.observacoes}</p>}
                  </td>
                  <td className={`${tdClass} hidden text-ink-2 sm:table-cell`}>
                    <p>{c.telefone ?? "—"}</p>
                    {c.email && <p className="text-xs text-ink-muted">{c.email}</p>}
                  </td>
                  <td
                    className={`${tdClass} hidden text-right tabular-nums sm:table-cell ${saldo ? (saldo.atrasado ? "text-danger" : "text-warning") : "text-ink-faint"}`}
                  >
                    {saldo ? formatBRL(saldo.valor) : "—"}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={btnIcon}
                          aria-label={`Abrir WhatsApp de ${c.nome}`}
                          title="WhatsApp"
                        >
                          <IconWhatsapp width={16} height={16} />
                        </a>
                      )}
                      <ContatoModal
                        titulo="Editar cliente"
                        trigger={<IconPencil width={16} height={16} />}
                        triggerClassName={btnIcon}
                        triggerLabel={`Editar ${c.nome}`}
                        valores={c}
                        comDocumento
                        onSave={atualizarCliente.bind(null, c.id)}
                        successMessage="Cliente atualizado."
                      />
                      <ConfirmButton
                        title={`Excluir “${c.nome}”?`}
                        description="As vendas já feitas para esse cliente continuam no histórico com o nome registrado."
                        ariaLabel={`Excluir ${c.nome}`}
                        successMessage="Cliente excluído."
                        onConfirm={excluirCliente.bind(null, c.id)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
