import { randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assistenteAtivo, enviarMensagem, extrairMensagem, type MensagemRecebida } from "@/lib/whatsapp/evolution";
import { acessoDoAssistente } from "@/lib/whatsapp/acesso";
import { confirmarSeDispensado, resolverPendente } from "@/lib/whatsapp/acoes";
import { GRUPOS_CONFIRMAVEIS, gruposLiberados, type GrupoConfirmavel } from "@/lib/whatsapp/rascunho";
import { CONFIANCA_MINIMA, SEGUNDOS_MAXIMOS, transcrever, transcricaoAtiva, vozSegura } from "@/lib/whatsapp/transcricao";
import { catalogoDoDono } from "@/lib/whatsapp/produtos";
import { prepararFoto, sugerirProduto } from "@/lib/whatsapp/visao";
import { hojeISO, somarDias } from "@/lib/format";
import { lerCodigo } from "@/lib/whatsapp/vinculo";
import { responder, type Troca } from "@/lib/whatsapp/assistente";
import { AVISO_EM, cotasDa, registrarUso, usoDoMes } from "@/lib/whatsapp/uso";

// Webhook do assistente no WhatsApp. A Evolution chama aqui a cada mensagem recebida.
// Configuração do webhook (cabeçalho com WHATSAPP_WEBHOOK_SECRET): docs/whatsapp-assistente.md.
// A rota fica fora do proxy de sessão (src/proxy.ts), porque quem chama não é um usuário logado.

// a resposta roda em after(): até 5 voltas da IA e consultas ao banco
export const maxDuration = 60;

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
  // a memória e os rascunhos são guardados pelo telefone: com o vínculo novo (talvez de outra conta),
  // nada do que veio antes pode seguir valendo
  await admin.from("whatsapp_conversas").delete().eq("telefone", msg.telefone);
  await admin
    .from("whatsapp_acoes")
    .update({ status: "cancelada", resolvida_em: new Date().toISOString() })
    .eq("telefone", msg.telefone)
    .eq("status", "pendente");
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

// O que o SISTEMA fez de verdade por este número nas últimas horas, lido do registro de lançamentos.
// O modelo recebe isto como fato: sem isso ele não distingue o que foi gravado do que ele só disse,
// e chega a desmentir uma venda que foi lançada.
const SITUACAO: Record<string, string> = {
  executada: "GRAVADO no Marcon",
  pendente: "aguardando o SIM do vendedor, ainda NÃO gravado",
  executando: "sendo gravado agora",
  cancelada: "cancelado, nada foi gravado",
  expirada: "expirou sem SIM, nada foi gravado",
  falhou: "deu erro, nada foi gravado",
};

