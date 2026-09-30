"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Card, btnPrimary, inputClass } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";
import { useToast } from "@/components/toaster";
import { formatBRL, formatData } from "@/lib/format";
import { ErroDeLeitura, type Analise, type Conferencia } from "@/lib/importacao/tipos";
import { lerPlanilha, tipoDePlanilha, type Aba } from "@/lib/importacao/planilha/ler";
import type { Leitura } from "@/lib/importacao/planilha/mapear";
import { importarLancamentos, importarProdutos, importarVendas, type ResultadoImportacao } from "./actions";
import { MapeamentoPlanilha } from "./planilha";

type Tipo = Analise["tipo"];
type De<T extends Tipo> = Extract<Analise, { tipo: T }>;
type Carregado = { [T in Tipo]?: { analise: De<T>; chave: number } };

const num = (s: string) => Number(s.replace(",", ".")) || 0;
// valor que o usuário edita: "124,68", com vírgula
const dinheiroTexto = (n: number) => n.toFixed(2).replace(".", ",");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// cada chamada ao banco é uma transação; lotes menores cabem no tempo de uma função da Vercel
const LOTE = 500;

type Soma = { criados: number; ignorados: number; semProduto: number };

// manda em lotes e soma; se um lote falhar, para e diz quanto já entrou (reimportar não duplica)
async function emLotes<T>(itens: T[], enviar: (lote: T[]) => Promise<ResultadoImportacao>): Promise<{ soma: Soma; erro?: string }> {
  const soma: Soma = { criados: 0, ignorados: 0, semProduto: 0 };
  for (let i = 0; i < itens.length; i += LOTE) {
    const r = await enviar(itens.slice(i, i + LOTE));
    if (!r.ok) {
      const antes = soma.criados ? ` Antes do erro entraram ${soma.criados}; importar de novo não duplica.` : "";
      return { soma, erro: r.error + antes };
    }
    soma.criados += r.criados;
    soma.ignorados += r.ignorados;
    soma.semProduto += r.semProduto;
  }
  return { soma };
}

// ---------------------------------------------------------------------------
// peças compartilhadas
// ---------------------------------------------------------------------------

