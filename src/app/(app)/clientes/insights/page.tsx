import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatData, hojeISO, linkWhatsApp, somarDias } from "@/lib/format";
import { mensagemDeErro } from "@/lib/action";
import { paginar, vendasConcluidas } from "@/lib/relatorios";
import { Grupo } from "@/components/ajustes";
import { IconWhatsapp } from "@/components/icons";
import { EmptyState, ErrorMessage, PageHeader, Segmentos, StatCard, btnIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Clientes: insights" };

const DIAS_SUMIDO = 60;
const TOP = 10;

interface ClienteBasico {
  id: string;
  nome: string;
  telefone: string | null;
}

interface Resumo extends ClienteBasico {
  total: number;
  compras: number;
  ultima: string;
}

export default async function ClientesInsightsPage() {
  const supabase = await createClient();
  let vendas, clientes;
  try {
    [vendas, clientes] = await Promise.all([
      vendasConcluidas(supabase, "2000-01-01", null),
      paginar<ClienteBasico>((de, ate) => supabase.from("clientes").select("id, nome, telefone").order("id").range(de, ate)),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Clientes" />
        <ErrorMessage>Não foi possível carregar os clientes: {mensagemDeErro(e)}</ErrorMessage>
      </div>
    );
  }

  const porId = new Map(clientes.map((c) => [c.id, c]));
  const acumulado = new Map<string, Resumo>();
  for (const v of vendas) {
    if (!v.cliente_id) continue;
    const c = porId.get(v.cliente_id);
    if (!c) continue;
    const r = acumulado.get(c.id) ?? { ...c, total: 0, compras: 0, ultima: v.data };
    r.total += v.valor_total;
    r.compras += 1;
    if (v.data > r.ultima) r.ultima = v.data;
    acumulado.set(c.id, r);
  }
  const compradores = Array.from(acumulado.values());

  const hoje = hojeISO();
  const limite = somarDias(hoje, -DIAS_SUMIDO);
  const sumidos = compradores.filter((c) => c.ultima < limite).sort((a, b) => b.total - a.total);
  const melhores = [...compradores].sort((a, b) => b.total - a.total).slice(0, TOP);
  const diasDesde = (iso: string) => Math.round((new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${iso}T12:00:00Z`).getTime()) / 86400000);

  const chamar = (c: Resumo) => {
    const primeiro = c.nome.trim().split(/\s+/)[0];
    return linkWhatsApp(c.telefone, `Oi ${primeiro}, tudo bem? Faz um tempo que você não passa por aqui e chegou novidade. Quer dar uma olhada?`);
  };

  const linha = (c: Resumo, detalhe: string, valor: string, comZap: boolean) => {
    const zap = comZap ? chamar(c) : null;
    return (
      <li key={c.id} className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] text-ink">{c.nome}</p>
          <p className="truncate text-[13px] text-ink-muted">{detalhe}</p>
        </div>
        <p className="shrink-0 text-[17px] font-semibold tabular-nums text-ink">{valor}</p>
        {zap && (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={btnIcon} aria-label={`Chamar ${c.nome} no WhatsApp`} title="Chamar no WhatsApp">
            <IconWhatsapp width={16} height={16} />
          </a>
        )}
      </li>
    );
  };

  return (
    <div>
      <PageHeader title="Clientes" />
      <Segmentos
        rotulo="Clientes"
        substituir={false}
        className="mb-6 w-full sm:w-80"
        itens={[
          { href: "/clientes", label: "Lista", ativo: false },
          { href: "/clientes/insights", label: "Insights", ativo: true },
        ]}
      />

      {compradores.length === 0 ? (
        <EmptyState title="Ainda sem compras de clientes" description="Quando você registrar vendas com um cliente cadastrado, aqui aparece quem mais compra e quem sumiu." />
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Clientes que compraram" value={String(compradores.length)} />
            <StatCard label={`Sumidos há ${DIAS_SUMIDO} dias`} value={String(sumidos.length)} tone={sumidos.length > 0 ? "warning" : "neutral"} hint="Para chamar de volta" />
          </div>

          <Grupo
            titulo={`Sumiram há ${DIAS_SUMIDO} dias ou mais`}
            semPadding
            rodape="Quem mais comprou aparece primeiro. O botão abre o WhatsApp com uma mensagem pronta, que você pode mudar antes de enviar."
          >
            {sumidos.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-ink-muted">Ninguém sumiu. Todo mundo comprou nos últimos {DIAS_SUMIDO} dias.</p>
            ) : (
              <ul className="divide-y divide-line">
                {sumidos.map((c) =>
                  linha(c, `Última compra em ${formatData(c.ultima)}, há ${diasDesde(c.ultima)} dias · ${c.compras} ${c.compras === 1 ? "compra" : "compras"}`, formatBRL(c.total), true),
                )}
              </ul>
            )}
          </Grupo>

          <Grupo titulo="Quem mais compra" semPadding rodape="Total comprado desde o começo, sem contar vendas canceladas.">
            <ul className="divide-y divide-line">
              {melhores.map((c) =>
                linha(c, `${c.compras} ${c.compras === 1 ? "compra" : "compras"} · última em ${formatData(c.ultima)}`, formatBRL(c.total), false),
              )}
            </ul>
          </Grupo>
        </div>
      )}
    </div>
  );
}
