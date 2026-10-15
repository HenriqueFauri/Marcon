// Teste de comportamento do assistente do WhatsApp: roda conversas de verdade contra o Staging
// (modelo real, banco real de teste) e confere se ele entendeu, usou a ferramenta certa, respondeu
// curto e sem passar do ponto. É como a gente "treina": cada ajuste no prompt ou no código só vale
// se os casos continuam passando e o placar melhora.
//
// Uso (na raiz do repositório, com .env.staging presente):
//   npx --yes tsx --conditions=react-server scripts/eval-assistente.ts [filtro] [--vezes=2]
// "filtro" roda só os casos cujo nome contém o texto. Nada é gravado de verdade: o assistente só
// PREPARA rascunhos (apagados no fim); quem grava é o SIM, que este teste nunca manda.
import { readFileSync } from "node:fs";
import path from "node:path";

const STAGING_REF = "odgvhqwqyxtnaxgqiynb";

const raiz = process.cwd();
for (const linha of readFileSync(path.join(raiz, ".env.staging"), "utf8").split("\n")) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.trim().startsWith("#")) process.env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^"|"$/g, "").replace(/\r$/, "");
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_REF)) {
  console.error("Este teste só roda contra o Staging. Confira o .env.staging.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY no .env.staging.");
  process.exit(1);
}
process.env.WHATSAPP_LANCAMENTOS = process.env.WHATSAPP_LANCAMENTOS || "produto,estoque,caixa";

const TELEFONE = "5500000000000"; // número de mentira: o rascunho nasce e morre nele

interface Espera {
  ferramentas?: string[]; // todas estas devem ter sido chamadas
  semFerramentas?: boolean; // nenhuma ferramenta (conversa, recusa, pedido de repetir)
  contem?: (string | RegExp)[]; // todos devem aparecer na resposta
  naoContem?: (string | RegExp)[];
  rascunho?: boolean; // a resposta é um rascunho a confirmar (pede o SIM)
  voltasMax?: number;
}
interface Turno {
  diz: string;
  voz?: string[]; // veio de áudio; as palavras em dúvida da transcrição
  fatos?: string[]; // o registro do sistema que o assistente recebe (o que foi gravado ou não)
  espera: Espera;
}
interface Caso {
  nome: string;
  inicio?: { papel: "user" | "assistant"; texto: string }[]; // conversa que já estava rolando
  turnos: Turno[];
}

const RASCUNHO = /Responda \*SIM\*/;

