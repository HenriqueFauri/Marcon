"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { btnPrimary, inputClass } from "@/components/ui";
import { Grupo } from "@/components/ajustes";
import { IconAlert, IconCheck } from "@/components/icons";
import { useToast } from "@/components/toaster";
import { formatBRL, formatData } from "@/lib/format";
import { ErroDeLeitura, type Analise, type Conferencia } from "@/lib/importacao/tipos";
import { detectarFormato, lerPlanilha } from "@/lib/importacao/planilha";
import { mensagemDeLancamentos, mensagemDeProdutos, mensagemDeVendas } from "@/lib/importacao/mensagens";
import type { ActionResult } from "@/lib/action";
import { importarLancamentos, importarProdutos, importarVendas } from "./actions";

// Envia em lotes: uma planilha grande não é cortada, só demora mais. Cada lote é tudo ou nada
// no banco e o que já entrou é pulado se a importação for repetida, então uma queda no meio
// se resolve importando de novo.
const LOTE = 500;

async function enviarEmLotes<T>(
  itens: T[],
  enviar: (lote: T[]) => Promise<ActionResult>,
  aoAvancar: (feitos: number) => void,
): Promise<{ ok: true; soma: Record<string, number> } | { ok: false; error: string; soma: Record<string, number> }> {
  const soma: Record<string, number> = {};
  for (let i = 0; i < itens.length; i += LOTE) {
    aoAvancar(i);
    const r = await enviar(itens.slice(i, i + LOTE));
    if (!r.ok) {
      const jaEntrou = i > 0 ? ` As primeiras ${i} linhas já entraram: é só importar de novo, o que já entrou é pulado.` : "";
      return { ok: false, error: r.error + jaEntrou, soma };
    }
    for (const [k, v] of Object.entries(r.dados ?? {})) soma[k] = (soma[k] ?? 0) + v;
  }
  return { ok: true, soma };
}

type Tipo = Analise["tipo"];
type De<T extends Tipo> = Extract<Analise, { tipo: T }>;
type Carregado = { [T in Tipo]?: { analise: De<T>; chave: number } };

const EXTENSOES = /\.(xlsx|xls|csv|tsv|txt|pdf)$/i;
const MODELOS = [
  { arquivo: "produtos.csv", rotulo: "produtos", colunas: "Nome, Custo, Preço, Estoque" },
  { arquivo: "vendas.csv", rotulo: "vendas", colunas: "Data, Produto, Quantidade, Valor" },
  { arquivo: "caixa.csv", rotulo: "caixa", colunas: "Data, Descrição, Valor, Tipo" },
];

const num = (s: string) => Number(s.replace(",", ".")) || 0;
// valor que o usuário edita: "124,68", com vírgula
const dinheiroTexto = (n: number) => n.toFixed(2).replace(".", ",");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------------------
// peças compartilhadas
// ---------------------------------------------------------------------------

// linha do Grupo: mesmo ritmo das LinhaLink e LinhaInfo
const LINHA = "border-t border-line px-4 py-3 first:border-t-0";

function Conferencias({ itens }: { itens: Conferencia[] }) {
  if (itens.length === 0) return null;
  const todasOk = itens.every((c) => c.ok);
  return (
    <div className={`${LINHA} text-[13px]`}>
      <p className={`flex items-center gap-2 text-[15px] font-medium ${todasOk ? "text-positive" : "text-warning"}`}>
        {todasOk ? <IconCheck width={16} height={16} /> : <IconAlert width={16} height={16} />}
        {todasOk ? "Conferido com os totais do relatório." : "Algum total não bate. Confira antes de importar."}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-ink-muted">
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
    <ul className={`${LINHA} flex flex-col gap-1 text-[13px] text-warning`}>
      {itens.map((a) => (
        <li key={a} className="flex items-start gap-2">
          <IconAlert width={14} height={14} className="mt-0.5 shrink-0" />
          {a}
        </li>
      ))}
    </ul>
  );
}

