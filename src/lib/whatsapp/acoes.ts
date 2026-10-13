import "server-only";
import { mensagemDeErro } from "@/lib/action";
import { NAO, SIM, tipoLiberado, type ContextoAcao, type Db, type TipoAcao } from "./rascunho";
import { executarVenda } from "./venda";
import { executarCaixa, executarEstoque, executarProduto } from "./lancamentos";

// Resolve o SIM ou o NÃO de um rascunho aberto. É chamado pela rota ANTES do modelo, e é o único
// lugar que grava um lançamento: o modelo nunca chega aqui. Para o assistente lançar uma coisa
// nova, basta um tipo em TipoAcao, um "preparar" que chame abrirAcao() e um executor nesta lista.

export interface Resultado {
  mensagem: string;
  vendaId?: string;
  referenciaId?: string;
}

type Executor = (db: Db, ctx: ContextoAcao, payload: unknown) => Promise<Resultado>;

const EXECUTORES: Record<TipoAcao, Executor> = {
  venda: executarVenda,
  produto: executarProduto,
  estoque_entrada: executarEstoque,
  estoque_saida: executarEstoque,
  caixa_entrada: executarCaixa,
  caixa_saida: executarCaixa,
};

// teto por dia: vendas têm o próprio (decisão antiga); os outros lançamentos dividem um
function limiteDoDia(tipo: TipoAcao, owner: string) {
  return tipo === "venda"
    ? { chave: `wa:venda:${owner}`, max: Number(process.env.WHATSAPP_LIMITE_VENDAS_DIA ?? 30), oQue: "vendas lançadas" }
    : { chave: `wa:lanc:${owner}`, max: Number(process.env.WHATSAPP_LIMITE_LANCAMENTOS_DIA ?? 30), oQue: "lançamentos" };
}

// Devolve o texto da resposta, ou null quando a mensagem não é SIM nem NÃO (ou não há rascunho).
export async function resolverPendente(db: Db, ctx: ContextoAcao, texto: string): Promise<string | null> {
  const quer = SIM.test(texto) ? "sim" : NAO.test(texto) ? "nao" : null;
  if (!quer) return null;

  const { data: acao } = await db
    .from("whatsapp_acoes")
    .select("id, owner_id, tipo, payload, expira_em")
    .eq("telefone", ctx.telefone)
    .eq("status", "pendente")
    .maybeSingle();
  if (!acao || acao.owner_id !== ctx.owner) return null;

  const agora = new Date().toISOString();
  const fechar = (campos: Record<string, unknown>) =>
    db.from("whatsapp_acoes").update({ ...campos, resolvida_em: agora }).eq("id", acao.id);

  if (quer === "nao") {
    await fechar({ status: "cancelada" }).eq("status", "pendente");
    return "Certo, cancelei. Nada foi lançado.";
  }

  if (new Date(acao.expira_em).getTime() < Date.now()) {
    await fechar({ status: "expirada" }).eq("status", "pendente");
    return "Esse pedido expirou, por segurança. Me conta de novo.";
  }

  const tipo = acao.tipo as TipoAcao;
  const executar = EXECUTORES[tipo];
  // o tipo pode ter sido desligado no servidor entre o rascunho e o SIM
  if (!executar || !tipoLiberado(tipo)) {
    await fechar({ status: "falhou", erro: "tipo desligado" }).eq("status", "pendente");
    return "Esse tipo de lançamento não está liberado por aqui. Faça direto no Marcon.";
  }

  // trava: só uma execução por rascunho, mesmo que o provedor entregue o SIM duas vezes
  const { data: reservada } = await db
    .from("whatsapp_acoes")
    .update({ status: "executando" })
    .eq("id", acao.id)
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  if (!reservada) return null;

  const limite = limiteDoDia(tipo, ctx.owner);
  const { data: dentro } = await db.rpc("consumir_limite", { p_chave: limite.chave, p_max: limite.max, p_segundos: 86400 });
  if (dentro !== true) {
    await fechar({ status: "falhou", erro: "limite diário" });
    return `Você chegou no limite de ${limite.oQue} por aqui hoje. Faça os outros direto no Marcon.`;
  }

  try {
    const r = await executar(db, ctx, acao.payload);
    await fechar({ status: "executada", venda_id: r.vendaId ?? null, referencia_id: r.referenciaId ?? null });
    return r.mensagem;
  } catch (e) {
    const bruto = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
    console.error("[whatsapp] lançamento falhou", tipo, bruto);
    await fechar({ status: "falhou", erro: bruto.slice(0, 300) });
    return `Não consegui lançar: ${mensagemDeErro(e)}`;
  }
}