function Conferencias({ itens }: { itens: Conferencia[] }) {
  if (itens.length === 0) return null;
  const todasOk = itens.every((c) => c.ok);
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-[13px] ${
        todasOk ? "border-positive/30 bg-positive-tint text-positive" : "border-warning/40 bg-warning-tint text-warning"
      }`}
    >
      <p className="flex items-center gap-2 font-medium">
        {todasOk ? <IconCheck width={16} height={16} /> : <IconAlert width={16} height={16} />}
        {todasOk
          ? "Conferido: o que li bate com os totais do relatório."
          : "Atenção: algum total não bate com o do relatório. Confira antes de importar."}
      </p>
      <ul className="mt-1.5 flex flex-col gap-0.5 text-ink-2">
        {itens.map((c) => (
          <li key={c.rotulo}>
            {c.ok ? "✓" : "✗"} {c.rotulo}: li {c.lido}; o relatório diz {c.esperado}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Avisos({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-2xl bg-warning-tint px-4 py-3 text-[13px] text-warning">
      {itens.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

function Resumo({ texto }: { texto?: string }) {
  if (!texto) return null;
  return <p className="rounded-2xl bg-fill px-4 py-3 text-[13px] text-ink-2">{texto}</p>;
}

function Secao({
  numero,
  titulo,
  periodo,
  children,
}: {
  numero: number;
  titulo: string;
  periodo: string | null;
  children: ReactNode;
}) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-text">
            {numero}
          </span>
          {titulo}
        </span>
      }
      description={periodo ? `Período: ${periodo}` : undefined}
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function Resultado({ mensagem, href, rotulo }: { mensagem: string; href: string; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-positive-tint px-4 py-3 text-[14px] text-positive">
      <span className="flex items-center gap-2">
        <IconCheck width={18} height={18} />
        {mensagem}
      </span>
      <Link href={href} className="font-medium underline-offset-2 hover:underline">
        {rotulo}
      </Link>
    </div>
  );
}

function Marcar({ marcado, onChange, rotulo, desabilitado }: { marcado: boolean; onChange: (v: boolean) => void; rotulo: string; desabilitado?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      disabled={desabilitado}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={rotulo}
      className="mt-1 h-[18px] w-[18px] shrink-0 accent-[var(--brand)]"
    />
  );
}

function BotaoImportar({
  quantidade,
  enviando,
  onClick,
  rotulo,
  bloqueado,
}: {
  quantidade: number;
  enviando: boolean;
  onClick: () => void;
  rotulo: string;
  bloqueado?: boolean;
}) {
  // plano grátis: a prévia funciona, mas gravar vendas e caixa de outro sistema é do plano pago
  if (bloqueado) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-2xl bg-warning-tint px-4 py-3 text-[13px] text-warning">
          Importar vendas e extrato de caixa de outro sistema faz parte do plano Marcon. No plano grátis dá para importar os produtos.
        </p>
        <div>
          <Link href="/assinatura" className={btnPrimary}>
            Assinar o plano Marcon
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      <button type="button" className={btnPrimary} disabled={enviando || quantidade === 0} onClick={onClick}>
        {enviando ? "Importando..." : quantidade === 0 ? "Selecione ao menos um" : `Importar ${rotulo}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// produtos
// ---------------------------------------------------------------------------

function Campo({ rotulo, valor, onChange, decimal }: { rotulo: string; valor: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-ink-muted">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode={decimal ? "decimal" : undefined}
        className={`${inputClass} !py-1.5 text-[14px]`}
      />
    </label>
  );
}

function SecaoProdutos({ analise, restantes }: { analise: De<"produtos">; restantes: number | null }) {
  const toast = useToast();
  const [linhas, setLinhas] = useState(() =>
    analise.itens.map((p) => ({
      sel: true,
      nome: p.nome,
      categoria: p.categoria ?? "",
      custo: dinheiroTexto(p.custo),
      varejo: dinheiroTexto(p.precoVarejo),
      atacado: p.precoAtacado == null ? "" : dinheiroTexto(p.precoAtacado),
      estoque: String(p.estoque),
      avisos: p.avisos,
    })),
  );
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const escolhidos = linhas.filter((l) => l.sel);

  function alterar(i: number, parte: Partial<(typeof linhas)[number]>) {
    setLinhas((prev) => prev.map((l, j) => (j === i ? { ...l, ...parte } : l)));
  }

  async function importar() {
    setEnviando(true);
    try {
      const { soma, erro } = await emLotes(
        escolhidos.map((l) => ({
          nome: l.nome,
          categoria: l.categoria.trim() || null,
          custo: num(l.custo),
          precoVarejo: num(l.varejo),
          precoAtacado: l.atacado.trim() === "" ? null : num(l.atacado),
          estoque: Math.trunc(num(l.estoque)),
          avisos: [],
        })),
        importarProdutos,
      );
      if (erro) toast.error(erro);
      else
        setResultado(
          `${plural(soma.criados, "produto importado", "produtos importados")}.` +
            (soma.ignorados ? ` ${plural(soma.ignorados, "já existia", "já existiam")} e foram pulados.` : ""),
        );
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao numero={1} titulo={`Produtos (${analise.itens.length})`} periodo={analise.periodo}>
      <Resumo texto={analise.resumo} />
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/produtos" rotulo="Ver produtos" />
      ) : (
        <>
          <p className="text-[13px] text-ink-muted">
            Produto que já existe no Marcon com o mesmo nome é pulado. Você pode corrigir qualquer valor aqui antes de importar.
          </p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {linhas.map((l, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-3">
                <Marcar marcado={l.sel} onChange={(v) => alterar(i, { sel: v })} rotulo={`Importar ${l.nome}`} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    value={l.nome}
                    onChange={(e) => alterar(i, { nome: e.target.value })}
                    aria-label="Nome do produto"
                    className={`${inputClass} !py-1.5 font-medium`}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Campo rotulo="Categoria" valor={l.categoria} onChange={(v) => alterar(i, { categoria: v })} />
                    <Campo rotulo="Custo (R$)" valor={l.custo} onChange={(v) => alterar(i, { custo: v })} decimal />
                    <Campo rotulo="Venda (R$)" valor={l.varejo} onChange={(v) => alterar(i, { varejo: v })} decimal />
                    <Campo rotulo="Atacado (R$)" valor={l.atacado} onChange={(v) => alterar(i, { atacado: v })} decimal />
                    <Campo rotulo="Estoque" valor={l.estoque} onChange={(v) => alterar(i, { estoque: v })} />
                  </div>
                  {l.avisos.map((a) => (
                    <p key={a} className="text-[12px] text-warning">
                      {a}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {restantes !== null && escolhidos.length > restantes ? (
            // plano grátis: o banco recusaria o lote inteiro; melhor explicar antes
            <div className="flex flex-col gap-2">
              <p className="rounded-2xl bg-warning-tint px-4 py-3 text-[13px] text-warning">
                {restantes === 0
                  ? "Você já está no limite de produtos do plano grátis."
                  : `No plano grátis cabem mais ${plural(restantes, "produto", "produtos")}.`}{" "}
                Desmarque {plural(escolhidos.length - restantes, "produto", "produtos")} ou assine o plano Marcon para importar todos.
              </p>
              <div>
                <Link href="/assinatura" className={btnPrimary}>
                  Assinar o plano Marcon
                </Link>
              </div>
            </div>
          ) : (
            <BotaoImportar
              quantidade={escolhidos.length}
              enviando={enviando}
              onClick={importar}
              rotulo={plural(escolhidos.length, "produto", "produtos")}
            />
          )}
        </>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// vendas
// ---------------------------------------------------------------------------

function SecaoVendas({ analise, liberado }: { analise: De<"vendas">; liberado: boolean }) {
  const toast = useToast();
  const [selecionadas, setSelecionadas] = useState(() => new Set(analise.itens.filter((v) => !v.aPrazo).map((v) => v.ref)));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const escolhidas = analise.itens.filter((v) => selecionadas.has(v.ref));
  const total = escolhidas.reduce((s, v) => s + v.total, 0);
  const importaveis = analise.itens.filter((v) => !v.aPrazo);

  function alternar(ref: string, marcado: boolean) {
    setSelecionadas((prev) => {
      const novo = new Set(prev);
      if (marcado) novo.add(ref);
      else novo.delete(ref);
      return novo;
    });
  }

  async function importar() {
    setEnviando(true);
    try {
      const { soma, erro } = await emLotes(escolhidas, (lote) => importarVendas(lote, analise.origem));
      if (erro) toast.error(erro);
      else
        setResultado(
          `${plural(soma.criados, "venda importada", "vendas importadas")}.` +
            (soma.ignorados ? ` ${plural(soma.ignorados, "já estava", "já estavam")} no Marcon e foram puladas.` : "") +
            (soma.semProduto
              ? ` ${plural(soma.semProduto, "item ficou", "itens ficaram")} sem ligação com um produto: importe os produtos primeiro, se ainda não fez.`
              : ""),
        );
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao numero={2} titulo={`Vendas (${analise.itens.length})`} periodo={analise.periodo}>
      <Resumo texto={analise.resumo} />
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/vendas" rotulo="Ver vendas" />
      ) : (
        <>
          <p className="text-[13px] text-ink-muted">
            As vendas entram como <strong className="font-medium text-ink-2">histórico</strong>: não mexem no estoque de hoje e entram no
            caixa na data em que aconteceram. Importar {analise.origem === "planilha" ? "a mesma planilha" : "o mesmo relatório"} de novo
            não duplica.
          </p>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={selecionadas.size === importaveis.length && importaveis.length > 0}
              onChange={(e) => setSelecionadas(new Set(e.target.checked ? importaveis.map((v) => v.ref) : []))}
              className="h-[18px] w-[18px] accent-[var(--brand)]"
            />
            Selecionar todas
          </label>
          <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
            {analise.itens.map((v) => (
              <li key={v.ref} className="flex items-start gap-3 px-3 py-2.5 text-[14px]">
                <Marcar
                  marcado={selecionadas.has(v.ref)}
                  onChange={(m) => alternar(v.ref, m)}
                  rotulo={`Importar venda de ${formatData(v.data)}`}
                  desabilitado={v.aPrazo}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">
                    {v.itens.map((i) => `${i.quantidade > 1 ? `${i.quantidade}× ` : ""}${i.nome}`).join(" + ")}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    {[formatData(v.data), v.formaPagamento, v.canal, v.cliente].filter(Boolean).join(" · ")}
                  </p>
                  {v.avisos.map((a) => (
                    <p key={a} className="text-[12px] text-warning">
                      {a}
                    </p>
                  ))}
                </div>
                <span className="shrink-0 tabular-nums text-ink">{formatBRL(v.total)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-2">
            {plural(escolhidas.length, "venda selecionada", "vendas selecionadas")} · {formatBRL(total)}
          </p>
          <BotaoImportar
            quantidade={escolhidas.length}
            enviando={enviando}
            onClick={importar}
            rotulo={plural(escolhidas.length, "venda", "vendas")}
            bloqueado={!liberado}
          />
        </>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// extrato de caixa
// ---------------------------------------------------------------------------

function SecaoCaixa({ analise, liberado }: { analise: De<"caixa">; liberado: boolean }) {
  const toast = useToast();
  const [selecionados, setSelecionados] = useState(() => new Set(analise.itens.map((l) => l.ref)));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const escolhidos = analise.itens.filter((l) => selecionados.has(l.ref));
  const total = escolhidos.reduce((s, l) => s + (l.tipo === "saida" ? l.valor : 0), 0);

  function alternar(ref: string, marcado: boolean) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (marcado) novo.add(ref);
      else novo.delete(ref);
      return novo;
    });
  }

  async function importar() {
    setEnviando(true);
    try {
      const { soma, erro } = await emLotes(escolhidos, importarLancamentos);
      if (erro) toast.error(erro);
      else
        setResultado(
          `${plural(soma.criados, "lançamento importado", "lançamentos importados")}.` +
            (soma.ignorados ? ` ${plural(soma.ignorados, "já estava", "já estavam")} no Marcon e foram pulados.` : ""),
        );
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao numero={3} titulo={`Extrato de caixa (${analise.itens.length} lançamentos)`} periodo={analise.periodo}>
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/fluxo-de-caixa" rotulo="Ver fluxo de caixa" />
      ) : (
        <>
          <p className="text-[13px] text-ink-muted">
            Entram as compras de estoque e as despesas. Compra de estoque não conta como despesa do mês (o custo entra no lucro quando o
            produto é vendido) e não altera o estoque.
          </p>
          <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
            {analise.itens.map((l) => (
              <li key={l.ref} className="flex items-start gap-3 px-3 py-2.5 text-[14px]">
                <Marcar marcado={selecionados.has(l.ref)} onChange={(m) => alternar(l.ref, m)} rotulo={`Importar ${l.descricao}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{l.descricao}</p>
                  <p className="flex items-center gap-2 text-[12px] text-ink-muted">
                    {formatData(l.data)}
                    <Badge tone={l.origem === "compra" ? "info" : "neutral"}>{l.origem === "compra" ? "Compra de estoque" : l.categoria}</Badge>
                  </p>
                </div>
                <span className={`shrink-0 tabular-nums ${l.tipo === "saida" ? "text-danger" : "text-positive"}`}>
                  {l.tipo === "saida" ? "−" : "+"} {formatBRL(l.valor)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-2">
            {plural(escolhidos.length, "lançamento selecionado", "lançamentos selecionados")} · saídas de {formatBRL(total)}
          </p>
          <BotaoImportar
            quantidade={escolhidos.length}
            enviando={enviando}
            onClick={importar}
            rotulo={plural(escolhidos.length, "lançamento", "lançamentos")}
            bloqueado={!liberado}
          />
        </>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// tela
// ---------------------------------------------------------------------------

const ehPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

export function Importador({
  historicoLiberado = true,
  produtosRestantes = null,
}: {
  historicoLiberado?: boolean;
  produtosRestantes?: number | null;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const previaRef = useRef<HTMLDivElement>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [carregado, setCarregado] = useState<Carregado>({});
  const [planilha, setPlanilha] = useState<{ arquivo: string; abas: Aba[]; chave: number } | null>(null);
  const contador = useRef(0);

  async function lerPdf(arquivo: File) {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    try {
      const resposta = await fetch("/api/importar/analisar", { method: "POST", body: corpo });
      const json = (await resposta.json().catch(() => null)) as { analise?: Analise; erro?: string } | null;
      if (!resposta.ok || !json?.analise) {
        toast.error(`${arquivo.name}: ${json?.erro ?? "não consegui ler este arquivo."}`);
        return;
      }
      const analise = json.analise;
      contador.current += 1;
      // um relatório novo do mesmo tipo substitui o anterior
      setCarregado((prev) => ({ ...prev, [analise.tipo]: { analise, chave: contador.current } }));
    } catch {
      toast.error(`${arquivo.name}: sem conexão. Tente de novo.`);
    }
  }

  // a planilha é lida aqui mesmo, no navegador: não sobe para o servidor
  async function lerArquivoDePlanilha(arquivo: File) {
    try {
      const abas = lerPlanilha(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
      if (abas.every((a) => a.linhas.length < 2)) {
        toast.error(`${arquivo.name}: a planilha está vazia.`);
        return;
      }
      contador.current += 1;
      setPlanilha({ arquivo: arquivo.name, abas, chave: contador.current });
    } catch (e) {
      toast.error(`${arquivo.name}: ${e instanceof ErroDeLeitura ? e.message : "não consegui ler esta planilha."}`);
    }
  }

  async function ler(arquivos: File[]) {
    if (arquivos.length === 0) return;
    setLendo(true);
    for (const arquivo of arquivos) {
      if (ehPdf(arquivo)) await lerPdf(arquivo);
      else if (tipoDePlanilha(arquivo.name)) await lerArquivoDePlanilha(arquivo);
      else toast.error(`${arquivo.name}: envie uma planilha (Excel ou CSV) ou um relatório em PDF.`);
    }
    setLendo(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function mostrarPrevia(leitura: Leitura) {
    contador.current += 1;
    const chave = contador.current;
    setCarregado((prev) => ({
      ...prev,
      produtos: { analise: leitura.produtos, chave },
      vendas: leitura.vendas ? { analise: leitura.vendas, chave } : prev.vendas,
    }));
    requestAnimationFrame(() => previaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const vazio = !carregado.produtos && !carregado.vendas && !carregado.caixa && !planilha;

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void ler(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
          arrastando ? "border-brand bg-brand-tint" : "border-line-strong bg-surface"
        }`}
      >
        <p className="text-[17px] font-semibold text-ink">{lendo ? "Lendo os arquivos..." : "Solte seus arquivos aqui"}</p>
        <p className="max-w-md text-[14px] text-ink-muted">
          Uma planilha sua (Excel ou CSV) ou os relatórios em PDF do VendaMax. Nada é importado antes de você conferir e confirmar.
        </p>
        <button type="button" className={btnPrimary} disabled={lendo} onClick={() => inputRef.current?.click()}>
          Escolher arquivos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,.xlsx,.xlsm,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void ler(Array.from(e.target.files ?? []))}
        />
      </div>

      {vazio && !lendo && (
        <Card title="Como funciona">
          <div className="flex flex-col gap-4 text-[14px] text-ink-2">
            <div>
              <p className="font-medium text-ink">Planilha (Excel, Google Planilhas, Notion)</p>
              <p className="mt-0.5">
                Baixe como .xlsx ou .csv e envie aqui. Você diz o que é cada coluna (data, produto, preço, custo...) e se cada linha é
                uma venda ou um produto. Linhas vazias, com erro de fórmula ou com o cabeçalho repetido são puladas sozinhas.
              </p>
            </div>
            <div>
              <p className="font-medium text-ink">VendaMax</p>
              <p className="mt-0.5">
                Baixe em PDF o relatório de produtos, o de vendas e o extrato de caixa. Eu confiro tudo com os totais do próprio
                relatório. Produtos com variações entram sem elas, porque o relatório não as detalha.
              </p>
            </div>
            <p className="text-[13px] text-ink-muted">
              Nos dois casos você vê uma prévia, corrige o que quiser e confirma. Importe primeiro os produtos, depois as vendas.
            </p>
          </div>
        </Card>
      )}

      {planilha && (
        <MapeamentoPlanilha key={planilha.chave} arquivo={planilha.arquivo} abas={planilha.abas} onPrevia={mostrarPrevia} />
      )}

      <div ref={previaRef} className="flex scroll-mt-4 flex-col gap-5">
        {carregado.produtos && (
          <SecaoProdutos key={`produtos-${carregado.produtos.chave}`} analise={carregado.produtos.analise} restantes={produtosRestantes} />
        )}
        {carregado.vendas && <SecaoVendas key={`vendas-${carregado.vendas.chave}`} analise={carregado.vendas.analise} liberado={historicoLiberado} />}
        {carregado.caixa && <SecaoCaixa key={`caixa-${carregado.caixa.chave}`} analise={carregado.caixa.analise} liberado={historicoLiberado} />}
      </div>
    </div>
  );
}
