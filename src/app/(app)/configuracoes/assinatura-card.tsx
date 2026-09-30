"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Field, btnPrimary, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/toaster";
import { formatBRL, formatData } from "@/lib/format";
import { PLANOS, type PlanoId } from "@/lib/planos";
import { assinarPlano, cancelarPlano } from "./assinatura-actions";

export interface AssinaturaAtual {
  plano: string;
  status: "pendente" | "ativa" | "atrasada" | "cancelada";
  proximoVencimento: string | null;
}

export function AssinaturaCard({
  assinatura,
  fimDoTeste,
  emTeste,
  diasDeTeste,
  cobrancaDisponivel,
  voltouDoPagamento,
}: {
  assinatura: AssinaturaAtual | null;
  fimDoTeste: string;
  emTeste: boolean;
  diasDeTeste: number;
  cobrancaDisponivel: boolean;
  voltouDoPagamento: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [plano, setPlano] = useState<PlanoId>("loja");
  const [documento, setDocumento] = useState("");
  const [enviando, setEnviando] = useState(false);

  const ativa = assinatura?.status === "ativa" || assinatura?.status === "atrasada";
  // o pagamento já foi feito, mas a confirmação chega por webhook alguns segundos depois
  const aguardando = voltouDoPagamento && assinatura?.status === "pendente";

  useEffect(() => {
    if (!aguardando) return;
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas += 1;
      router.refresh();
      if (tentativas >= 10) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [aguardando, router]);
  const nomePlano = assinatura && assinatura.plano in PLANOS ? PLANOS[assinatura.plano as PlanoId].nome : "";

  async function assinar() {
    setEnviando(true);
    try {
      const r = await assinarPlano(plano, documento);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // a página de pagamento é do Asaas: o cartão nunca passa pelo Marcon
      window.location.href = r.url;
    } catch {
      toast.error("Não foi possível iniciar a assinatura. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (ativa && assinatura) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold text-ink">Plano {nomePlano}</p>
          <Badge tone={assinatura.status === "ativa" ? "positive" : "warning"}>
            {assinatura.status === "ativa" ? "Ativa" : "Pagamento atrasado"}
          </Badge>
        </div>
        <p className="text-[13px] text-ink-muted">
          {assinatura.status === "atrasada"
            ? "A última cobrança não foi paga. O Asaas tenta cobrar de novo e avisa você por e-mail."
            : assinatura.proximoVencimento
              ? `Próxima cobrança em ${formatData(assinatura.proximoVencimento)}.`
              : "Cobrança mensal no cartão."}
        </p>
        <div>
          <ConfirmButton
            title="Cancelar assinatura?"
            description="Nenhuma nova cobrança será feita. Seus dados continuam guardados."
            confirmLabel="Cancelar assinatura"
            onConfirm={cancelarPlano}
            className="text-[13px] font-medium text-danger underline-offset-2 hover:underline"
          >
            Cancelar assinatura
          </ConfirmButton>
        </div>
      </div>
    );
  }

  const cancelada = assinatura?.status === "cancelada";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {cancelada ? (
          <Badge tone="neutral">Assinatura cancelada</Badge>
        ) : emTeste ? (
          <Badge tone="info">Teste grátis até {formatData(fimDoTeste.slice(0, 10))}</Badge>
        ) : (
          <Badge tone="warning">Teste de {diasDeTeste} dias encerrado</Badge>
        )}
        {assinatura?.status === "pendente" && (
          <Badge tone="warning">{aguardando ? "Confirmando pagamento..." : "Pagamento pendente"}</Badge>
        )}
      </div>

      {!cobrancaDisponivel ? (
        <p className="text-[13px] text-ink-muted">A assinatura ainda não está aberta. Fique de olho, ela chega em breve.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plano">
            {(Object.keys(PLANOS) as PlanoId[]).map((id) => {
              const p = PLANOS[id];
              const marcado = plano === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() => setPlano(id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    marcado ? "border-brand bg-brand-tint" : "border-line hover:border-ink-muted"
                  }`}
                >
                  <p className="text-[15px] font-semibold text-ink">{p.nome}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{p.resumo}</p>
                  <p className="mt-2 text-[17px] font-semibold text-ink">
                    {formatBRL(p.valor)}
                    <span className="text-[13px] font-normal text-ink-muted"> /mês</span>
                  </p>
                </button>
              );
            })}
          </div>

          <Field label="CPF ou CNPJ" hint="O Asaas pede para emitir a cobrança. O cartão você digita na página segura do Asaas.">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Somente números"
            />
          </Field>

          <div>
            <button type="button" className={btnPrimary} disabled={enviando} onClick={assinar}>
              {enviando ? "Abrindo pagamento..." : "Assinar com cartão"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