// Cada tipo de dado é um Grupo; o andamento vai no título ("Importar · 1 de 3"), nunca bolinha numerada.
function Secao({
  passo,
  rotulo,
  periodo,
  rodape,
  children,
}: {
  passo: { n: number; de: number };
  rotulo: string;
  periodo: string | null;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const titulo = passo.de > 1 ? `Importar · ${passo.n} de ${passo.de}` : "Importar";
  return (
    <Grupo titulo={titulo} rodape={rodape} semPadding>
      <div className={LINHA}>
        <p className="text-[17px] font-semibold text-ink">{rotulo}</p>
        {periodo && <p className="text-[13px] text-ink-muted">Período: {periodo}</p>}
      </div>
      {children}
    </Grupo>
  );
}

function Resultado({ mensagem, href, rotulo }: { mensagem: string; href: string; rotulo: string }) {
  return (
    <div className={`${LINHA} flex flex-wrap items-center justify-between gap-3 text-[15px]`}>
      <span className="flex items-center gap-2 text-positive">
        <IconCheck width={18} height={18} className="shrink-0" />
        {mensagem}
      </span>
      <Link href={href} className="font-medium text-brand-text hover:opacity-80">
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
  resumo,
  bloqueado,
  progresso,
}: {
  quantidade: number;
  enviando: boolean;
  onClick: () => void;
  rotulo: string;
  resumo?: string;
  bloqueado?: boolean;
  progresso?: string;
}) {
  // plano grátis: a prévia funciona, mas gravar vendas e caixa de outro sistema é do plano pago
  if (bloqueado) {
    return (
      <div className={`${LINHA} flex flex-col gap-3`}>
        <p className="text-[15px] text-ink-2">Vendas e caixa de outro sistema entram no plano Marcon. No grátis, só os produtos.</p>
        <Link href="/assinatura" className={`${btnPrimary} w-full sm:w-auto sm:self-start`}>
          Assinar o plano Marcon
        </Link>
      </div>
    );
  }
  return (
    <div className={`${LINHA} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
      {resumo && <p className="text-[15px] text-ink-2">{resumo}</p>}
      <button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={enviando || quantidade === 0} onClick={onClick}>
        {enviando ? `Importando${progresso ? ` ${progresso}` : ""}...` : quantidade === 0 ? "Marque ao menos um" : `Importar ${rotulo}`}
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
      <span className="mb-1 block text-[13px] text-ink-muted">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode={decimal ? "decimal" : undefined}
        className={`${inputClass} !py-1.5 text-[15px]`}
      />
    </label>
  );
}

function SecaoProdutos({ analise, passo }: { analise: De<"produtos">; passo: { n: number; de: number } }) {
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
  const [progresso, setProgresso] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const escolhidos = linhas.filter((l) => l.sel);

  function alterar(i: number, parte: Partial<(typeof linhas)[number]>) {
    setLinhas((prev) => prev.map((l, j) => (j === i ? { ...l, ...parte } : l)));
  }

  async function importar() {
    setEnviando(true);
    try {
      const r = await enviarEmLotes(
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
        (feitos) => setProgresso(`${feitos} de ${escolhidos.length}`),
      );
      if (!r.ok) toast.error(r.error);
      else setResultado(mensagemDeProdutos({ criados: r.soma.criados ?? 0, ignorados: r.soma.ignorados ?? 0 }));
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao
      passo={passo}
      rotulo={plural(analise.itens.length, "produto", "produtos")}
      periodo={analise.periodo}
      rodape={resultado ? undefined : "Produto com o mesmo nome de um que já existe é pulado. Corrija o que quiser antes de importar."}
    >
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/produtos" rotulo="Ver produtos" />
      ) : (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {linhas.map((l, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <Marcar marcado={l.sel} onChange={(v) => alterar(i, { sel: v })} rotulo={`Importar ${l.nome}`} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    value={l.nome}
                    onChange={(e) => alterar(i, { nome: e.target.value })}
                    aria-label="Nome do produto"
                    className={`${inputClass} !py-1.5 text-[17px]`}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Campo rotulo="Categoria" valor={l.categoria} onChange={(v) => alterar(i, { categoria: v })} />
                    <Campo rotulo="Custo (R$)" valor={l.custo} onChange={(v) => alterar(i, { custo: v })} decimal />
                    <Campo rotulo="Venda (R$)" valor={l.varejo} onChange={(v) => alterar(i, { varejo: v })} decimal />
                    <Campo rotulo="Atacado (R$)" valor={l.atacado} onChange={(v) => alterar(i, { atacado: v })} decimal />
                    <Campo rotulo="Estoque" valor={l.estoque} onChange={(v) => alterar(i, { estoque: v })} />
                  </div>
                  {l.avisos.map((a) => (
                    <p key={a} className="text-[13px] text-warning">
                      {a}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <BotaoImportar
            quantidade={escolhidos.length}
            enviando={enviando}
            progresso={progresso}
            onClick={importar}
            rotulo={plural(escolhidos.length, "produto", "produtos")}
          />
        </>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// vendas
// ---------------------------------------------------------------------------

function SecaoVendas({ analise, liberado, passo }: { analise: De<"vendas">; liberado: boolean; passo: { n: number; de: number } }) {
  const toast = useToast();
  const [selecionadas, setSelecionadas] = useState(() => new Set(analise.itens.filter((v) => !v.aPrazo).map((v) => v.ref)));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
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
      const r = await enviarEmLotes(escolhidas, importarVendas, (feitos) => setProgresso(`${feitos} de ${escolhidas.length}`));
      if (!r.ok) toast.error(r.error);
      else {
        setResultado(
          mensagemDeVendas({
            criadas: r.soma.criadas ?? 0,
            ignoradas: r.soma.ignoradas ?? 0,
            itens_sem_produto: r.soma.itens_sem_produto ?? 0,
          }),
        );
      }
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao
      passo={passo}
      rotulo={plural(analise.itens.length, "venda", "vendas")}
      periodo={analise.periodo}
      rodape={
        resultado
          ? undefined
          : "Entram como histórico: não mexem no estoque de hoje e caem no caixa na data da venda. Importar de novo não duplica."
      }
    >
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/vendas" rotulo="Ver vendas" />
      ) : (
        <>
          <label className={`${LINHA} flex cursor-pointer items-center gap-3 text-[15px] text-ink`}>
            <input
              type="checkbox"
              checked={selecionadas.size === importaveis.length && importaveis.length > 0}
              onChange={(e) => setSelecionadas(new Set(e.target.checked ? importaveis.map((v) => v.ref) : []))}
              className="h-[18px] w-[18px] shrink-0 accent-[var(--brand)]"
            />
            Marcar todas
          </label>
          <ul className="divide-y divide-line border-t border-line sm:max-h-[32rem] sm:overflow-y-auto">
            {analise.itens.map((v) => (
              <li key={v.ref} className="flex items-start gap-3 px-4 py-3">
                <Marcar
                  marcado={selecionadas.has(v.ref)}
                  onChange={(m) => alternar(v.ref, m)}
                  rotulo={`Importar venda de ${formatData(v.data)}`}
                  desabilitado={v.aPrazo}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-ink">
                    {v.itens.map((i) => `${i.quantidade > 1 ? `${i.quantidade}× ` : ""}${i.nome}`).join(" + ")}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {[formatData(v.data), v.formaPagamento, v.canal, v.cliente].filter(Boolean).join(" · ")}
                  </p>
                  {v.avisos.map((a) => (
                    <p key={a} className="text-[13px] text-warning">
                      {a}
                    </p>
                  ))}
                </div>
                <span className="shrink-0 text-[15px] tabular-nums text-ink">{formatBRL(v.total)}</span>
              </li>
            ))}
          </ul>
          <BotaoImportar
            quantidade={escolhidas.length}
            enviando={enviando}
            progresso={progresso}
            onClick={importar}
            rotulo={plural(escolhidas.length, "venda", "vendas")}
            resumo={`${plural(escolhidas.length, "marcada", "marcadas")} · ${formatBRL(total)}`}
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

function SecaoCaixa({ analise, liberado, passo }: { analise: De<"caixa">; liberado: boolean; passo: { n: number; de: number } }) {
  const toast = useToast();
  const [selecionados, setSelecionados] = useState(() => new Set(analise.itens.map((l) => l.ref)));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
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
      const r = await enviarEmLotes(escolhidos, importarLancamentos, (feitos) => setProgresso(`${feitos} de ${escolhidos.length}`));
      if (!r.ok) toast.error(r.error);
      else setResultado(mensagemDeLancamentos({ criados: r.soma.criados ?? 0, ignorados: r.soma.ignorados ?? 0 }));
    } catch {
      toast.error("Não foi possível importar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Secao
      passo={passo}
      rotulo={`Caixa: ${plural(analise.itens.length, "lançamento", "lançamentos")}`}
      periodo={analise.periodo}
      rodape={
        resultado
          ? undefined
          : "Entram compras de estoque e despesas. Compra de estoque não conta como despesa do mês e não mexe no estoque."
      }
    >
      <Conferencias itens={analise.conferencias} />
      <Avisos itens={analise.avisos} />
      {resultado ? (
        <Resultado mensagem={resultado} href="/fluxo-de-caixa" rotulo="Ver fluxo de caixa" />
      ) : (
        <>
          <ul className="divide-y divide-line border-t border-line sm:max-h-[32rem] sm:overflow-y-auto">
            {analise.itens.map((l) => (
              <li key={l.ref} className="flex items-start gap-3 px-4 py-3">
                <Marcar marcado={selecionados.has(l.ref)} onChange={(m) => alternar(l.ref, m)} rotulo={`Importar ${l.descricao}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-ink">{l.descricao}</p>
                  <p className="text-[13px] text-ink-muted">
                    {[formatData(l.data), l.origem === "compra" ? "Compra de estoque" : l.categoria].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 text-[15px] tabular-nums ${l.tipo === "saida" ? "text-danger" : "text-positive"}`}>
                  {l.tipo === "saida" ? "−" : "+"} {formatBRL(l.valor)}
                </span>
              </li>
            ))}
          </ul>
          <BotaoImportar
            quantidade={escolhidos.length}
            enviando={enviando}
            progresso={progresso}
            onClick={importar}
            rotulo={plural(escolhidos.length, "lançamento", "lançamentos")}
            resumo={`${plural(escolhidos.length, "marcado", "marcados")} · saídas de ${formatBRL(total)}`}
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

export function Importador({ historicoLiberado = true }: { historicoLiberado?: boolean }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [carregado, setCarregado] = useState<Carregado>({});
  const contador = useRef(0);

  async function ler(arquivos: File[]) {
    if (arquivos.length === 0) return;
    setLendo(true);
    for (const arquivo of arquivos) {
      try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        let analises: Analise[];
        if (detectarFormato(bytes) === "pdf") {
          // PDF é lido no servidor (limite de 4 MB por arquivo)
          const corpo = new FormData();
          corpo.append("arquivo", arquivo);
          const resposta = await fetch("/api/importar/analisar", { method: "POST", body: corpo });
          const json = (await resposta.json().catch(() => null)) as { analises?: Analise[]; erro?: string } | null;
          if (!resposta.ok || !json?.analises?.length) {
            toast.error(`${arquivo.name}: ${json?.erro ?? "não consegui ler este arquivo."}`);
            continue;
          }
          analises = json.analises;
        } else {
          // planilha é lida aqui no navegador: sem limite de envio, nada é cortado
          analises = await lerPlanilha(bytes);
        }
        // uma planilha pode ter uma aba de cada tipo; um arquivo novo do mesmo tipo substitui o anterior
        for (const analise of analises) {
          contador.current += 1;
          const chave = contador.current;
          setCarregado((prev) => ({ ...prev, [analise.tipo]: { analise, chave } }));
        }
      } catch (e) {
        toast.error(`${arquivo.name}: ${e instanceof ErroDeLeitura ? e.message : "não consegui ler este arquivo."}`);
      }
    }
    setLendo(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const vazio = !carregado.produtos && !carregado.vendas && !carregado.caixa;

  // andamento: a ordem é produtos, vendas, caixa (só conta o que foi carregado)
  const ordem = (["produtos", "vendas", "caixa"] as const).filter((t) => carregado[t]);
  const passo = (t: (typeof ordem)[number]) => ({ n: ordem.indexOf(t) + 1, de: ordem.length });

  return (
    <div className="flex flex-col gap-7">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void ler(Array.from(e.dataTransfer.files).filter((f) => EXTENSOES.test(f.name)));
        }}
        className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
          arrastando ? "border-brand bg-brand-tint" : "border-line-strong bg-surface"
        }`}
      >
        <p className="text-[17px] font-semibold text-ink">{lendo ? "Lendo os arquivos..." : "Solte seus arquivos aqui"}</p>
        <p className="max-w-md text-[15px] text-ink-muted">Excel, CSV ou PDF. Nada entra antes de você conferir.</p>
        <button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={lendo} onClick={() => inputRef.current?.click()}>
          Escolher arquivos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void ler(Array.from(e.target.files ?? []))}
        />
      </div>

      {vazio && !lendo && (
        <>
          <Grupo titulo="Como funciona" semPadding>
            <p className={`${LINHA} text-[15px] text-ink`}>Envie a planilha ou o relatório em PDF. Pode mandar vários.</p>
            <p className={`${LINHA} text-[15px] text-ink`}>Confira a prévia, corrija e desmarque o que não quer.</p>
            <p className={`${LINHA} text-[15px] text-ink`}>Importe os produtos primeiro, depois as vendas.</p>
          </Grupo>
          <Grupo titulo="Modelos" rodape="A planilha precisa de uma linha de títulos." semPadding>
            {MODELOS.map((m) => (
              <a
                key={m.arquivo}
                href={`/modelos/${m.arquivo}`}
                download
                className={`${LINHA} flex items-center gap-3 transition hover:bg-fill/60 active:bg-fill`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] text-ink">Modelo de {m.rotulo}</span>
                  <span className="block truncate text-[13px] text-ink-muted">{m.colunas}</span>
                </span>
                <span className="text-[15px] font-medium text-brand-text">Baixar</span>
              </a>
            ))}
          </Grupo>
        </>
      )}

      {carregado.produtos && <SecaoProdutos key={carregado.produtos.chave} analise={carregado.produtos.analise} passo={passo("produtos")} />}
      {carregado.vendas && (
        <SecaoVendas key={carregado.vendas.chave} analise={carregado.vendas.analise} liberado={historicoLiberado} passo={passo("vendas")} />
      )}
      {carregado.caixa && (
        <SecaoCaixa key={carregado.caixa.chave} analise={carregado.caixa.analise} liberado={historicoLiberado} passo={passo("caixa")} />
      )}
    </div>
  );
}