const CASOS: Caso[] = [
  // consultas do dia a dia
  { nome: "vendas de hoje", turnos: [{ diz: "quanto vendi hoje?", espera: { ferramentas: ["resumo_de_vendas"], voltasMax: 2 } }] },
  { nome: "vendas da semana passada", turnos: [{ diz: "Quanto que eu vendi semana passada?", voz: [], espera: { ferramentas: ["resumo_de_vendas"], contem: [/R\$/], voltasMax: 2 } }] },
  { nome: "o que está acabando", turnos: [{ diz: "o que está acabando?", espera: { ferramentas: ["produtos_por_estoque"], voltasMax: 2 } }] },
  { nome: "quem me deve", turnos: [{ diz: "quem está me devendo?", espera: { ferramentas: ["contas_a_receber"], voltasMax: 2 } }] },
  { nome: "caixa do mês", turnos: [{ diz: "como está o caixa do mês?", espera: { ferramentas: ["caixa_do_periodo"], voltasMax: 2 } }] },
  { nome: "estoque total", turnos: [{ diz: "quanto tenho de estoque no total?", espera: { ferramentas: ["resumo_do_estoque"], voltasMax: 2 } }] },
  { nome: "mais vendidos", turnos: [{ diz: "o que mais vendi esse mês?", espera: { ferramentas: ["produtos_vendidos"], voltasMax: 2 } }] },

  // produto: achar, preço, sem despejar custo
  { nome: "tem produto", turnos: [{ diz: "tem relógio?", espera: { ferramentas: ["buscar_produtos"], contem: [/Tomi/], naoContem: [/custo/i], voltasMax: 2 } }] },
  { nome: "preço sem custo", turnos: [{ diz: "quanto custa o smartwatch?", espera: { ferramentas: ["buscar_produtos"], contem: [/79,90/], naoContem: [/custo/i], voltasMax: 2 } }] },
  { nome: "custo quando pergunta", turnos: [{ diz: "qual o custo do smartwatch d20?", espera: { ferramentas: ["buscar_produtos"], contem: [/custo|custa .*para voc/i, /32,00/], voltasMax: 2 } }] },
  { nome: "nome errado: pergunta se é esse", turnos: [{ diz: "tem relógio tommy?", voz: [], espera: { ferramentas: ["buscar_produtos"], contem: [/Tomi/], voltasMax: 2 } }] },
  { nome: "produto que não existe", turnos: [{ diz: "tem parafusadeira?", espera: { ferramentas: ["buscar_produtos"], contem: [/n[aã]o (achei|encontr|tenho|tem)/i], naoContem: [/\d+ unidades? de parafusadeira/i], voltasMax: 2 } }] },
  { nome: "variação em seguida", turnos: [
    { diz: "tem relógio tomi?", espera: { ferramentas: ["buscar_produtos"], contem: [/Preto/, /Prata/], voltasMax: 2 } },
    { diz: "e a prata?", espera: { contem: [/129/], voltasMax: 2 } },
  ] },

  // lançar venda: direto, sem entrevista
  { nome: "venda completa", turnos: [{ diz: "vendi um smartwatch d20 por 79,90 no pix", espera: { rascunho: true, contem: [/Smartwatch D20/, /79,90/, /PIX/i], voltasMax: 3 } }] },
  { nome: "venda sem preço usa o cadastro", turnos: [{ diz: "vendi 2 carregador turbo", espera: { rascunho: true, contem: [/2x Carregador Turbo/], voltasMax: 3 } }] },
  { nome: "venda por voz com ruído", turnos: [{ diz: "Cowboyzinho, eu acabei de vender um smartwatch d20", voz: ["Cowboyzinho"], espera: { rascunho: true, contem: [/Smartwatch D20/], voltasMax: 3 } }] },
  { nome: "vendi depois de consultar", turnos: [
    { diz: "tem relógio tomi?", espera: { ferramentas: ["buscar_produtos"], voltasMax: 2 } },
    { diz: "vendi a prata", espera: { rascunho: true, contem: [/Tomi/, /Prata/], voltasMax: 3 } },
  ] },
  { nome: "vendi em partes soltas (voz fragmentada)", turnos: [
    { diz: "fica qual relógio que tem no estoque?", voz: [], espera: { ferramentas: ["buscar_produtos"], voltasMax: 3 } },
    { diz: "prata", voz: [], espera: { voltasMax: 2 } },
    { diz: "vendi", voz: [], espera: { rascunho: true, contem: [/Prata/], voltasMax: 3 } },
  ] },
  { nome: "vendi em partes: preço depois", turnos: [
    { diz: "tem relógio tomi?", espera: { ferramentas: ["buscar_produtos"], voltasMax: 2 } },
    { diz: "vendi a prata", espera: { rascunho: true, voltasMax: 3 } },
    { diz: "na verdade foi 120 no pix", espera: { rascunho: true, contem: [/120/, /PIX/i], voltasMax: 3 } },
  ] },
  { nome: "venda ambígua pergunta qual", turnos: [{ diz: "vendi uma torneira", espera: { semFerramentas: false, contem: [/(preta|cromada)/i], naoContem: [RASCUNHO], voltasMax: 3 } }] },
  { nome: "venda a prazo sem a palavra fiado", turnos: [{ diz: "vendi um smartwatch d20 pra Maria, ela paga mês que vem", espera: { naoContem: [/fiado/i], voltasMax: 3 } }] },
  { nome: "venda sem produto no cadastro", turnos: [{ diz: "vendi uma parafusadeira por 200", espera: { naoContem: [RASCUNHO], contem: [/n[aã]o (achei|encontr)/i], voltasMax: 3 } }] },

  // jeito solto de falar
  { nome: "dois itens na mesma venda", turnos: [{ diz: "vendi o d20 e um carregador turbo", espera: { rascunho: true, contem: [/Smartwatch D20/, /Carregador Turbo/], voltasMax: 3 } }] },
  { nome: "quantidade e valor unitário", turnos: [{ diz: "saíram 3 fone kz a 50 cada no cartão", espera: { rascunho: true, contem: [/3x Fone/, /150/], voltasMax: 3 } }] },
  { nome: "e ontem? continua o assunto", turnos: [
    { diz: "quanto vendi hoje?", espera: { ferramentas: ["resumo_de_vendas"], voltasMax: 2 } },
    { diz: "e ontem?", espera: { ferramentas: ["resumo_de_vendas"], voltasMax: 2 } },
  ] },
  { nome: "lucro do mês", turnos: [{ diz: "quanto lucrei esse mês?", espera: { ferramentas: ["resumo_de_vendas"], contem: [/lucro/i], voltasMax: 2 } }] },
  { nome: "recorte por forma de pagamento", turnos: [{ diz: "quanto entrou de pix essa semana?", espera: { ferramentas: ["vendas_por_recorte"], voltasMax: 2 } }] },
  { nome: "pedidos da loja", turnos: [{ diz: "chegou pedido na loja?", espera: { ferramentas: ["pedidos_da_vitrine"], voltasMax: 2 } }] },
  { nome: "sinônimo de produto", turnos: [{ diz: "tem fone de ouvido?", espera: { ferramentas: ["buscar_produtos"], contem: [/KZ/i], voltasMax: 2 } }] },
  { nome: "pergunta de estoque de um item", turnos: [{ diz: "quantos d20 eu tenho?", espera: { ferramentas: ["buscar_produtos"], contem: [/\d+ unidade/], voltasMax: 2 } }] },
  { nome: "venda e pergunta juntas", turnos: [{ diz: "vendi um d20 e quanto tenho de estoque do carregador?", espera: { contem: [/Carregador/i], voltasMax: 4 } }] },
  { nome: "errei, desfaz", turnos: [{ diz: "errei, desfaz a última venda", espera: { semFerramentas: true, contem: [/Marcon/], voltasMax: 1 } }] },

  // fala solta, números e datas
  { nome: "por 80 com 2 itens é o total", turnos: [{ diz: "vendi 2 carregador turbo por 80 no pix", espera: { rascunho: true, contem: [/2x Carregador/, /Total: \*R\$\s80,00\*/], voltasMax: 3 } }] },
  { nome: "80 cada é unitário", turnos: [{ diz: "vendi 2 carregador turbo a 80 cada no pix", espera: { rascunho: true, contem: [/Total: \*R\$\s160,00\*/], voltasMax: 3 } }] },
  { nome: "número por extenso", turnos: [{ diz: "vendi dois carregador turbo por oitenta reais", voz: [], espera: { rascunho: true, contem: [/2x Carregador/, /80,00/], voltasMax: 3 } }] },
  { nome: "venda de ontem", turnos: [{ diz: "vendi ontem um smartwatch d20 no pix", espera: { rascunho: true, contem: [/Data da venda/], voltasMax: 3 } }] },
  { nome: "venda com cliente", turnos: [{ diz: "vendi um d20 pro João no pix", espera: { rascunho: true, contem: [/João/], voltasMax: 3 } }] },
  { nome: "correção no meio", turnos: [
    { diz: "vendi 2 smartwatch d20", espera: { rascunho: true, contem: [/2x Smartwatch/], voltasMax: 3 } },
    { diz: "na verdade foram 3", espera: { rascunho: true, contem: [/3x Smartwatch/], voltasMax: 3 } },
  ] },
  { nome: "baixa de estoque com motivo", turnos: [{ diz: "dá baixa em 1 carregador turbo, quebrou", espera: { rascunho: true, contem: [/Carregador Turbo/, /(perda|quebra)/i], voltasMax: 3 } }] },
  { nome: "áudio longo e enrolado", turnos: [{ diz: "Então, eu tava aqui na loja e chegou um cliente, aí eu vendi um smartwatch d20 pra ele, ficou 75, ele pagou no pix, foi isso", voz: [], espera: { rascunho: true, contem: [/Smartwatch D20/, /75,00/, /PIX/i], voltasMax: 3 } }] },
  { nome: "duas vendas na mesma frase", turnos: [{ diz: "vendi um d20 por 80 e um fone kz por 60, os dois no pix", espera: { rascunho: true, contem: [/Smartwatch D20/, /Fone/, /140,00/], voltasMax: 3 } }] },
  { nome: "pergunta sem pontuação", turnos: [{ diz: "tem d20", espera: { ferramentas: ["buscar_produtos"], contem: [/D20/], voltasMax: 2 } }] },
  { nome: "só o nome do produto", turnos: [{ diz: "carregador", espera: { ferramentas: ["buscar_produtos"], contem: [/Carregador/], voltasMax: 2 } }] },
  { nome: "quanto falta do produto", turnos: [{ diz: "quanto tenho de panela?", espera: { ferramentas: ["buscar_produtos"], contem: [/1/], voltasMax: 2 } }] },

  // o registro do sistema manda: nunca desmentir nem inventar
  { nome: "lançou? confirma pelo registro", turnos: [{ diz: "Lançou?", fatos: ["15:44: 1x Relógio Tomi (Preto) a R$ 119,00; Total: R$ 119,00; Pagamento: PIX (GRAVADO no Marcon)"], espera: { semFerramentas: true, contem: [/(sim|lançad|gravad)/i, /119/], naoContem: [/desculp/i, /n[aã]o (foi|consegui confirmar)/i], voltasMax: 1 } }] },
  { nome: "lançou? sem registro não inventa", turnos: [{ diz: "Lançou?", espera: { semFerramentas: true, naoContem: [/^sim/i, /^foi (lançad|gravad)/i, /outro aparelho/i, /salv/i], voltasMax: 1 } }] },

  // uma confirmação só (conversas reais que falharam no WhatsApp em 13/10)
  { nome: "relógio genérico: pergunta entre os dois", turnos: [{ diz: "Acabei de vender mais um relógio.", voz: [], espera: { contem: [/Tomi/, /Smartwatch/i], naoContem: [RASCUNHO], voltasMax: 3 } }] },
  { nome: "escolhe um dos dois: prepara na hora", turnos: [
    { diz: "Acabei de vender mais um relógio.", voz: [], espera: { contem: [/Tomi/, /Smartwatch/i], voltasMax: 3 } },
    { diz: "o smartwatch", voz: [], espera: { rascunho: true, contem: [/Smartwatch D20/], voltasMax: 3 } },
  ] },
  { nome: "só uma variação com estoque: sem pergunta", turnos: [{ diz: "vendi mais um relógio tomi", espera: { rascunho: true, contem: [/Tomi/, /Prata/], naoContem: [/é esse/i, /quis dizer/i], voltasMax: 3 } }] },
  { nome: "corrige o produto do rascunho", inicio: [
    { papel: "user", texto: "Acabou de sair um relógio aqui." },
    { papel: "assistant", texto: "*Confirma esta venda?*\n• 1x Relógio Tomi (Prata) a R$ 129,00\nTotal: *R$ 129,00*\n\nResponda *SIM* para lançar ou *NÃO* para cancelar. Vale por 10 minutos." },
  ], turnos: [{ diz: "Eu disse que na real foi o smartwatch que foi vendido.", voz: [], espera: { rascunho: true, contem: [/Smartwatch D20/], voltasMax: 3 } }] },
  { nome: "sinônimo: fone de ouvido na venda", turnos: [{ diz: "vendi um fone de ouvido", espera: { rascunho: true, contem: [/Fone Bluetooth KZ/], voltasMax: 3 } }] },

  // outros lançamentos
  { nome: "entrada de estoque", turnos: [{ diz: "chegaram 10 cabo usb a 5 cada", espera: { rascunho: true, contem: [/Cabo USB/i, /10/], voltasMax: 3 } }] },
  { nome: "despesa no caixa", turnos: [{ diz: "paguei 50 de frete", espera: { rascunho: true, contem: [/50/], voltasMax: 3 } }] },

  // não entender, conversa, fora do escopo
  { nome: "ruído de voz pede repetir", turnos: [{ diz: "Você pinchá?", voz: ["pinchá"], espera: { semFerramentas: true, naoContem: [RASCUNHO], voltasMax: 1 } }] },
  { nome: "conversa curta", turnos: [{ diz: "tudo bem?", espera: { semFerramentas: true, voltasMax: 1 } }] },
  { nome: "fora do escopo", turnos: [{ diz: "escreve um poema sobre o mar", espera: { semFerramentas: true, voltasMax: 1 } }] },
  { nome: "apagar é só no app", turnos: [{ diz: "apaga a venda de ontem", espera: { semFerramentas: true, contem: [/Marcon/], voltasMax: 1 } }] },
];

