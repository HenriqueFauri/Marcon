import { Grupo } from "@/components/ajustes";
import { ErrorMessage } from "@/components/ui";
import { rotuloDeComoConheceu, type MarcasDoLink } from "@/lib/origem";

export interface LinhaDeOrigem extends MarcasDoLink {
  owner_id: string;
  como_conheceu: string | null;
}

interface ContaComOrigem {
  origem: LinhaDeOrigem | undefined;
  vendeu: boolean;
  pagante: boolean;
}

// o link marcado vale mais que o código de indicação: "instagram · bio"
function rotuloDoLink(o: LinhaDeOrigem | undefined) {
  const marcas = [o?.utm_source, o?.utm_medium, o?.utm_campaign].filter(Boolean).join(" · ");
  return marcas || (o?.ref ? "Link de indicação" : null);
}

function agrupar(contas: ContaComOrigem[], chave: (c: ContaComOrigem) => string | null) {
  const grupos = new Map<string, { total: number; venderam: number; pagantes: number }>();
  for (const c of contas) {
    const nome = chave(c);
    if (!nome) continue;
    const g = grupos.get(nome) ?? { total: 0, venderam: 0, pagantes: 0 };
    g.total += 1;
    if (c.vendeu) g.venderam += 1;
    if (c.pagante) g.pagantes += 1;
    grupos.set(nome, g);
  }
  return [...grupos].sort((a, b) => b[1].total - a[1].total);
}

// cadastros por origem (migration 0072): pelo link marcado e pela resposta nas boas-vindas
export function OrigemDosCadastros({ contas, falhou, semFunil }: { contas: ContaComOrigem[]; falhou: boolean; semFunil: boolean }) {
  if (falhou) {
    return (
      <div className="mb-6">
        <ErrorMessage>Não consegui ler a origem dos cadastros. Rode a migration 0072_origem_do_cadastro.sql.</ErrorMessage>
      </div>
    );
  }
  const grupos = [
    { titulo: "Cadastros por link", rodape: undefined, linhas: agrupar(contas, (c) => rotuloDoLink(c.origem)) },
    {
      titulo: "Como conheceram",
      // quem entra pelo Google vai direto ao Início e não vê a pergunta
      rodape: "Resposta opcional das boas-vindas. Cadastro pelo Google não vê a pergunta.",
      linhas: agrupar(contas, (c) => (c.origem?.como_conheceu ? rotuloDeComoConheceu(c.origem.como_conheceu) : null)),
    },
  ].filter((g) => g.linhas.length > 0);
  if (grupos.length === 0) return null;

  return (
    <div className="mb-6 grid items-start gap-7 lg:grid-cols-2">
      {grupos.map((g) => (
        <Grupo key={g.titulo} titulo={g.titulo} rodape={g.rodape} semPadding>
          <ul className="divide-y divide-line">
            {g.linhas.map(([nome, n]) => (
              <li key={nome} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-ink">{nome}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {[semFunil ? null : `${n.venderam} com venda`, `${n.pagantes} ${n.pagantes === 1 ? "pagante" : "pagantes"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[17px] tabular-nums text-ink">
                  {n.total} {n.total === 1 ? "conta" : "contas"}
                </span>
              </li>
            ))}
          </ul>
        </Grupo>
      ))}
    </div>
  );
}
