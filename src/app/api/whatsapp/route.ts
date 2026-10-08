import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assistenteAtivo, contaPodeUsar, enviarMensagem, extrairMensagem, type MensagemRecebida } from "@/lib/whatsapp/evolution";
import { lerCodigo } from "@/lib/whatsapp/vinculo";
import { responder, type Troca } from "@/lib/whatsapp/assistente";

// Webhook do assistente no WhatsApp. A Evolution chama aqui a cada mensagem recebida.
// Configuração do webhook (cabeçalho com WHATSAPP_WEBHOOK_SECRET): docs/whatsapp-assistente.md.
// A rota fica fora do proxy de sessão (src/proxy.ts), porque quem chama não é um usuário logado.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

function segredoValido(recebido: string | null) {
  const esperado = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// reaproveita o contador do banco (migration 0034): true enquanto não passou do máximo na janela
async function dentroDoLimite(admin: Admin, chave: string, max: number, segundos: number) {
  const { data, error } = await admin.rpc("consumir_limite", { p_chave: chave, p_max: max, p_segundos: segundos });
  if (error) {
    console.error("[whatsapp] limite", error.message);
    return false; // na dúvida, não responde
  }
  return data === true;
}

async function tentarVincular(admin: Admin, msg: MensagemRecebida, codigo: string) {
  if (!(await dentroDoLimite(admin, `wa:cod:${msg.telefone}`, 10, 3600))) return;

  const { data: linha } = await admin
    .from("whatsapp_codigos")
    .select("codigo, owner_id, expira_em")
    .eq("codigo", codigo)
    .maybeSingle();

  // texto que só parece um código (ex.: contato comum escrevendo "marcon") não ganha resposta
  if (!linha) return;

  if (new Date(linha.expira_em).getTime() < Date.now()) {
    await enviarMensagem(msg.telefone, "Esse código não vale mais. Gere outro em Configurações, no Marcon, e mande aqui.");
    return;
  }

  // o código é de uso único; o número ou a conta que já estavam vinculados são substituídos
  await admin.from("whatsapp_codigos").delete().eq("codigo", codigo);
  await admin.from("whatsapp_vinculos").delete().or(`owner_id.eq.${linha.owner_id},telefone.eq.${msg.telefone}`);
  const { error } = await admin.from("whatsapp_vinculos").insert({ owner_id: linha.owner_id, telefone: msg.telefone });
  if (error) throw error;

  await enviarMensagem(
    msg.telefone,
    "Pronto, seu WhatsApp está vinculado ao Marcon. Pergunte, por exemplo:\n• tem panela?\n• quanto vendi hoje?\n• quem está me devendo?\n\nMande *ajuda* para ver tudo que eu sei responder.",
  );
}

// memória curta: as últimas trocas deste número (a tabela só guarda pergunta e resposta em texto)
const HORAS_DE_MEMORIA = 6;
const MAX_MENSAGENS_DE_MEMORIA = 8;

async function carregarHistorico(admin: Admin, telefone: string): Promise<Troca[]> {
  const desde = new Date(Date.now() - HORAS_DE_MEMORIA * 3600_000).toISOString();
  const { data, error } = await admin
    .from("whatsapp_conversas")
    .select("papel, texto")
    .eq("telefone", telefone)
    .gte("criado_em", desde)
    .order("id", { ascending: false })
    .limit(MAX_MENSAGENS_DE_MEMORIA);
  if (error) {
    console.error("[whatsapp] histórico", error.message);
    return []; // sem memória, mas responde
  }
  const lista = ((data ?? []) as Troca[]).reverse();
  while (lista.length && lista[0].papel !== "user") lista.shift(); // a API exige começar por pergunta
  return lista;
}

async function guardarTroca(admin: Admin, telefone: string, pergunta: string, resposta: string) {
  const { error } = await admin.from("whatsapp_conversas").insert([
    { telefone, papel: "user", texto: pergunta },
    { telefone, papel: "assistant", texto: resposta },
  ]);
  if (error) console.error("[whatsapp] guardar histórico", error.message);
  // nada fica guardado por mais de 24 horas
  await admin.from("whatsapp_conversas").delete().lt("criado_em", new Date(Date.now() - 24 * 3600_000).toISOString());
}

const AJUDA = /^\s*(ajuda|menu|comandos|help|o que voc[eê] (faz|sabe fazer))\s*[?.!]?\s*$/i;

const TEXTO_AJUDA = [
  "Eu consulto os dados do seu Marcon. Pergunte do seu jeito, por exemplo:",
  "",
  "*Produtos e estoque*",
  "• tem panela?",
  "• quanto custa o controle PS4?",
  "• quais 3 produtos com mais estoque?",
  "• o que está acabando?",
  "",
  "*Vendas*",
  "• quanto vendi hoje?",
  "• quais produtos vendi de sexta a domingo?",
  "• quanto vendi no PIX esse mês?",
  "",
  "*Dinheiro*",
  "• quem está me devendo?",
  "• como está o caixa do mês?",
  "",
  "*Loja online*",
  "• tenho pedido novo?",
  "",
  "Por enquanto só consulto, não lanço nada. Mande *limpar* para recomeçar a conversa.",
].join("\n");

const LIMPAR = /^s*(limpar|nova conversa|reiniciar|recome[cç]ar)s*[.!]?s*$/i;

async function processar(msg: MensagemRecebida) {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[whatsapp] SUPABASE_SERVICE_ROLE_KEY não configurada");
    return;
  }

  // a Evolution pode entregar o mesmo evento mais de uma vez
  if (!(await dentroDoLimite(admin, `wa:msg:${msg.id}`, 1, 3600))) return;

  const codigo = lerCodigo(msg.texto);
  if (codigo) return tentarVincular(admin, msg, codigo);

  const { data: vinculo } = await admin.from("whatsapp_vinculos").select("owner_id").eq("telefone", msg.telefone).maybeSingle();
  if (!vinculo) {
    // número desconhecido: silêncio. Num número de uso misto, responder a qualquer contato seria um desastre.
    // Com WHATSAPP_ORIENTAR=1 (só em número dedicado ao Marcon) vale uma orientação por hora.
    if (process.env.WHATSAPP_ORIENTAR === "1" && (await dentroDoLimite(admin, `wa:desconhecido:${msg.telefone}`, 1, 3600))) {
      await enviarMensagem(msg.telefone, "Oi! Pra conversar comigo, vincule seu número: gere o código em Configurações, no Marcon, e mande ele aqui.");
    }
    return;
  }

  const owner = vinculo.owner_id as string;
  const { data: conta } = await admin.auth.admin.getUserById(owner);
  if (!contaPodeUsar(conta.user?.email)) return;

  const porDia = Number(process.env.WHATSAPP_LIMITE_DIA ?? 60);
  if (!(await dentroDoLimite(admin, `wa:dia:${owner}`, porDia, 86400))) {
    if (await dentroDoLimite(admin, `wa:aviso-limite:${owner}`, 1, 86400)) {
      await enviarMensagem(msg.telefone, "Você chegou no limite de mensagens de hoje. Amanhã eu volto a responder.");
    }
    return;
  }

  if (AJUDA.test(msg.texto)) {
    await enviarMensagem(msg.telefone, TEXTO_AJUDA);
    return;
  }

  if (LIMPAR.test(msg.texto)) {
    await admin.from("whatsapp_conversas").delete().eq("telefone", msg.telefone);
    await enviarMensagem(msg.telefone, "Conversa reiniciada. Pode perguntar.");
    return;
  }

  const historico = await carregarHistorico(admin, msg.telefone);
  const resposta = await responder(msg.texto, owner, historico);
  await enviarMensagem(msg.telefone, resposta);
  await guardarTroca(admin, msg.telefone, msg.texto, resposta);
}

export async function POST(request: Request) {
  if (!assistenteAtivo()) return new Response("ok");
  if (!segredoValido(request.headers.get("x-whatsapp-secret"))) {
    return new Response("Não autorizado", { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response("Corpo inválido", { status: 400 });
  }

  const msg = extrairMensagem(corpo);
  if (!msg) return new Response("ok");

  // responde 200 já: a IA demora e o provedor não deve ficar esperando (nem reenviar)
  after(async () => {
    try {
      await processar(msg);
    } catch (e) {
      console.error("[whatsapp] falha ao processar", e);
      try {
        await enviarMensagem(msg.telefone, "Tive um problema aqui. Tenta de novo daqui a pouco.");
      } catch {
        // sem como avisar
      }
    }
  });
  return new Response("ok");
}
