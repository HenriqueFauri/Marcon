"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CanalVenda, Cliente, FormaPagamento, Venda, VendaItem } from "@/types/domain";
import { formatBRL } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Card, btnPrimary, inputClass } from "@/components/ui";
import { editarVenda } from "../../actions";
import {
  CANAIS_SUGERIDOS,
  FORMAS_SUGERIDAS,
  Linha,
  SelectOuTexto,
  emTexto,
  mascaraDinheiro,
  paraNumero,
  valorLinha,
} from "../../novo/venda-form";

export function EditarVendaForm({
  venda,
  itens,
  clientes,
  canais,
  formas,
  hoje,
}: {
  venda: Venda;
  itens: VendaItem[];
  clientes: Cliente[];
  canais: CanalVenda[];
  formas: FormaPagamento[];
  hoje: string;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();

  const [clienteId, setClienteId] = useState(venda.cliente_id ?? "");
  const [clienteNome, setClienteNome] = useState(venda.cliente_id ? "" : (venda.cliente_nome ?? ""));
  const [canalId, setCanalId] = useState(venda.canal_id ?? "");
  const [canalNome, setCanalNome] = useState(venda.canal_id ? "" : (venda.canal ?? ""));
  const [formaId, setFormaId] = useState(venda.forma_pagamento_id ?? "");
  const [formaNome, setFormaNome] = useState(venda.forma_pagamento_id ? "" : (venda.forma_pagamento ?? ""));
  const [data, setData] = useState(venda.data);
  const [observacoes, setObservacoes] = useState(venda.observacoes ?? "");
  const [precos, setPrecos] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, emTexto(Number(i.preco_unitario))])),
  );
  const [erro, setErro] = useState<string | null>(null);

  const aPrazo = venda.tipo_pagamento === "a_prazo";
  const subtotal = itens.reduce((s, i) => s + i.quantidade * paraNumero(precos[i.id] ?? "0"), 0);
  const total = subtotal - Number(venda.desconto);
  const diferenca = Math.round((total - Number(venda.valor_total)) * 100) / 100;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (aPrazo && !clienteId && !clienteNome.trim()) {
      setErro("Venda a prazo precisa de um cliente, pra saber de quem cobrar.");
      return;
    }
    if (Number(venda.desconto) > subtotal) {
      setErro("O desconto da venda é maior que o novo total dos itens.");
      return;
    }
    const mudados = itens
      .filter((i) => Math.round(paraNumero(precos[i.id] ?? "0") * 100) !== Math.round(Number(i.preco_unitario) * 100))
      .map((i) => ({ item_id: i.id, preco_unitario: Math.round(paraNumero(precos[i.id] ?? "0") * 100) / 100 }));
    run(
      () =>
        editarVenda({
          vendaId: venda.id,
          clienteId: clienteId || null,
          clienteNome: clienteNome || null,
          canalId: canalId || null,
          canalNome: canalNome || null,
          formaPagamentoId: formaId || null,
          formaPagamentoNome: formaNome || null,
          data,
          observacoes: observacoes || null,
          precos: mudados,
        }).then((r) => {
          if (r.ok) router.push(`/vendas/${venda.id}`);
          return r;
        }),
      { onError: setErro },
    );
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4 pb-24 lg:pb-0">
      <Card title="Itens" rodape="Muda só o preço. Pra mudar a quantidade, use Devolver na venda.">
        <ul className="divide-y divide-line">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-words text-[15px] leading-snug text-ink">{item.produto_nome}</p>
                <p className="text-[13px] text-ink-muted">{item.quantidade} un</p>
              </div>
              <label className="flex h-11 w-[9rem] shrink-0 items-center gap-1.5 rounded-xl border border-line bg-fill px-2.5 text-ink-muted focus-within:border-brand focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/15">
                <span className="text-[15px]">R$</span>
                <input
                  inputMode="numeric"
                  value={precos[item.id] ?? ""}
                  onChange={(e) => setPrecos((p) => ({ ...p, [item.id]: mascaraDinheiro(e.target.value) || "0,00" }))}
                  aria-label={`Preço unitário de ${item.produto_nome}`}
                  className="w-full min-w-0 bg-transparent font-semibold tabular-nums text-ink outline-none"
                />
              </label>
            </li>
          ))}
        </ul>
        <dl className="mt-1 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between font-semibold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(total)}</dd>
          </div>
          {diferenca !== 0 && (
            <div className="flex justify-between text-ink-muted">
              <dt>{diferenca > 0 ? "Aumenta" : "Diminui"} em</dt>
              <dd className="tabular-nums">{formatBRL(Math.abs(diferenca))}</dd>
            </div>
          )}
        </dl>
        {diferenca !== 0 && (
          <p className="mt-2 text-[13px] text-ink-muted">
            {aPrazo
              ? diferenca < 0
                ? "A diferença sai das parcelas em aberto, da última pra primeira. O que já foi pago e passar disso volta como estorno no caixa."
                : "A diferença soma na última parcela em aberto."
              : diferenca < 0
                ? "A diferença volta como estorno no caixa."
                : "A diferença entra no caixa hoje."}
          </p>
        )}
      </Card>

      <Card title="Cliente" className="!py-2 sm:!py-2">
        <SelectOuTexto
          label="Cliente"
          opcoes={clientes}
          id={clienteId}
          setId={setClienteId}
          texto={clienteNome}
          setTexto={setClienteNome}
          placeholder="Digite o nome do cliente (opcional)"
          vazio="Avulso (sem cadastro)"
        />
      </Card>

      <Card title="Pagamento">
        <div className="-mb-3">
          <SelectOuTexto
            label="Forma de pagamento"
            opcoes={formas}
            id={formaId}
            setId={setFormaId}
            texto={formaNome}
            setTexto={setFormaNome}
            placeholder="Como o cliente pagou"
            vazio="Escolher"
            sugestoes={FORMAS_SUGERIDAS}
          />
          <SelectOuTexto
            label="Canal de venda"
            opcoes={canais}
            id={canalId}
            setId={setCanalId}
            texto={canalNome}
            setTexto={setCanalNome}
            placeholder="Onde você vendeu"
            vazio="Escolher"
            sugestoes={CANAIS_SUGERIDOS}
          />
          <Linha rotulo="Data da venda">
            <input type="date" value={data} max={hoje} required onChange={(e) => setData(e.target.value)} className={valorLinha} />
          </Linha>
        </div>
      </Card>

      <Card title="Observação">
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Anotação sobre a venda (opcional)"
          className={inputClass}
        />
      </Card>

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 lg:static lg:bg-none lg:p-0">
        <button
          type="submit"
          disabled={isPending}
          className={`${btnPrimary} h-[54px] w-full !text-[17px] shadow-lg shadow-brand/30 lg:h-auto lg:py-3 lg:shadow-sm`}
        >
          {isPending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
