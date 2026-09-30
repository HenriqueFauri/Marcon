"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, btnPrimary, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { IconCheck } from "@/components/icons";
import { useToast } from "@/components/toaster";
import { formatarDocumento, documentoValido } from "@/lib/documento";
import { formatBRL, formatData } from "@/lib/format";
import { DIAS_DE_TESTE, PLANO_GRATIS, PLANOS } from "@/lib/planos";
import type { Situacao } from "@/lib/assinatura";
import type { Uso } from "@/lib/uso";
import { assinarPlano, cancelarPlano, regularizarPagamento, type ResultadoAssinar } from "./actions";

const PLANO = PLANOS.marcon;

function Barra({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number }) {
  const cheio = usado >= limite;
  const quase = usado >= limite * 0.8;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="text-ink-2">{rotulo}</span>
        <span className={`tabular-nums font-medium ${cheio ? "text-danger" : quase ? "text-warning" : "text-ink"}`}>
          {usado} de {limite}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-fill"
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(usado, limite)}
      >
        <div
          className={`h-full rounded-full ${cheio ? "bg-danger" : quase ? "bg-warning" : "bg-brand-fill"}`}
          style={{ width: `${Math.min((usado / limite) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

// consumo em relação ao plano grátis: no teste ainda não há limite, mas já mostra o que vai valer depois
function UsoCard({ uso }: { uso: Uso }) {
  const emTeste = uso.plano === "teste";
  const limiteVendas = uso.limites.vendasMes ?? PLANO_GRATIS.limites.vendasPorMes;
  const limiteProdutos = uso.limites.produtos ?? PLANO_GRATIS.limites.produtos;
  return (
    <Card title="Seu uso" description={emTeste ? "No teste não há limite. Depois dele, vale o do plano grátis." : "Limites do plano grátis."}>
      <div className="flex flex-col gap-4">
        <Barra rotulo="Vendas este mês" usado={uso.vendasMes} limite={limiteVendas} />
        <Barra rotulo="Produtos cadastrados" usado={uso.produtos} limite={limiteProdutos} />
        {!emTeste && (
          <p className="text-[13px] text-ink-muted">
            Chegou no limite? Nada é apagado nem escondido: você continua vendo tudo, só não cria novos até assinar ou o mês virar (vendas).
          </p>
        )}
      </div>
    </Card>
  );
}

function Lista({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[14px] text-ink-2">
          <IconCheck width={16} height={16} className="mt-0.5 shrink-0 text-positive" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CancelarLink({ aoCancelar }: { aoCancelar: () => void }) {
  return (
    <ConfirmButton
      title="Cancelar assinatura?"
      description="Nenhuma nova cobrança será feita. Seus dados continuam guardados e você passa para o plano grátis."
      confirmLabel="Cancelar assinatura"
      onConfirm={cancelarPlano}
      onDone={aoCancelar}
      className="text-[13px] font-medium text-ink-muted underline-offset-2 hover:text-danger hover:underline"
    >
      Cancelar assinatura
    </ConfirmButton>
  );
}

export function AssinaturaPainel({
  situacao,
  cobrancaDisponivel,
  voltouDoPagamento,
  uso,
}: {
  situacao: Situacao;
  cobrancaDisponivel: boolean;
  voltouDoPagamento: boolean;
  uso: Uso | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [documento, setDocumento] = useState("");
  const [erroDocumento, setErroDocumento] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  // o pagamento abre em outra aba; aqui esperamos o webhook confirmar
  const [esperandoPagamento, setEsperandoPagamento] = useState(false);
  const avisou = useRef(false);

  const { tipo } = situacao;
  const ativa = tipo === "ativa";
  const aguardando = !ativa && (esperandoPagamento || (voltouDoPagamento && tipo === "pendente"));

  useEffect(() => {
    if (!aguardando) return;
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas += 1;
      router.refresh();
      if (tentativas >= 100) clearInterval(timer); // 5 minutos
    }, 3000);
    return () => clearInterval(timer);
  }, [aguardando, router]);

  useEffect(() => {
    if (ativa && esperandoPagamento && !avisou.current) {
      avisou.current = true;
      toast.success("Pagamento confirmado. Sua assinatura está ativa!");
    }
  }, [ativa, esperandoPagamento, toast]);

  // a aba é aberta já no clique, senão o navegador a bloqueia depois da espera
  async function abrirPagamento(gerarLink: () => Promise<ResultadoAssinar>) {
    setAbrindo(true);
    const janela = window.open("", "_blank");
    if (janela) janela.opener = null;
    try {
      const r = await gerarLink();
      if (!r.ok) {
        janela?.close();
        toast.error(r.error);
        return;
      }
      avisou.current = false;
      setEsperandoPagamento(true);
      // a página de pagamento é do Asaas: o cartão nunca passa pelo Marcon
      if (janela) janela.location.href = r.url;
      else window.location.href = r.url;
    } catch {
      janela?.close();
      toast.error("Não foi possível abrir o pagamento. Tente de novo.");
    } finally {
      setAbrindo(false);
    }
  }

  function assinar() {
    if (!documentoValido(documento)) {
      setErroDocumento("CPF ou CNPJ inválido. Confira os números.");
      return;
    }
    setErroDocumento(null);
    void abrirPagamento(() => assinarPlano(documento));
  }

  // ---- bloco de situação, no topo ----
  let situacaoCard: ReactNode;
  if (ativa) {
    situacaoCard = (
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold text-ink">Plano {PLANO.nome}</p>
          <Badge tone="positive">Ativa</Badge>
        </div>
        <p className="mt-1 text-[14px] text-ink-2">
          {formatBRL(PLANO.valor)} por mês, no cartão de crédito.
          {situacao.proximoVencimento && ` Próxima cobrança em ${formatData(situacao.proximoVencimento)}.`}
        </p>
        <div className="mt-4">
          <CancelarLink aoCancelar={() => setEsperandoPagamento(false)} />
        </div>
      </Card>
    );
  } else if (tipo === "atrasada") {
    situacaoCard = (
      <Card className="border border-warning/40">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold text-ink">Não conseguimos cobrar seu cartão</p>
          <Badge tone="warning">Atrasada</Badge>
        </div>
        <p className="mt-1 text-[14px] text-ink-2">
          O Asaas tenta de novo sozinho, mas você pode resolver agora pagando com o mesmo cartão ou com outro.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" className={btnPrimary} disabled={abrindo} onClick={() => void abrirPagamento(regularizarPagamento)}>
            {abrindo ? "Abrindo pagamento..." : "Regularizar pagamento"}
          </button>
          <CancelarLink aoCancelar={() => setEsperandoPagamento(false)} />
        </div>
      </Card>
    );
  } else if (tipo === "teste") {
    const usados = DIAS_DE_TESTE - situacao.diasRestantes;
    situacaoCard = (
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[17px] font-semibold text-ink">Você está no teste grátis</p>
          <p className="text-[14px] font-medium text-ink-2">
            {situacao.diasRestantes === 1 ? "Último dia" : `${situacao.diasRestantes} dias restantes`}
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-fill"
          role="progressbar"
          aria-label="Dias de teste usados"
          aria-valuemin={0}
          aria-valuemax={DIAS_DE_TESTE}
          aria-valuenow={usados}
        >
          <div className="h-full rounded-full bg-brand-fill" style={{ width: `${(usados / DIAS_DE_TESTE) * 100}%` }} />
        </div>
        <p className="mt-3 text-[14px] text-ink-2">
          Tudo liberado, sem cartão. Termina em {formatData(situacao.fimDoTeste)}. Depois você segue no plano grátis ou assina para
          continuar sem limite.
        </p>
      </Card>
    );
  } else if (tipo === "pendente") {
    situacaoCard = (
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold text-ink">
            {aguardando ? "Aguardando confirmação do pagamento" : "Falta concluir o pagamento"}
          </p>
          <Badge tone="warning">{aguardando ? "Confirmando..." : "Pendente"}</Badge>
        </div>
        <p className="mt-1 text-[14px] text-ink-2">
          {aguardando
            ? "Conclua o pagamento na aba do Asaas. Assim que ele confirmar, esta tela atualiza sozinha."
            : "Você começou a assinar, mas o pagamento não foi concluído. Continue pelo botão abaixo."}
        </p>
      </Card>
    );
  } else {
    situacaoCard = (
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold text-ink">Você está no plano grátis</p>
          <Badge>Grátis</Badge>
        </div>
        <p className="mt-1 text-[14px] text-ink-2">
          Até {PLANO_GRATIS.limites.vendasPorMes} vendas por mês e {PLANO_GRATIS.limites.produtos} produtos. Assine para tirar os limites.
        </p>
      </Card>
    );
  }

  // depois do clique em "Assinar" o painel ainda não sabe que virou pendente
  const esperandoAntesDoServidor = esperandoPagamento && tipo !== "pendente" && tipo !== "atrasada" && !ativa;

  return (
    <div className="flex flex-col gap-5">
      {situacaoCard}

      {uso && uso.plano !== "pago" && <UsoCard uso={uso} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="hairline flex flex-col gap-4 rounded-3xl bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{PLANO_GRATIS.nome}</h2>
            {tipo === "gratis" && <Badge>Seu plano</Badge>}
            {tipo === "teste" && <Badge tone="info">Depois do teste</Badge>}
          </div>
          <p className="text-[26px] font-semibold tracking-tight text-ink">
            R$ 0<span className="text-[14px] font-normal text-ink-muted"> /mês</span>
          </p>
          <Lista itens={PLANO_GRATIS.inclui} />
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-brand bg-brand-tint p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{PLANO.nome}</h2>
            {ativa && <Badge tone="positive">Seu plano</Badge>}
          </div>
          <p className="text-[26px] font-semibold tracking-tight text-ink">
            {formatBRL(PLANO.valor)}
            <span className="text-[14px] font-normal text-ink-muted"> /mês</span>
          </p>
          <Lista itens={PLANO.inclui} />

          {!ativa && tipo !== "atrasada" && (
            <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
              {!cobrancaDisponivel ? (
                <p className="text-[13px] text-ink-muted">A assinatura ainda não está aberta. Ela chega em breve.</p>
              ) : (
                <>
                  <div>
                    <label htmlFor="documento" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
                      CPF ou CNPJ
                    </label>
                    <input
                      id="documento"
                      className={inputClass}
                      inputMode="numeric"
                      autoComplete="off"
                      value={documento}
                      onChange={(e) => {
                        setDocumento(formatarDocumento(e.target.value));
                        setErroDocumento(null);
                      }}
                      onBlur={() => {
                        if (documento && !documentoValido(documento)) setErroDocumento("CPF ou CNPJ inválido. Confira os números.");
                      }}
                      placeholder="000.000.000-00"
                      aria-invalid={!!erroDocumento}
                      aria-describedby={erroDocumento ? "documento-erro" : undefined}
                    />
                    {erroDocumento && (
                      <p id="documento-erro" role="alert" className="mt-1 text-xs text-danger">
                        {erroDocumento}
                      </p>
                    )}
                  </div>
                  <button type="button" className={btnPrimary} disabled={abrindo} onClick={assinar}>
                    {abrindo
                      ? "Abrindo pagamento..."
                      : tipo === "pendente"
                        ? "Continuar pagamento"
                        : `Assinar por ${formatBRL(PLANO.valor)}/mês`}
                  </button>
                  {esperandoAntesDoServidor && (
                    <p className="text-[13px] text-ink-2">
                      Conclua o pagamento na aba do Asaas. Esta tela atualiza sozinha quando ele confirmar.
                    </p>
                  )}
                  <p className="text-[12px] leading-relaxed text-ink-muted">
                    Cobrança mensal no cartão de crédito. Cancele quando quiser. Você digita o cartão na página segura do Asaas: o
                    Marcon não vê nem guarda o número.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {tipo === "pendente" && (
        <div>
          <CancelarLink aoCancelar={() => setEsperandoPagamento(false)} />
        </div>
      )}
    </div>
  );
}
