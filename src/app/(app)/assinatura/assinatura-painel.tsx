"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, btnPrimary, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Grupo, Segmentado } from "@/components/ajustes";
import { IconCheck } from "@/components/icons";
import { useToast } from "@/components/toaster";
import { formatarDocumento, documentoValido } from "@/lib/documento";
import { formatBRL, formatData } from "@/lib/format";
import { ANUAL_POR_MES, CICLOS, DIAS_DE_TESTE, ECONOMIA_ANUAL, PLANO_GRATIS, PLANOS, type Ciclo } from "@/lib/planos";
import type { Situacao } from "@/lib/assinatura";
import type { Uso } from "@/lib/uso";
import { assinarPlano, cancelarPlano, regularizarPagamento, type ResultadoAssinar } from "./actions";

const PLANO = PLANOS.marcon;

function Barra({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number }) {
  const cheio = usado >= limite;
  const quase = usado >= limite * 0.8;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-ink">{rotulo}</span>
        <span className={`text-[15px] tabular-nums font-medium ${cheio ? "text-danger" : quase ? "text-warning" : "text-ink-2"}`}>
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
function UsoGrupo({ uso }: { uso: Uso }) {
  const emTeste = uso.plano === "teste";
  const limiteVendas = uso.limites.vendasMes ?? PLANO_GRATIS.limites.vendasPorMes;
  const limiteProdutos = uso.limites.produtos ?? PLANO_GRATIS.limites.produtos;
  return (
    <Grupo
      titulo="Seu uso"
      rodape={
        emTeste
          ? "No teste não há limite. Depois dele, vale o do plano grátis."
          : "Limites do plano grátis. Chegou no limite? Nada é apagado nem escondido: você continua vendo tudo, só não cria novos até assinar ou o mês virar (vendas)."
      }
    >
      <Barra rotulo="Vendas este mês" usado={uso.vendasMes} limite={limiteVendas} />
      <Barra rotulo="Produtos cadastrados" usado={uso.produtos} limite={limiteProdutos} />
    </Grupo>
  );
}

function Lista({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[15px] text-ink-2">
          <IconCheck width={16} height={16} className="mt-1 shrink-0 text-positive" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// número de destaque no ritmo do StatCard: valor grande e o sufixo pequeno ao lado
function Preco({ valor, sufixo, selo }: { valor: string; sufixo: string; selo?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-[22px] font-bold tracking-tight tabular-nums text-ink">
        {valor}
        <span className="text-[13px] font-normal tracking-normal text-ink-muted"> {sufixo}</span>
      </p>
      {selo}
    </div>
  );
}

// situação no topo: nome em 17 px, selo do estado e a explicação em 15 px
function BlocoSituacao({ titulo, selo, children }: { titulo: ReactNode; selo: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[17px] font-semibold text-ink">{titulo}</p>
        {selo}
      </div>
      <p className="mt-1 text-[15px] text-ink-2">{children}</p>
    </div>
  );
}

// ação destrutiva: fica no fim da tela, como texto vermelho discreto (docs/DESIGN.md)
function CancelarLink({ aoCancelar }: { aoCancelar: () => void }) {
  return (
    <ConfirmButton
      title="Cancelar assinatura?"
      description="Nenhuma nova cobrança será feita. O plano continua liberado até o fim do período que você já pagou; depois a conta passa para o grátis, com os dados guardados."
      confirmLabel="Cancelar assinatura"
      onConfirm={cancelarPlano}
      onDone={aoCancelar}
      className="w-full py-2 text-center text-[15px] font-medium text-danger hover:underline sm:w-auto"
    >
      Cancelar assinatura
    </ConfirmButton>
  );
}

// "R$ 149 por ano" / "R$ 15,90 por mês"
function precoDoCiclo(ciclo: Ciclo) {
  return `${formatBRL(CICLOS[ciclo].valor)} por ${ciclo === "anual" ? "ano" : "mês"}`;
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
  // começa no ciclo da assinatura pendente, se houver; senão no mensal
  const [ciclo, setCiclo] = useState<Ciclo>(situacao.ciclo);
  // o pagamento abre em outra aba; aqui esperamos o webhook confirmar
  const [esperandoPagamento, setEsperandoPagamento] = useState(false);
  const avisou = useRef(false);

  const { tipo } = situacao;
  const ativa = tipo === "ativa";
  // cortesia: plano liberado pelo admin, sem cobrança; cancelada: liberado até o fim do período pago
  const cancelada = tipo === "cancelada";
  const liberada = ativa || tipo === "cortesia" || cancelada;
  const aguardando = !liberada && (esperandoPagamento || (voltouDoPagamento && tipo === "pendente"));

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
    void abrirPagamento(() => assinarPlano(documento, ciclo));
  }

  // ---- bloco de situação, no topo ----
  let situacaoBloco: ReactNode;
  if (tipo === "cortesia") {
    situacaoBloco = (
      <BlocoSituacao titulo={`Plano ${PLANO.nome}`} selo={<Badge tone="positive">Cortesia</Badge>}>
        {situacao.cortesiaAte
          ? `Tudo liberado, sem cobrança, até ${formatData(situacao.cortesiaAte)} (${situacao.diasRestantes === 1 ? "último dia" : `${situacao.diasRestantes} dias`}). Depois disso você pode assinar.`
          : "Tudo liberado, sem cobrança. Nenhum cartão foi cadastrado."}
      </BlocoSituacao>
    );
  } else if (ativa) {
    situacaoBloco = (
      <BlocoSituacao titulo={`Plano ${PLANO.nome} ${CICLOS[situacao.ciclo].rotulo.toLowerCase()}`} selo={<Badge tone="positive">Ativa</Badge>}>
        {precoDoCiclo(situacao.ciclo)}, no cartão de crédito.
        {situacao.proximoVencimento && ` Próxima cobrança em ${formatData(situacao.proximoVencimento)}.`}
      </BlocoSituacao>
    );
  } else if (cancelada) {
    situacaoBloco = (
      <BlocoSituacao titulo={`Plano ${PLANO.nome} ${CICLOS[situacao.ciclo].rotulo.toLowerCase()}`} selo={<Badge>Cancelada</Badge>}>
        {situacao.proximoVencimento &&
          `Você cancelou, sem nova cobrança. O plano continua liberado até ${formatData(situacao.proximoVencimento)}; depois a conta passa para o grátis. Se assinar de novo antes disso, a primeira cobrança só vem nesse dia.`}
      </BlocoSituacao>
    );
  } else if (tipo === "atrasada") {
    situacaoBloco = (
      <>
        <BlocoSituacao titulo="Não conseguimos cobrar seu cartão" selo={<Badge tone="warning">Atrasada</Badge>}>
          Plano {PLANO.nome} {CICLOS[situacao.ciclo].rotulo.toLowerCase()}, {precoDoCiclo(situacao.ciclo)}. O Asaas tenta de novo
          sozinho, mas você pode resolver agora pagando com o mesmo cartão ou com outro.
        </BlocoSituacao>
        <button
          type="button"
          className={`${btnPrimary} w-full sm:w-auto sm:self-start`}
          disabled={abrindo}
          onClick={() => void abrirPagamento(regularizarPagamento)}
        >
          {abrindo ? "Abrindo pagamento..." : "Regularizar pagamento"}
        </button>
      </>
    );
  } else if (tipo === "teste") {
    const usados = DIAS_DE_TESTE - situacao.diasRestantes;
    situacaoBloco = (
      <>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[17px] font-semibold text-ink">Você está no teste grátis</p>
          <p className="text-[15px] font-medium text-ink-2">
            {situacao.diasRestantes === 1 ? "Último dia" : `${situacao.diasRestantes} dias restantes`}
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-fill"
          role="progressbar"
          aria-label="Dias de teste usados"
          aria-valuemin={0}
          aria-valuemax={DIAS_DE_TESTE}
          aria-valuenow={usados}
        >
          <div className="h-full rounded-full bg-brand-fill" style={{ width: `${(usados / DIAS_DE_TESTE) * 100}%` }} />
        </div>
        <p className="text-[15px] text-ink-2">
          Tudo liberado, sem cartão. Termina em {formatData(situacao.fimDoTeste)}. Depois você segue no plano grátis ou assina para
          ter vendas e produtos ilimitados e a vitrine.
        </p>
      </>
    );
  } else if (tipo === "pendente") {
    situacaoBloco = (
      <BlocoSituacao
        titulo={aguardando ? "Aguardando confirmação do pagamento" : "Falta concluir o pagamento"}
        selo={<Badge tone="warning">{aguardando ? "Confirmando..." : "Pendente"}</Badge>}
      >
        {aguardando
          ? "Conclua o pagamento na aba do Asaas. Assim que ele confirmar, esta tela atualiza sozinha."
          : "Você começou a assinar, mas o pagamento não foi concluído. Continue pelo botão abaixo."}
      </BlocoSituacao>
    );
  } else {
    situacaoBloco = (
      <BlocoSituacao titulo="Você está no plano grátis" selo={<Badge>Grátis</Badge>}>
        Até {PLANO_GRATIS.limites.vendasPorMes} vendas por mês e {PLANO_GRATIS.limites.produtos} produtos. Assine e libere vendas
        ilimitadas e a sua vitrine com link.
      </BlocoSituacao>
    );
  }

  // depois do clique em "Assinar" o painel ainda não sabe que virou pendente
  const esperandoAntesDoServidor = esperandoPagamento && tipo !== "pendente" && tipo !== "atrasada" && (!liberada || cancelada);
  // quem cancelou e ainda está no período pago pode assinar de novo (a cobrança começa quando o período acaba)
  const mostraAssinar = (!liberada || cancelada) && tipo !== "atrasada";
  // mensal ou anual só se escolhe ao assinar; assinado (ou atrasado), mostra o ciclo que a pessoa tem
  const podeEscolherCiclo = cobrancaDisponivel && mostraAssinar;
  const cicloMostrado: Ciclo = podeEscolherCiclo ? ciclo : liberada || tipo === "atrasada" ? situacao.ciclo : "mensal";

  return (
    <div className="flex flex-col gap-7">
      <Grupo titulo="Situação">{situacaoBloco}</Grupo>

      {uso && uso.plano !== "pago" && <UsoGrupo uso={uso} />}

      <div className="grid grid-cols-1 items-start gap-7 sm:grid-cols-2 sm:gap-4">
        <Grupo titulo={`Plano ${PLANO_GRATIS.nome.toLowerCase()}`}>
          <Preco
            valor="R$ 0"
            sufixo="/mês"
            selo={tipo === "gratis" ? <Badge>Seu plano</Badge> : tipo === "teste" ? <Badge tone="info">Depois do teste</Badge> : undefined}
          />
          <Lista itens={PLANO_GRATIS.inclui} />
        </Grupo>

        <Grupo
          titulo={`Plano ${PLANO.nome}`}
          rodape={
            mostraAssinar && cobrancaDisponivel
              ? `${
                  ciclo === "anual"
                    ? "Uma cobrança por ano no cartão de crédito, renovada sozinha. Cancele quando quiser."
                    : "Cobrança mensal no cartão de crédito. Cancele quando quiser."
                } Você digita o cartão na página segura do Asaas: o Marcon não vê nem guarda o número.`
              : undefined
          }
        >
          {podeEscolherCiclo && (
            <Segmentado
              rotulo="Ciclo de cobrança"
              valor={ciclo}
              onMudar={setCiclo}
              opcoes={[
                { valor: "mensal", label: CICLOS.mensal.rotulo },
                { valor: "anual", label: CICLOS.anual.rotulo },
              ]}
            />
          )}
          <div>
            <Preco
              valor={formatBRL(CICLOS[cicloMostrado].valor)}
              sufixo={CICLOS[cicloMostrado].sufixo}
              selo={liberada ? <Badge tone="positive">Seu plano</Badge> : undefined}
            />
            {cicloMostrado === "anual" ? (
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Sai {formatBRL(ANUAL_POR_MES)} por mês. Você economiza {formatBRL(ECONOMIA_ANUAL)} em relação a 12 mensalidades.
              </p>
            ) : (
              mostraAssinar && (
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  Ou {formatBRL(PLANO.valorAnual)} por ano, {formatBRL(ANUAL_POR_MES)} por mês.
                </p>
              )
            )}
          </div>
          <Lista itens={PLANO.inclui} />

          {mostraAssinar && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
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
                      <p id="documento-erro" role="alert" className="mt-1 text-[13px] text-danger">
                        {erroDocumento}
                      </p>
                    )}
                  </div>
                  <button type="button" className={btnPrimary} disabled={abrindo} onClick={assinar}>
                    {abrindo
                      ? "Abrindo pagamento..."
                      : tipo === "pendente" && ciclo === situacao.ciclo
                        ? "Continuar pagamento"
                        : cancelada
                          ? `Assinar de novo por ${formatBRL(CICLOS[ciclo].valor)}${CICLOS[ciclo].sufixo}`
                          : `Assinar por ${formatBRL(CICLOS[ciclo].valor)}${CICLOS[ciclo].sufixo}`}
                  </button>
                  {esperandoAntesDoServidor && (
                    <p className="text-[13px] text-ink-2">
                      Conclua o pagamento na aba do Asaas. Esta tela atualiza sozinha quando ele confirmar.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </Grupo>
      </div>

      {(ativa || tipo === "atrasada" || tipo === "pendente") && (
        <div className="flex justify-center sm:justify-start">
          <CancelarLink aoCancelar={() => setEsperandoPagamento(false)} />
        </div>
      )}
    </div>
  );
}
