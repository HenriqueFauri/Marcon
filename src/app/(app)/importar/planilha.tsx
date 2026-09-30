"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Field, btnPrimary, inputClass } from "@/components/ui";
import type { Aba } from "@/lib/importacao/planilha/ler";
import {
  CAMPOS,
  acharCabecalho,
  adivinharModo,
  camposQueFaltam,
  colunasDe,
  letraDaColuna,
  mapearSozinho,
  montar,
  nomesParecidos,
  exemploDaCelula,
  type CampoDef,
  type CampoId,
  type Coluna,
  type Leitura,
  type Mapa,
  type Modo,
} from "@/lib/importacao/planilha/mapear";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface Estado {
  cabecalho: number;
  colunas: Coluna[];
  modo: Modo;
  mapa: Mapa;
}

function estadoInicial(aba: Aba, cabecalho = acharCabecalho(aba.linhas), modo?: Modo): Estado {
  const colunas = colunasDe(aba.linhas, cabecalho);
  const m = modo ?? adivinharModo(colunas);
  return { cabecalho, colunas, modo: m, mapa: mapearSozinho(colunas, m) };
}

// "Cada linha é uma venda / um produto": dois cartões grandes, fáceis de tocar no celular
function EscolhaDeModo({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  const opcoes: { id: Modo; titulo: string; texto: string }[] = [
    { id: "vendas", titulo: "Uma venda", texto: "Entram no histórico de vendas, e os produtos são criados a partir delas." },
    { id: "produtos", titulo: "Um produto", texto: "Entram no cadastro de produtos, com preço e estoque." },
  ];
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-ink-muted">Cada linha da planilha é</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition ${
              modo === o.id ? "border-brand bg-brand-tint" : "border-line hover:bg-fill"
            }`}
          >
            <input
              type="radio"
              name="modo"
              checked={modo === o.id}
              onChange={() => onChange(o.id)}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-[15px] font-semibold text-ink">{o.titulo}</span>
              <span className="block text-[13px] text-ink-muted">{o.texto}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ListaDeNomes({
  leitura,
  renomes,
  onRenomear,
}: {
  leitura: Leitura;
  renomes: Record<string, string>;
  onRenomear: (chave: string, novo: string) => void;
}) {
  const chaves = leitura.nomes.map((n) => n.chave).join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só muda quando a lista de nomes muda
  const parecidos = useMemo(() => nomesParecidos(leitura.nomes), [chaves]);
  const [soParecidos, setSoParecidos] = useState(parecidos.size > 0);
  const visiveis = soParecidos ? leitura.nomes.filter((n) => parecidos.has(n.chave)) : leitura.nomes;

  return (
    <details className="rounded-2xl border border-line" open={parecidos.size > 0}>
      <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium text-ink">
        {plural(leitura.nomes.length, "nome de produto", "nomes de produto")} na planilha
        {parecidos.size > 0 && <span className="text-warning"> · {plural(parecidos.size, "parece repetido", "parecem repetidos")}</span>}
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
        <p className="text-[13px] text-ink-muted">
          Nomes diferentes viram produtos diferentes. Para juntar dois que são o mesmo produto, escreva o mesmo nome nos dois. O nome
          que você escrever é o que vai para o cadastro.
        </p>
        {parecidos.size > 0 && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={soParecidos}
              onChange={(e) => setSoParecidos(e.target.checked)}
              className="h-[18px] w-[18px] accent-[var(--brand)]"
            />
            Mostrar só os parecidos
          </label>
        )}
        <datalist id="nomes-da-planilha">
          {leitura.nomes.map((n) => (
            <option key={n.chave} value={n.nome} />
          ))}
        </datalist>
        <ul className="flex max-h-[28rem] flex-col divide-y divide-line overflow-y-auto">
          {visiveis.map((n) => (
            <li key={n.chave} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 sm:w-2/5">
                <p className="truncate text-[14px] text-ink">{n.nome}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
                  {plural(n.vezes, "linha", "linhas")}
                  {parecidos.has(n.chave) && <Badge tone="warning">parecido com “{parecidos.get(n.chave)}”</Badge>}
                </p>
              </div>
              <input
                // sem estado a cada tecla: aplica ao sair do campo, para não recalcular a planilha inteira
                key={`${n.chave}:${renomes[n.chave] ?? ""}`}
                defaultValue={renomes[n.chave] ?? ""}
                onBlur={(e) => onRenomear(n.chave, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                list="nomes-da-planilha"
                placeholder="Manter este nome"
                aria-label={`Novo nome para ${n.nome}`}
                className={`${inputClass} !py-1.5 text-[14px] sm:flex-1`}
              />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function Puladas({ leitura }: { leitura: Leitura }) {
  if (leitura.puladas.length === 0) return null;
  return (
    <details className="text-[13px] text-ink-muted">
      <summary className="cursor-pointer">Ver as linhas puladas</summary>
      <ul className="mt-2 flex flex-col gap-1 pl-4">
        {leitura.puladas.map((p) => (
          <li key={p.motivo}>
            <span className="text-ink-2">{p.motivo}:</span> linha{p.linhas.length > 1 ? "s" : ""} {p.linhas.slice(0, 20).join(", ")}
            {p.linhas.length > 20 && ` e mais ${p.linhas.length - 20}`}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function MapeamentoPlanilha({
  arquivo,
  abas,
  onPrevia,
}: {
  arquivo: string;
  abas: Aba[];
  onPrevia: (leitura: Leitura) => void;
}) {
  const [abaIdx, setAbaIdx] = useState(0);
  const aba = abas[abaIdx];
  const [estado, setEstado] = useState(() => estadoInicial(aba));
  const [renomes, setRenomes] = useState<Record<string, string>>({});
  const { cabecalho, colunas, modo, mapa } = estado;

  const faltam = camposQueFaltam(modo, mapa);
  const leitura = useMemo(
    () => (faltam.length ? null : montar(aba, cabecalho, modo, mapa, renomes)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faltam deriva de modo e mapa
    [aba, cabecalho, modo, mapa, renomes],
  );

  // linhas que dá para escolher como cabeçalho: as primeiras com ao menos dois textos
  const candidatas = aba.linhas
    .map((l, i) => ({ i, celulas: l.map(exemploDaCelula).filter(Boolean) }))
    .filter((l) => l.i === cabecalho || l.celulas.length >= 2)
    .slice(0, 30)
    .map((l) => ({ i: l.i, texto: l.celulas.slice(0, 4).join(" · ") }));

  function escolherColuna(campo: CampoId, valor: string) {
    const indice = valor === "" ? undefined : Number(valor);
    setEstado((prev) => {
      const novo: Mapa = { ...prev.mapa };
      // uma coluna serve a um campo só
      if (indice !== undefined) for (const k of Object.keys(novo) as CampoId[]) if (novo[k] === indice) delete novo[k];
      if (indice === undefined) delete novo[campo];
      else novo[campo] = indice;
      return { ...prev, mapa: novo };
    });
  }

  function seletor(campo: CampoDef) {
    return (
      <Field
        key={campo.id}
        label={
          <>
            {campo.rotulo}
            {campo.obrigatorio && <span className="text-danger"> *</span>}
          </>
        }
        hint={campo.ajuda}
      >
        <select value={mapa[campo.id] ?? ""} onChange={(e) => escolherColuna(campo.id, e.target.value)} className={inputClass}>
          <option value="">Não tenho</option>
          {colunas.map((c) => (
            <option key={c.indice} value={c.indice}>
              {letraDaColuna(c.indice)} · {c.titulo}
              {c.exemplo ? ` (ex.: ${c.exemplo})` : ""}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <Card
      title="Planilha"
      description={`${arquivo}. Diga o que é cada coluna; eu já tentei adivinhar pelos títulos.`}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {abas.length > 1 && (
            <Field label="Aba">
              <select
                value={abaIdx}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setAbaIdx(i);
                  setEstado(estadoInicial(abas[i]));
                  setRenomes({});
                }}
                className={inputClass}
              >
                {abas.map((a, i) => (
                  <option key={i} value={i}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Linha dos títulos">
            <select
              value={cabecalho}
              onChange={(e) => setEstado(estadoInicial(aba, Number(e.target.value), modo))}
              className={inputClass}
            >
              {candidatas.map((c) => (
                <option key={c.i} value={c.i}>
                  Linha {c.i + 1}: {c.texto.length > 50 ? `${c.texto.slice(0, 49)}…` : c.texto}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <EscolhaDeModo modo={modo} onChange={(m) => setEstado(estadoInicial(aba, cabecalho, m))} />

        <div className="grid gap-3 sm:grid-cols-2">{CAMPOS[modo].filter((c) => !c.extra).map(seletor)}</div>
        <details
          // abre sozinho quando algum campo extra já foi reconhecido pelo título
          key={`${modo}:${cabecalho}`}
          open={CAMPOS[modo].some((c) => c.extra && mapa[c.id] !== undefined)}
          className="-mt-2"
        >
          <summary className="cursor-pointer text-[14px] font-medium text-brand-text">
            Mais colunas: {CAMPOS[modo].filter((c) => c.extra).map((c) => c.rotulo.toLowerCase()).join(", ")}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{CAMPOS[modo].filter((c) => c.extra).map(seletor)}</div>
        </details>

        {faltam.length > 0 ? (
          <p className="rounded-2xl bg-warning-tint px-4 py-3 text-[13px] text-warning">Falta escolher: {faltam.join(", ")}.</p>
        ) : (
          leitura && (
            <>
              <div className="flex flex-col gap-2 rounded-2xl bg-fill px-4 py-3 text-[14px] text-ink-2">
                <p>
                  {modo === "vendas"
                    ? `${plural(leitura.vendas?.itens.length ?? 0, "venda", "vendas")} e ${plural(leitura.produtos.itens.length, "produto", "produtos")}`
                    : plural(leitura.produtos.itens.length, "produto", "produtos")}
                  {leitura.puladas.length > 0 &&
                    ` · ${plural(
                      leitura.puladas.reduce((s, p) => s + p.linhas.length, 0),
                      "linha pulada",
                      "linhas puladas",
                    )}`}
                </p>
                <Puladas leitura={leitura} />
              </div>
              {leitura.nomes.length > 0 && (
                <ListaDeNomes
                  leitura={leitura}
                  renomes={renomes}
                  onRenomear={(chave, novo) =>
                    setRenomes((prev) => {
                      const valor = novo.trim();
                      if ((prev[chave] ?? "") === valor) return prev;
                      const r = { ...prev };
                      if (valor) r[chave] = valor;
                      else delete r[chave];
                      return r;
                    })
                  }
                />
              )}
            </>
          )
        )}

        <div>
          <button type="button" className={btnPrimary} disabled={!leitura || leitura.aproveitadas === 0} onClick={() => leitura && onPrevia(leitura)}>
            Ver prévia para importar
          </button>
        </div>
      </div>
    </Card>
  );
}
