import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { enviarNotificacao } from "@/lib/push/send";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import { abrirAcao, dataValida, dinheiro, igual, termo, type ContextoAcao, type Db, type Entrada } from "./rascunho";
import type { Resultado } from "./acoes";

// Marcar parcela como paga ("o João pagou"). Mesmo molde do resto: o modelo só PREPARA, o servidor
// escolhe a parcela e guarda tudo no rascunho, e a gravação é o SIM do vendedor (acoes.ts).
// Nunca dispensa o SIM (acoes.ts, confirmarSeDispensado): mexe em dinheiro recebido.

export const FERRAMENTA_RECEBIMENTO: Anthropic.Tool = {
  name: "preparar_recebimento",
  description:
    "Prepara o recebimento de uma parcela de venda a prazo para o vendedor confirmar (\"o João pagou\", \"a Maria me pagou 50\"). NÃO lança nada: o sistema pede o SIM. O sistema escolhe a parcela mais antiga em aberto do cliente. Para só perguntar quem deve, use contas_a_receber.",
  input_schema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome do cliente que pagou, como o vendedor falou" },
      valor: { type: "number", description: "Quanto o cliente pagou, só se o vendedor disse (parte da parcela). Sem valor, é a parcela inteira" },
      data: { type: "string", description: "AAAA-MM-DD, só se o pagamento não foi hoje (até 60 dias atrás)" },
    },
    required: ["cliente"],
  },
};

interface RascunhoRecebimento {
  parcelaId: string;
  cliente: string;
  numero: number;
  vencimento: string;
  valorParcela: number;
  valor: number;
  data: string;
}

interface ParcelaAberta {
  id: string;
  valor: number;
  vencimento: string;
  numero_parcela: number;
  cliente: string;
}

export async function prepararRecebimento(db: Db, ctx: ContextoAcao, entrada: Entrada): Promise<unknown> {
  const quem = termo(entrada.cliente);
  if (!quem) return { erro: "Qual cliente pagou?" };

  const { data, error } = await db
    .from("parcelas")
    .select("id, valor, vencimento, numero_parcela, vendas!inner(cliente_nome)")
    .eq("owner_id", ctx.owner)
    .neq("status", "pago")
    .ilike("vendas.cliente_nome", `%${quem}%`)
    .order("vencimento", { ascending: true })
    .limit(200);
  if (error) throw error;

  const abertas: ParcelaAberta[] = (data ?? []).map((p) => ({
    id: p.id as string,
    valor: Number(p.valor),
    vencimento: p.vencimento as string,
    numero_parcela: Number(p.numero_parcela),
    cliente: ((p.vendas as unknown as { cliente_nome: string | null } | null)?.cliente_nome ?? "").trim(),
  }));
  if (!abertas.length) return { erro: `Não achei parcela em aberto de "${quem}". Para ver quem está devendo, pergunte "quem está me devendo?".` };

  // dois clientes com nome parecido ("João Silva" e "João Pedro"): o vendedor escolhe, nunca o modelo
  const nomes = [...new Set(abertas.map((p) => p.cliente.toLowerCase()))];
  let escolhido = abertas;
  if (nomes.length > 1) {
    const exato = abertas.filter((p) => igual(p.cliente, quem));
    if (exato.length) escolhido = exato;
    else {
      const lista = [...new Set(abertas.map((p) => p.cliente))].slice(0, 6);
      return { ambiguo: lista, pergunta: `Qual cliente? ${lista.join(", ")}.` };
    }
  }

  const parcela = escolhido[0]; // a mais antiga em aberto
  const nome = parcela.cliente || quem;
  const valorDito = dinheiro(entrada.valor);
  const valor = Number.isFinite(valorDito) ? valorDito : parcela.valor;
  if (!(valor > 0)) return { erro: "Confira o valor recebido." };
  if (valor > parcela.valor) {
    return {
      erro: `A parcela mais antiga de ${nome} (${formatData(parcela.vencimento)}) é de ${formatBRL(parcela.valor)}, menos que ${formatBRL(valor)}. Diga quanto foi pago dessa parcela, ou faça o recebimento pelo Marcon.`,
    };
  }

  const dia = dataValida(entrada.data);
  const restantes = escolhido.length - (valor === parcela.valor ? 1 : 0);
  const rascunho: RascunhoRecebimento = {
    parcelaId: parcela.id,
    cliente: nome,
    numero: parcela.numero_parcela,
    vencimento: parcela.vencimento,
    valorParcela: parcela.valor,
    valor,
    data: dia,
  };

  return abrirAcao(db, ctx, "parcela_paga", rascunho, [
    "*Marcar como pago?*",
    `• ${nome}: parcela ${parcela.numero_parcela}, vence ${formatData(parcela.vencimento)}`,
    `Valor recebido: *${formatBRL(valor)}*`,
    valor < parcela.valor ? `Faltam ${formatBRL(parcela.valor - valor)} nessa parcela` : null,
    dia !== hojeISO() ? `Data do pagamento: ${formatData(dia)}` : null,
    "Entra no caixa.",
    restantes > 0 ? `${nome} ainda fica com ${restantes} ${restantes === 1 ? "parcela" : "parcelas"} em aberto.` : null,
  ]);
}

export async function executarRecebimento(db: Db, ctx: ContextoAcao, payload: unknown): Promise<Resultado> {
  const r = payload as RascunhoRecebimento;
  // a mesma função do app (receber_parcela), com a identidade do dono: ela confere que a parcela é dele
  const { data, error } = await db.rpc("receber_parcela_como", {
    p_owner: ctx.owner,
    p_parcela_id: r.parcelaId,
    p_valor: r.valor,
    p_data: r.data,
  });
  if (error) throw error;

  const { recebido, restante } = (data ?? {}) as { recebido?: number; restante?: number };
  const entrou = Number(recebido ?? r.valor);
  const falta = Number(restante ?? 0);

  // o mesmo aviso do app; falhar aqui não desfaz o recebimento
  try {
    await enviarNotificacao(
      ctx.owner,
      falta > 0 ? "Parte da parcela recebida" : "Parcela recebida",
      `Parcela ${r.numero}: ${formatBRL(entrou)}, ${r.cliente}${falta > 0 ? `. Faltam ${formatBRL(falta)}` : ""}`,
      "/contas-a-receber",
    );
  } catch (e) {
    console.error("[whatsapp] aviso do recebimento", e);
  }

  return {
    referenciaId: r.parcelaId,
    mensagem:
      falta > 0
        ? `Recebido ${formatBRL(entrou)} de ${r.cliente} e lançado no caixa. Faltam ${formatBRL(falta)}.`
        : `Recebido ${formatBRL(entrou)} de ${r.cliente} e lançado no caixa.`,
  };
}
