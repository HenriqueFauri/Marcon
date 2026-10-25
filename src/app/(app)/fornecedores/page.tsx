import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/types/domain";
import { linkWhatsApp } from "@/lib/format";
import { ContatoModal } from "@/components/contato-modal";
import { SearchInput } from "@/components/search-input";
import { Grupo, LinhaLink } from "@/components/ajustes";
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
import { IconBox, IconCart, IconPencil, IconPlus, IconWhatsapp } from "@/components/icons";
import { atualizarFornecedor, criarFornecedor, excluirFornecedor } from "./actions";
import { EditarFornecedor } from "./editar-fornecedor";

export const metadata: Metadata = { title: "Fornecedores" };

function Atalhos() {
  return (
    <Grupo semPadding>
      <LinhaLink
        href="/fornecedores/reposicao"
        icone={<IconBox width={18} height={18} />}
        tom="bg-tile-warning text-on-tile-warning"
        rotulo="Repor estoque"
      />
      <LinhaLink
        href="/fornecedores/compras"
        icone={<IconCart width={18} height={18} />}
        tom="bg-brand text-on-brand"
        rotulo="Compras"
      />
    </Grupo>
  );
}

function BotaoWhatsapp({ href, nome }: { href: string; nome: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${btnIcon} shrink-0`}
      aria-label={`Abrir WhatsApp de ${nome}`}
      title="WhatsApp"
    >
      <IconWhatsapp width={18} height={18} />
    </a>
  );
}

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
      <div className="flex flex-col gap-7">
        <PageHeader title="Fornecedores" action={novo} />
        <ErrorMessage>Não foi possível carregar os fornecedores: {error.message}</ErrorMessage>
      </div>
    );
  }

  const fornecedores = (data ?? []) as Fornecedor[];
  const total = fornecedores.length;

  return (
    <div>
      <PageHeader title="Fornecedores" action={novo} />

      <div className="flex flex-col gap-7">
        <Atalhos />

        <div className="flex flex-col gap-3">
          <SearchInput placeholder="Buscar fornecedor..." />

          {total === 0 ? (
            q ? (
              <EmptyState title="Nenhum fornecedor encontrado" description={`Nada com “${q}”.`} />
            ) : (
              <EmptyState
                title="Nenhum fornecedor ainda"
                description="Cadastre de quem você compra pra registrar cada compra de estoque."
                action={novo}
              />
            )
          ) : (
            <>
              {/* celular: lista agrupada; toque na linha abre a edição */}
              <Grupo
                titulo={total === 1 ? "1 fornecedor" : `${total} fornecedores`}
                semPadding
                className="sm:hidden"
              >
                {fornecedores.map((f) => {
                  const whatsapp = linkWhatsApp(f.telefone);
                  const detalhe = [f.telefone, f.email].filter(Boolean).join(" · ") || f.observacoes;
                  return (
                    <div key={f.id} className="flex items-center gap-2 border-t border-line pr-2 first:border-t-0">
                      <EditarFornecedor
                        nome={f.nome}
                        valores={f}
                        onSave={atualizarFornecedor.bind(null, f.id)}
                        onExcluir={excluirFornecedor.bind(null, f.id)}
                        triggerClassName="flex min-w-0 flex-1 flex-col items-start px-4 py-3 text-left active:bg-fill"
                        trigger={
                          <>
                            <span className="w-full truncate text-[17px] text-ink">{f.nome}</span>
                            {detalhe && <span className="w-full truncate text-[13px] text-ink-muted">{detalhe}</span>}
                          </>
                        }
                      />
                      {whatsapp && <BotaoWhatsapp href={whatsapp} nome={f.nome} />}
                    </div>
                  );
                })}
              </Grupo>

              {/* computador: tabela */}
              <div className="hidden sm:block">
                <Table compacta>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>Nome</th>
                      <th className={thClass}>Telefone</th>
                      <th className={thClass}>E-mail</th>
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
                            <p className="text-[15px] font-medium text-ink">{f.nome}</p>
                            {f.observacoes && <p className="max-w-xs truncate text-[13px] text-ink-muted">{f.observacoes}</p>}
                          </td>
                          <td className={`${tdClass} text-ink-2`}>{f.telefone}</td>
                          <td className={`${tdClass} text-ink-2`}>{f.email}</td>
                          <td className={`${tdClass} text-right`}>
                            <div className="flex items-center justify-end gap-1">
                              {whatsapp && <BotaoWhatsapp href={whatsapp} nome={f.nome} />}
                              <EditarFornecedor
                                nome={f.nome}
                                valores={f}
                                onSave={atualizarFornecedor.bind(null, f.id)}
                                onExcluir={excluirFornecedor.bind(null, f.id)}
                                triggerClassName={btnIcon}
                                trigger={<IconPencil width={16} height={16} />}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
