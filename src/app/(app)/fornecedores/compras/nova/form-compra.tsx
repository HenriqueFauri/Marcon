"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/use-action";
import { Grupo } from "@/components/ajustes";
import { Field, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { formatBRL, hojeISO } from "@/lib/format";
import { registrarPedidoCompra } from "../actions";

export interface ProdutoOpcao {
  id: string;
  nome: string;
  custo: number;
  variacoes: { id: string; nome: string; custo: number }[];
}

interface Linha {
  chave: number;
  produtoId: string;
  variacaoId: string;
  quantidade: string;
  valor: string;
}

// "50", "50,5", "50.50" e "1.250,00" viram número; vazio vira NaN
function lerValor(texto: string) {
  const limpo = texto.trim();
  if (!limpo) return NaN;
  return Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
}

const paraCampo = (n: number) => n.toFixed(2).replace(".", ",");

// Pedido de compra: vários itens e o frete. A prévia mostra como o frete se divide (pelo valor de
// cada linha) e quanto passa a custar cada unidade; o banco faz a mesma conta ao salvar.
export function FormCompra({
  produtos,
  fornecedores,
  inicial,
}: {
  produtos: ProdutoOpcao[];
  fornecedores: { id: string; nome: string }[];
  inicial: { fornecedorId: string; itens: { produtoId: string; quantidade: number }[] };
}) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const porId = new Map(produtos.map((p) => [p.id, p]));

  const [proxima, setProxima] = useState(inicial.itens.length + 1);
  const [fornecedorId, setFornecedorId] = useState(inicial.fornecedorId);
  const [data, setData] = useState(hojeISO());
  const [frete, setFrete] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.itens.length > 0
      ? inicial.itens.map((it, i) => ({
          chave: i,
          produtoId: it.produtoId,
          variacaoId: "",
          quantidade: String(it.quantidade),
          valor: paraCampo(produtos.find((p) => p.id === it.produtoId)?.custo ?? 0),
        }))
      : [{ chave: 0, produtoId: "", variacaoId: "", quantidade: "1", valor: "" }],
  );

  function mudar(chave: number, campos: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  function escolherProduto(chave: number, produtoId: string) {
    const p = porId.get(produtoId);
    mudar(chave, { produtoId, variacaoId: "", valor: p && p.variacoes.length === 0 ? paraCampo(p.custo) : "" });
  }

  function escolherVariacao(chave: number, produtoId: string, variacaoId: string) {
    const v = porId.get(produtoId)?.variacoes.find((x) => x.id === variacaoId);
    mudar(chave, { variacaoId, valor: v ? paraCampo(v.custo) : "" });
  }

  const valorFrete = frete.trim() ? lerValor(frete) : 0;
  const freteValido = Number.isFinite(valorFrete) && valorFrete >= 0;

  // mesma regra do banco: frete proporcional ao valor da linha; a última leva o centavo que sobra
  const calculo = linhas.map((l) => {
    const qtd = Number(l.quantidade);
    const unit = lerValor(l.valor);
    return { qtd, unit, total: qtd * unit };
  });
  const linhasOk = linhas.every((l, i) => {
    const p = porId.get(l.produtoId);
    const c = calculo[i];
    return !!p && (p.variacoes.length === 0 || !!l.variacaoId) && Number.isInteger(c.qtd) && c.qtd > 0 && Number.isFinite(c.unit) && c.unit >= 0;
  });
  const totalItens = linhasOk ? calculo.reduce((s, c) => s + c.total, 0) : 0;
  const totalQtd = linhasOk ? calculo.reduce((s, c) => s + c.qtd, 0) : 0;
  let restante = freteValido ? Math.round(valorFrete * 100) / 100 : 0;
  const rateio = linhasOk
    ? calculo.map((c, i) => {
        let parte: number;
        if (i === calculo.length - 1) parte = restante;
        else if (totalItens > 0) parte = Math.round(((valorFrete * c.total) / totalItens) * 100) / 100;
        else parte = Math.round(((valorFrete * c.qtd) / totalQtd) * 100) / 100;
        parte = Math.min(parte, restante);
        restante -= parte;
        return { parte, custoFinal: Math.round((c.unit + parte / c.qtd) * 100) / 100 };
      })
    : [];

  const podeSalvar = linhasOk && freteValido && !isPending;
  const totalGeral = totalItens + (freteValido ? valorFrete : 0);

  function salvar() {
    run(
      () =>
        registrarPedidoCompra({
          fornecedor_id: fornecedorId || null,
          data,
          frete: freteValido ? valorFrete : 0,
          observacoes,
          itens: linhas.map((l, i) => ({
            produto_id: l.produtoId,
            variacao_id: l.variacaoId || null,
            quantidade: calculo[i].qtd,
            valor_unitario: calculo[i].unit,
          })),
        }),
      { onSuccess: () => router.push("/fornecedores/compras") },
    );
  }

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (podeSalvar) salvar();
      }}
    >
      <Grupo titulo="Compra">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fornecedor">
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={inputClass}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={inputClass} />
          </Field>
        </div>
      </Grupo>

      <Grupo titulo="Itens" rodape="O frete é dividido entre os itens pelo valor de cada linha e entra no custo de cada unidade.">
        <div className="flex flex-col gap-5">
          {linhas.map((l, i) => {
            const p = porId.get(l.produtoId);
            return (
              <div key={l.chave} className="flex flex-col gap-3 border-b border-line pb-5 last:border-0 last:pb-0">
                <Field label={`Produto ${linhas.length > 1 ? i + 1 : ""}`.trim()}>
                  <select value={l.produtoId} onChange={(e) => escolherProduto(l.chave, e.target.value)} required className={inputClass}>
                    <option value="">Escolha o produto</option>
                    {produtos.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                {p && p.variacoes.length > 0 && (
                  <Field label="Variação">
                    <select
                      value={l.variacaoId}
                      onChange={(e) => escolherVariacao(l.chave, l.produtoId, e.target.value)}
                      required
                      className={inputClass}
                    >
                      <option value="">Escolha a variação</option>
                      {p.variacoes.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantidade">
                    <input
                      value={l.quantidade}
                      onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                      inputMode="numeric"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Preço unitário (R$)">
                    <input
                      value={l.valor}
                      onChange={(e) => mudar(l.chave, { valor: e.target.value })}
                      inputMode="decimal"
                      required
                      placeholder="0,00"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px] text-ink-muted">
                  <span role="status">
                    {rateio[i]
                      ? `Frete ${formatBRL(rateio[i].parte)} · passa a custar ${formatBRL(rateio[i].custoFinal)} cada`
                      : "Preencha produto, quantidade e preço."}
                  </span>
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                      className="inline-flex items-center gap-1 text-danger"
                      aria-label={`Tirar o item ${i + 1}`}
                    >
                      <IconTrash width={14} height={14} /> Tirar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setLinhas((atual) => [...atual, { chave: proxima, produtoId: "", variacaoId: "", quantidade: "1", valor: "" }]);
              setProxima((n) => n + 1);
            }}
            className={`${btnSecondary} w-full sm:w-auto sm:self-start`}
          >
            <IconPlus width={16} height={16} /> Adicionar item
          </button>
        </div>
      </Grupo>

      <Grupo titulo="Frete e total">
        <Field label="Frete (R$)" hint={!freteValido ? <span className="text-danger">Confira o valor do frete.</span> : undefined}>
          <input value={frete} onChange={(e) => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
        </Field>
        <Field label="Observações">
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className={inputClass} placeholder="Opcional" />
        </Field>
        <p className="text-[15px] text-ink" role="status">
          {linhasOk
            ? `Itens ${formatBRL(totalItens)} + frete ${formatBRL(freteValido ? valorFrete : 0)} = ${formatBRL(totalGeral)}, uma saída só no caixa.`
            : "Complete os itens pra ver o total."}
        </p>
      </Grupo>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => router.back()} className={btnGhost}>
          Cancelar
        </button>
        <button type="submit" disabled={!podeSalvar} className={`${btnPrimary} w-full sm:w-auto`}>
          {isPending ? "Salvando..." : "Registrar compra"}
        </button>
      </div>
    </form>
  );
}