async function carregarFatos(admin: Admin, owner: string, telefone: string): Promise<string[]> {
  const desde = new Date(Date.now() - HORAS_DE_MEMORIA * 3600_000).toISOString();
  const { data, error } = await admin
    .from("whatsapp_acoes")
    .select("status, resumo, criado_em")
    .eq("owner_id", owner)
    .eq("telefone", telefone)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(6);
  if (error) {
    console.error("[whatsapp] fatos", error.message);
    return [];
  }
  return (data ?? []).reverse().map((a) => {
    const hora = new Date(a.criado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    // do resumo saem o título com pergunta e a linha do SIM: ficam só os dados do lançamento
    const dados = String(a.resumo)
      .split("\n\nResponda")[0]
      .split("\n")
      .filter((l) => l.trim() && !l.includes("Confirma"))
      .map((l) => l.replace(/[*•]/g, "").trim())
      .join("; ");
    return `${hora}: ${dados} (${SITUACAO[a.status] ?? a.status})`;
  });
}

async function guardarTroca(admin: Admin, telefone: string, pergunta: string, resposta: string, fotoPath: string | null = null) {
  const { error } = await admin.from("whatsapp_conversas").insert([
    { telefone, papel: "user", texto: pergunta, foto_path: fotoPath },
    { telefone, papel: "assistant", texto: resposta },
  ]);
  if (error) console.error("[whatsapp] guardar histórico", error.message);
  await apagarAntigos(admin);
}

// prazos que a política de privacidade promete: conversa 24 horas, registro de lançamentos 90 dias
async function apagarAntigos(admin: Admin) {
  const agora = Date.now();
  await apagarFotosSemDono(admin, agora).catch((e) => console.error("[whatsapp] limpar fotos", e));
  await Promise.all([
    admin.from("whatsapp_conversas").delete().lt("criado_em", new Date(agora - 24 * 3600_000).toISOString()),
    admin.from("whatsapp_codigos").delete().lt("expira_em", new Date(agora - 3600_000).toISOString()),
    admin.from("whatsapp_acoes").delete().lt("criado_em", new Date(agora - 90 * 86400_000).toISOString()),
  ]);
}

// Foto de produto que o vendedor mandou e nunca virou produto: some junto com a conversa (24 horas).
// Também vale para a foto de rascunho que foi cancelado, vencido ou trocado (janela de 24 a 48 horas,
// para cada rascunho ser olhado uma vez só). Foto que virou produto está em produto_fotos e não entra aqui.
async function apagarFotosSemDono(admin: Admin, agora: number) {
  const ha = (horas: number) => new Date(agora - horas * 3600_000).toISOString();
  const [conversas, rascunhos] = await Promise.all([
    admin.from("whatsapp_conversas").select("foto_path").not("foto_path", "is", null).lt("criado_em", ha(24)).limit(50),
    admin
      .from("whatsapp_acoes")
      .select("payload")
      .eq("tipo", "produto")
      .neq("status", "executada")
      .lt("criado_em", ha(24))
      .gte("criado_em", ha(48))
      .limit(50),
  ]);
  const caminhos = [
    ...(conversas.data ?? []).map((c) => c.foto_path as string),
    ...(rascunhos.data ?? []).map((a) => (a.payload as { fotoPath?: string | null } | null)?.fotoPath ?? ""),
  ].filter((p) => p && !p.includes(".."));
  if (caminhos.length) await admin.storage.from("produto-fotos").remove(caminhos);
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

function textoAjuda(escrita: boolean) {
  if (!escrita) return TEXTO_AJUDA;
  // quem pode lançar lança todos os grupos: os exemplos mostram todos
  const grupos = gruposLiberados();
  const outros = [
    grupos.includes("produto") ? "• cadastra fone bluetooth a 60" : null,
    grupos.includes("estoque") ? "• chegaram 10 panelas a 40 cada" : null,
    "• o João pagou",
    "• mande a foto de um produto com o preço na legenda",
    grupos.includes("caixa") ? "• paguei 50 de frete" : null,
  ].filter(Boolean);
  const lancar = [outros.length ? "*Lançar*" : "*Lançar venda*", "• vendi 2 controle PS4 por 80 no PIX", ...outros].join("\n");
  return TEXTO_AJUDA.replace("*Loja online*", `${lancar}\n\n*Loja online*`).replace(
    "Por enquanto só consulto, não lanço nada.",
    outros.length ? "Antes de lançar qualquer coisa eu peço o seu SIM, a não ser que você tenha desligado isso em Configurações." : "Antes de lançar uma venda eu peço o seu SIM, a não ser que você tenha desligado isso em Configurações.",
  );
}

const LIMPAR = /^\s*(limpar|nova conversa|reiniciar|recome[cç]ar)\s*[.!]?\s*$/i;

async function processar(entrada: MensagemRecebida, estado: { vinculado: boolean }) {
  let msg = entrada;
  const admin = createAdminClient();
  if (!admin) {
    console.error("[whatsapp] SUPABASE_SERVICE_ROLE_KEY não configurada");
    return;
  }

  // a Evolution pode entregar o mesmo evento mais de uma vez
  if (!(await dentroDoLimite(admin, `wa:msg:${msg.id}`, 1, 3600))) return;

  const codigo = lerCodigo(msg.texto);
  if (codigo) return tentarVincular(admin, msg, codigo);

  const { data: vinculo } = await admin
    .from("whatsapp_vinculos")
    .select("owner_id, lancar_venda, sem_confirmar")
    .eq("telefone", msg.telefone)
    .maybeSingle();
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
  // liberado no /admin (conta por conta) ou admin do Marcon; o admin tem cotas e limites do dia maiores
  const acesso = await acessoDoAssistente(conta.user);
  if (!acesso.usar) return;
  const ehAdminDoMarcon = acesso.admin;
  const { mes: COTA_MES, dia: TETO_DIA } = cotasDa(ehAdminDoMarcon);
  estado.vinculado = true;
  // liberado no /admin E ligado pelo vendedor (interruptor em Configurações)
  const escrita = acesso.lancar && vinculo.lancar_venda !== false;

  // freio geral contra excesso, inclusive de ajuda, limpar, SIM e NÃO (que não contam na cota)
  if (!(await dentroDoLimite(admin, `wa:geral:${owner}`, 150, 86400))) return;

  // mensagem de voz: vira texto aqui, só para quem já está vinculado e liberado (não gasta transcrição
  // com número desconhecido). O resto do fluxo é o mesmo do texto.
  let eco = "";
  let duvidosas: string[] = [];
  let seguraParaDispensarSim = false;
  if (msg.audio) {
    if (!transcricaoAtiva()) {
      await enviarMensagem(msg.telefone, "Ainda não entendo áudio por aqui. Pode escrever?");
      return;
    }
    if (msg.audio.segundos > SEGUNDOS_MAXIMOS) {
      await enviarMensagem(msg.telefone, `Esse áudio ficou longo (limite de ${SEGUNDOS_MAXIMOS} segundos). Manda um menor ou escreve.`);
      return;
    }
    // o vocabulário dele (o que mais vende primeiro) ajuda a transcrição a acertar marca e modelo
    const vocabulario = await catalogoDoDono(admin, owner, somarDias(hojeISO(), -90)).catch(() => []);
    const voz = await transcrever(msg.audio, vocabulario);
    // sem texto, ou o provedor quase não entendeu nada: pedir de novo é melhor que responder a ruído
    if (!voz || (voz.confianca !== null && voz.confianca < CONFIANCA_MINIMA)) {
      await enviarMensagem(msg.telefone, "Não consegui entender o áudio. Pode mandar de novo, mais perto do microfone, ou escrever?");
      return;
    }
    msg = { ...msg, texto: voz.texto };
    duvidosas = voz.duvidosas;
    seguraParaDispensarSim = vozSegura(voz);
    // mostra o que foi entendido: se a transcrição errou um número, o vendedor vê antes de confirmar
    eco = `🎤 _"${voz.texto}"_\n\n`;
  }
  const porAudio = !!msg.audio;

  if (AJUDA.test(msg.texto)) {
    await enviarMensagem(msg.telefone, textoAjuda(escrita));
    return;
  }

  if (LIMPAR.test(msg.texto)) {
    await admin.from("whatsapp_conversas").delete().eq("telefone", msg.telefone);
    await enviarMensagem(msg.telefone, "Conversa reiniciada. Pode perguntar.");
    return;
  }

  const semConfirmar = ((vinculo.sem_confirmar ?? []) as string[]).filter((g): g is GrupoConfirmavel =>
    (GRUPOS_CONFIRMAVEIS as string[]).includes(g),
  );
  const ctx = { owner, telefone: msg.telefone, escrita, user: conta.user ?? undefined, semConfirmar, porAudio, vozSegura: seguraParaDispensarSim, duvidosas, admin: ehAdminDoMarcon };

  // SIM ou NÃO de um rascunho aberto (venda ou outro lançamento): resolvido aqui, pelo servidor, sem passar pelo modelo
  if (escrita && !msg.imagem) {
    const feito = await resolverPendente(admin, ctx, msg.texto);
    if (feito) {
      await enviarMensagem(msg.telefone, eco + feito);
      await guardarTroca(admin, msg.telefone, msg.texto, feito);
      return;
    }
  }

  // cota: só pergunta que usa IA conta (decisão de 2026-10-08: 600 por mês, 40 por dia)
  const usados = await usoDoMes(admin, owner);
  if (usados >= COTA_MES) {
    if (await dentroDoLimite(admin, `wa:aviso-cota:${owner}`, 1, 86400)) {
      await enviarMensagem(
        msg.telefone,
        `Você usou as ${COTA_MES} perguntas deste mês. Volto a responder no dia 1º. Dá para ver o uso em Configurações, no Marcon.`,
      );
    }
    return;
  }
  if (!(await dentroDoLimite(admin, `wa:dia:${owner}`, TETO_DIA, 86400))) {
    if (await dentroDoLimite(admin, `wa:aviso-limite:${owner}`, 1, 86400)) {
      await enviarMensagem(msg.telefone, `Você chegou nas ${TETO_DIA} perguntas de hoje. Amanhã eu volto a responder.`);
    }
    return;
  }

  // foto de produto: guarda no bucket (pasta do dono), pede ao modelo o nome e a categoria e entrega tudo
  // ao assistente como uma mensagem só; o cadastro em si é o preparar_produto, com o SIM de sempre
  let foto: { path: string; usada: boolean } | undefined;
  if (msg.imagem) {
    if (!escrita) {
      await enviarMensagem(msg.telefone, "Por aqui eu ainda não cadastro produto pela foto. Faça pelo Marcon.");
      return;
    }
    const preparada = msg.imagem.base64 ? await prepararFoto(msg.imagem.base64) : null;
    if (!preparada) {
      await enviarMensagem(msg.telefone, "Não consegui abrir essa foto. Pode mandar de novo?");
      return;
    }
    const path = `${owner}/whatsapp/${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
    const { error: erroFoto } = await admin.storage.from("produto-fotos").upload(path, preparada.buffer, { contentType: "image/jpeg" });
    if (erroFoto) throw erroFoto;
    foto = { path, usada: false };

    const { data: cats } = await admin.from("categorias").select("nome").eq("owner_id", owner).order("nome").limit(60);
    const sugestao = await sugerirProduto(preparada, (cats ?? []).map((c) => c.nome as string), msg.texto).catch((e) => {
      console.error("[whatsapp] visão", e);
      return null;
    });
    const legenda = msg.texto ? ` Legenda do vendedor: "${msg.texto}".` : " Sem legenda.";
    msg = {
      ...msg,
      texto: sugestao
        ? `[Foto de produto recebida e guardada. O sistema identificou: nome "${sugestao.nome}"${sugestao.categoria ? `, categoria "${sugestao.categoria}"` : ""}.${legenda}]`
        : `[Foto de produto recebida e guardada, mas o sistema não conseguiu identificar o produto.${legenda}]`,
    };
  }

  const [historico, fatos, catalogo] = await Promise.all([
    carregarHistorico(admin, msg.telefone),
    carregarFatos(admin, owner, msg.telefone),
    catalogoDoDono(admin, owner, somarDias(hojeISO(), -90)).catch(() => [] as string[]),
  ]);
  const respostaDoModelo = await responder(msg.texto, { ...ctx, foto, fatos, catalogo }, historico);
  await registrarUso(admin, owner);
  // tipo com confirmação desligada em Configurações: o servidor resolve o rascunho na hora (nunca por voz)
  const resposta = (escrita && (await confirmarSeDispensado(admin, ctx, respostaDoModelo))) || respostaDoModelo;
  // aviso único ao passar de 80% da cota, para o limite não pegar de surpresa
  const agora = usados + 1;
  const aviso =
    usados < COTA_MES * AVISO_EM && agora >= COTA_MES * AVISO_EM
      ? `\n\n_Você já usou ${agora} de ${COTA_MES} perguntas deste mês._`
      : "";
  await enviarMensagem(msg.telefone, eco + resposta + aviso);
  // a foto que não virou rascunho fica ligada a esta troca por 30 minutos, esperando o preço
  await guardarTroca(admin, msg.telefone, msg.texto, resposta, foto && !foto.usada ? foto.path : null);
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
    const estado = { vinculado: false };
    try {
      await processar(msg, estado);
    } catch (e) {
      console.error("[whatsapp] falha ao processar", e);
      // só avisa quem é usuário liberado: um erro não pode virar mensagem para qualquer contato
      if (!estado.vinculado) return;
      try {
        await enviarMensagem(msg.telefone, "Tive um problema aqui. Tenta de novo daqui a pouco.");
      } catch {
        // sem como avisar
      }
    }
  });
  return new Response("ok");
}
