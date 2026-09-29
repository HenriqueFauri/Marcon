import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ParcelaComVenda, ProdutoComEstoque, Venda } from "@/types/domain";
import { formatBRL, formatDataCurta, hojeISO, intervaloDoMes, mesAtual, deslocarMes, nomeDoMes } from "@/lib/format";
import { situacaoEstoque } from "@/lib/estoque";
import { Badge, Card, EmptyState, StatCard, btnPrimary, btnSecondary } from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Início" };

function variacao(atual: number, anterior: number) {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const mes = mesAtual();
  const hoje = hojeISO();
  const { inicio } = intervaloDoMes(mes);
  const inicioAnterior = intervaloDoMes(deslocarMes(mes, -1)).inicio;

  const [
    {
      data: { user },
    },
    { data: produtosData },
    { data: vendasData },
    { data: parcelasData },
    { data: caixaMesData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("produtos_com_estoque").select("*").neq("status", "inativo"),
    supabase
      .from("vendas")
      .select("*")
      .gte("data", inicioAnterior)
      .neq("status", "cancelada")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("parcelas_com_status")
      .select("*, vendas(cliente_nome, cliente_id)")
      .neq("status", "pago")
      .order("vencimento"),
    supabase.from("lancamentos_caixa").select("tipo, valor").gte("data", inicio),
  ]);

  const produtos = (produtosData ?? []) as ProdutoComEstoque[];
  const vendas = (vendasData ?? []) as Venda[];
  const parcelas = (parcelasData ?? []) as ParcelaComVenda[];

  const vendasMes = vendas.filter((v) => v.data >= inicio);
  // compara com o mesmo pedaço do mês passado (dia 1 até o dia de hoje)
  const vendasAnterior = vendas.filter((v) => v.data < inicio && v.data.slice(8) <= hoje.slice(8));
  const faturamento = vendasMes.reduce((s, v) => s + Number(v.valor_total), 0);
  const faturamentoAnterior = vendasAnterior.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucro = vendasMes.reduce((s, v) => s + Number(v.valor_total) - Number(v.custo_total), 0);
  const vendasHoje = vendasMes.filter((v) => v.data === hoje);
  const totalHoje = vendasHoje.reduce((s, v) => s + Number(v.valor_total), 0);

  const caixaMes = (caixaMesData ?? []).reduce(
    (s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
    0,
  );

  const totalAReceber = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const atrasadas = parcelas.filter((p) => p.status_efetivo === "atrasado");
  const valorAtrasado = atrasadas.reduce((s, p) => s + Number(p.valor), 0);
  const proximas = parcelas.slice(0, 5);

  const valorEstoque = produtos.reduce(
    (s, p) => s + Number(p.valor_estoque ?? Math.max(p.estoque_total, 0) * Number(p.custo_min)),
    0,
  );
  const alertasEstoque = produtos
    .filter((p) => situacaoEstoque(p) !== "ok")
    .sort((a, b) => a.estoque_total - b.estoque_total);

  const delta = variacao(faturamento, faturamentoAnterior);
  const primeiroNome = (
    (user?.user_metadata?.nome as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    ""
  ).split(" ")[0];

  const semNada = produtos.length === 0 && vendas.length === 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">{primeiroNome ? `Olá, ${primeiroNome}` : "Início"}</h1>
          <p className="text-sm text-ink-muted">{nomeDoMes(mes)}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/produtos/novo" className={`${btnSecondary} hidden sm:inline-flex`}>
            Novo produto
          </Link>
          <Link href="/vendas/novo" className={btnPrimary}>
            <IconPlus width={16} height={16} /> Nova venda
          </Link>
        </div>
      </div>

      {semNada ? (
        <EmptyState
          title="Vamos começar?"
          description="Cadastre seus produtos com custo e preço. Depois é só registrar as vendas — estoque, lucro e caixa se atualizam sozinhos."
          action={
            <Link href="/produtos/novo" className={btnPrimary}>
              Cadastrar primeiro produto
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Vendido no mês"
              value={formatBRL(faturamento)}
              hint={
                delta === null
                  ? `${vendasMes.length} venda(s)`
                  : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs. mês passado`
              }
              href="/vendas"
            />
            <StatCard
              label="Lucro bruto no mês"
              value={formatBRL(lucro)}
              tone={lucro >= 0 ? "positive" : "negative"}
              hint={faturamento > 0 ? `${((lucro / faturamento) * 100).toFixed(1)}% de margem` : undefined}
            />
            <StatCard label="Vendas de hoje" value={formatBRL(totalHoje)} hint={`${vendasHoje.length} venda(s)`} />
            <StatCard
              label="Caixa no mês"
              value={formatBRL(caixaMes)}
              tone={caixaMes >= 0 ? "positive" : "negative"}
              hint="entradas − saídas"
              href="/fluxo-de-caixa"
            />
            <StatCard
              label="A receber"
              value={formatBRL(totalAReceber)}
              tone="warning"
              hint={`${parcelas.length} parcela(s)`}
              href="/contas-a-receber"
            />
            <StatCard
              label="Atrasado"
              value={atrasadas.length ? formatBRL(valorAtrasado) : "Nada"}
              tone={atrasadas.length ? "negative" : "positive"}
              hint={atrasadas.length ? `${atrasadas.length} parcela(s)` : "tudo em dia"}
              href={atrasadas.length ? "/contas-a-receber?status=atrasadas" : undefined}
            />
            <StatCard label="Valor em estoque" value={formatBRL(valorEstoque)} hint="pelo custo" href="/produtos" />
            <StatCard
              label="Alertas de estoque"
              value={alertasEstoque.length}
              tone={alertasEstoque.length ? "warning" : "positive"}
              hint={alertasEstoque.length ? "baixo ou zerado" : "tudo abastecido"}
              href={alertasEstoque.length ? "/produtos?filtro=baixo" : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              title="Últimas vendas"
              action={
                <Link href="/vendas" className="text-xs text-brand-text hover:underline">
                  Ver todas
                </Link>
              }
            >
              {vendasMes.length === 0 ? (
                <p className="text-sm text-ink-muted">Nenhuma venda neste mês ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {vendasMes.slice(0, 5).map((v) => (
                    <li key={v.id}>
                      <Link href={`/vendas/${v.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{v.cliente_nome ?? "Venda avulsa"}</span>
                          <span className="text-xs text-ink-muted">{formatDataCurta(v.data)}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink">{formatBRL(v.valor_total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Próximos recebimentos"
              action={
                <Link href="/contas-a-receber" className="text-xs text-brand-text hover:underline">
                  Ver tudo
                </Link>
              }
            >
              {proximas.length === 0 ? (
                <p className="text-sm text-ink-muted">Nenhuma parcela em aberto.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {proximas.map((p) => (
                    <li key={p.id}>
                      <Link href={`/vendas/${p.venda_id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{p.vendas?.cliente_nome ?? "Sem nome"}</span>
                          <span className={`text-xs ${p.status_efetivo === "atrasado" ? "text-danger" : "text-ink-muted"}`}>
                            {p.status_efetivo === "atrasado" ? "venceu " : "vence "}
                            {formatDataCurta(p.vencimento)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink">{formatBRL(p.valor)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Repor estoque"
              action={
                <Link href="/produtos?filtro=baixo" className="text-xs text-brand-text hover:underline">
                  Ver produtos
                </Link>
              }
            >
              {alertasEstoque.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nenhum produto acabando. Defina o &quot;avisar quando tiver até&quot; no cadastro de cada produto.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {alertasEstoque.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link href={`/produtos/${p.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="truncate text-ink">{p.nome}</span>
                        <Badge tone={p.estoque_total <= 0 ? "negative" : "warning"}>
                          {p.estoque_total <= 0 ? "zerado" : `${p.estoque_total} ${p.unidade_medida}`}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