// regras que valem para TODA resposta
function regrasGerais(resposta: string, voz: boolean): string[] {
  const erros: string[] = [];
  if (/[—–]/.test(resposta)) erros.push("usou travessão");
  if (/fiado/i.test(resposta)) erros.push('usou "fiado"');
  if (resposta.length > 700 && !RASCUNHO.test(resposta)) erros.push(`resposta longa (${resposta.length} caracteres)`);
  if (/ferramenta|função|\bJSON\b|buscar_produtos/i.test(resposta)) erros.push("falou de ferramenta");
  if (voz && /desculp/i.test(resposta)) erros.push("pediu desculpa à toa");
  return erros;
}

function confere(e: Espera, resposta: string, ferramentas: string[], voltas: number): string[] {
  const erros: string[] = [];
  for (const f of e.ferramentas ?? []) if (!ferramentas.includes(f)) erros.push(`não chamou ${f} (chamou: ${ferramentas.join(", ") || "nada"})`);
  if (e.semFerramentas === true && ferramentas.length) erros.push(`chamou ferramenta à toa (${ferramentas.join(", ")})`);
  for (const c of e.contem ?? []) if (!(c instanceof RegExp ? c.test(resposta) : resposta.includes(c))) erros.push(`faltou ${c}`);
  for (const c of e.naoContem ?? []) if (c instanceof RegExp ? c.test(resposta) : resposta.includes(c)) erros.push(`não devia ter ${c}`);
  if (e.rascunho === true && !RASCUNHO.test(resposta)) erros.push("era para abrir rascunho (pedir SIM)");
  if (e.voltasMax && voltas > e.voltasMax) erros.push(`${voltas} voltas (máximo ${e.voltasMax})`);
  return erros;
}

