import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Cliente } from "@/types/domain";
import { formatBRL, linkWhatsApp } from "@/lib/format";
import { ContatoModal } from "@/components/contato-modal";
import { ConfirmButton } from "@/components/confirm-button";
import { SearchInput } from "@/components/search-input";
import {
  EmptyState,
  ErrorMessage,
  PageHeader,
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
  let query = supabase.from("clientes").select("*").order("nome");
  if (q) {
    const termo = `%${q.replace(/[%_,()]/g, " ")}%`;
    query = query.or(`nome.ilike.${termo},telefone.ilike.${termo},email.ilike.${termo},cpf_cnpj.ilike.${termo}`);
  }

  const [{ data, error }, { data: abertasData }] = await Promise.all([
    query,
    supabase.from("parcelas_com_status").select("valor, status_efetivo, vendas(cliente_id)").neq("status", "pago"),
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

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={novo}
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
              const whatsapp = linkWhatsApp(c.telefone);
              return (
                <tr key={c.id} className="hover:bg-fill/50">
                  <td className={tdClass}>
                    <p className="text-[17px] text-ink sm:text-[15px] sm:font-medium">{c.nome}</p>
                    <p className="text-[13px] text-ink-muted sm:hidden">
                      {[c.telefone, saldo ? `${formatBRL(saldo.valor)} em aberto` : null].filter(Boolean).join(" · ") || "Sem telefone"}
                    </p>
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
