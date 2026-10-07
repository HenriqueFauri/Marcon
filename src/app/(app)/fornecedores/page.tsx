import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { linkWhatsApp } from "@/lib/format";
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
import { atualizarFornecedor, criarFornecedor, excluirFornecedor } from "./actions";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage({ searchParams }: PageProps<"/fornecedores">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  let query = supabase.from("fornecedores").select("*").order("nome");
  if (q) {
    const termo = `%${q.replace(/[%_,()]/g, " ")}%`;
    query = query.or(`nome.ilike.${termo},telefone.ilike.${termo},email.ilike.${termo}`);
  }
  const { data, error } = await query;

  const novo = (
    <ContatoModal
      titulo="Novo fornecedor"
      trigger={
        <>
          <IconPlus width={16} height={16} /> Novo fornecedor
        </>
      }
      triggerClassName={btnPrimary}
      onSave={criarFornecedor}
      successMessage="Fornecedor cadastrado."
    />
  );

  if (error) {
    return (
      <div>
        <PageHeader title="Fornecedores" action={novo} />
        <ErrorMessage>Não foi possível carregar os fornecedores: {error.message}</ErrorMessage>
      </div>
    );
  }

  const fornecedores = (data ?? []) as Fornecedor[];

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        action={novo}
      />

      <div className="mb-4">
        <SearchInput placeholder="Buscar fornecedor..." />
      </div>

      {fornecedores.length === 0 ? (
        q ? (
          <EmptyState title="Nenhum fornecedor encontrado" description={`Nada corresponde a “${q}”.`} />
        ) : (
          <EmptyState
            title="Nenhum fornecedor cadastrado"
            description="Com fornecedores cadastrados, cada compra de estoque fica registrada com quem você comprou."
            action={novo}
          />
        )
      ) : (
        <Table compacta>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Nome</th>
              <th className={thClass}>Telefone</th>
              <th className={`${thClass} hidden sm:table-cell`}>E-mail</th>
              <th className={`${thClass} text-right`}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {fornecedores.map((f) => {
              const whatsapp = linkWhatsApp(f.telefone);
              return (
                <tr key={f.id} className="hover:bg-fill/50">
                  <td className={tdClass}>
                    <p className="font-medium text-ink">{f.nome}</p>
                    {f.observacoes && <p className="max-w-xs truncate text-xs text-ink-muted">{f.observacoes}</p>}
                  </td>
                  <td className={`${tdClass} text-ink-2`}>{f.telefone ?? "—"}</td>
                  <td className={`${tdClass} hidden text-ink-2 sm:table-cell`}>{f.email ?? "—"}</td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={btnIcon}
                          aria-label={`Abrir WhatsApp de ${f.nome}`}
                          title="WhatsApp"
                        >
                          <IconWhatsapp width={16} height={16} />
                        </a>
                      )}
                      <ContatoModal
                        titulo="Editar fornecedor"
                        trigger={<IconPencil width={16} height={16} />}
                        triggerClassName={btnIcon}
                        triggerLabel={`Editar ${f.nome}`}
                        valores={f}
                        onSave={atualizarFornecedor.bind(null, f.id)}
                        successMessage="Fornecedor atualizado."
                      />
                      <ConfirmButton
                        title={`Excluir “${f.nome}”?`}
                        description="As compras já registradas com esse fornecedor continuam no histórico com o nome dele."
                        ariaLabel={`Excluir ${f.nome}`}
                        successMessage="Fornecedor excluído."
                        onConfirm={excluirFornecedor.bind(null, f.id)}
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