async function main() {
  const filtro = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const vezes = Number(process.argv.find((a) => a.startsWith("--vezes="))?.split("=")[1] ?? 1);

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { responder } = await import("@/lib/whatsapp/assistente");
  const admin = createAdminClient();
  if (!admin) throw new Error("Sem chave de serviço do Staging");
  const { data: vinculo } = await admin.from("whatsapp_vinculos").select("owner_id").limit(1).maybeSingle();
  if (!vinculo) throw new Error("Nenhuma conta vinculada no Staging");
  const owner = vinculo.owner_id as string;
  // o mesmo catálogo que o assistente recebe no WhatsApp (os mais vendidos primeiro)
  const { catalogoDoDono } = await import("@/lib/whatsapp/produtos");
  const { somarDias, hojeISO } = await import("@/lib/format");
  const catalogo = await catalogoDoDono(admin, owner, somarDias(hojeISO(), -90));

  const limpar = () => admin.from("whatsapp_acoes").delete().eq("telefone", TELEFONE);
  await limpar();

  let ok = 0;
  let total = 0;
  let ms = 0;
  let tokens = 0;
  const falhas: string[] = [];

  for (const caso of CASOS.filter((c) => !filtro || c.nome.includes(filtro))) {
    for (let v = 0; v < vezes; v++) {
      const historico: { papel: "user" | "assistant"; texto: string }[] = [...(caso.inicio ?? [])];
      const linhas: string[] = [];
      let casoOk = true;
      for (const t of caso.turnos) {
        const rastro = { voltas: 0, ferramentas: [] as string[], tokens: 0 };
        const inicio = Date.now();
        let resposta = "";
        try {
          resposta = await responder(t.diz, { owner, telefone: TELEFONE, escrita: true, porAudio: !!t.voz, duvidosas: t.voz, fatos: t.fatos, catalogo, rastro }, historico);
        } catch (e) {
          resposta = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
        }
        const dt = Date.now() - inicio;
        ms += dt;
        tokens += rastro.tokens;
        const erros = [...confere(t.espera, resposta, rastro.ferramentas, rastro.voltas), ...regrasGerais(resposta, !!t.voz)];
        if (resposta.startsWith("ERRO")) erros.push(resposta);
        linhas.push(`   > ${t.diz}${t.voz ? "  🎤" : ""}\n   < ${resposta.replace(/\n/g, " | ").slice(0, 230)}\n     (${rastro.voltas} volta(s), ${(dt / 1000).toFixed(1)}s, ${rastro.tokens} tokens${rastro.ferramentas.length ? ", " + rastro.ferramentas.join("+") : ""})`);
        for (const e of erros) linhas.push(`     ✗ ${e}`);
        if (erros.length) casoOk = false;
        historico.push({ papel: "user", texto: t.diz }, { papel: "assistant", texto: resposta });
        await limpar(); // um rascunho aberto por número: cada turno começa limpo
      }
      total++;
      if (casoOk) ok++;
      else falhas.push(caso.nome);
      console.log(`${casoOk ? "✓" : "✗"} ${caso.nome}${vezes > 1 ? ` (#${v + 1})` : ""}`);
      if (!casoOk || process.env.VERBOSO) console.log(linhas.join("\n"));
    }
  }
  await limpar();
  console.log(`\nPlacar: ${ok}/${total} casos. Média ${(ms / Math.max(total, 1) / 1000).toFixed(1)}s e ${Math.round(tokens / Math.max(total, 1))} tokens por caso.`);
  if (falhas.length) console.log(`Falharam: ${[...new Set(falhas)].join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
