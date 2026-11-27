// Sequências (extensão do WhatsApp Web, parte 4, migration 0076): lista ordenada de passos, cada um
// com um texto (escrito no passo ou de uma resposta pronta) e/ou um arquivo da biblioteca de mídia.
// Arquivo puro, sem import, usado pelo app (tela em Configurações) e pela extensão (avanço dos passos
// no painel; extensao/src/sequencias.ts reexporta). Testes em extensao/teste/sequencias.test.ts.
//
// Regra de ouro: cada clique do dono faz UMA ação (põe o texto na caixa ou abre a prévia do anexo)
// e só então o painel aponta para a próxima. Nada de timer nem de passo que anda sozinho.

export const LIMITE_SEQUENCIAS = 50;
export const LIMITE_PASSOS = 20;
export const LIMITE_TITULO_SEQUENCIA = 60;
export const LIMITE_TEXTO_PASSO = 2000;

export type TipoMidiaPasso = "imagem" | "documento" | "audio";

export interface Sequencia {
  id: string;
  titulo: string;
  ordem: number;
}

export interface PassoSequencia {
  id: string;
  sequencia_id: string;
  ordem: number;
  texto: string | null;
  resposta_id: string | null;
  midia_id: string | null;
}

export interface MidiaResumo {
  id: string;
  tipo: TipoMidiaPasso;
  titulo: string;
}

export interface RespostaResumo {
  id: string;
  titulo: string;
  texto: string;
}

const ROTULO_MIDIA: Record<TipoMidiaPasso, string> = { imagem: "foto", documento: "PDF", audio: "áudio" };

// Nome do passo nas listas: título da resposta, começo do texto ou título do arquivo
export function tituloDoPasso(p: PassoSequencia, respostas: RespostaResumo[], midias: MidiaResumo[]): string {
  const resposta = p.resposta_id ? respostas.find((r) => r.id === p.resposta_id) : undefined;
  if (resposta) return resposta.titulo;
  const texto = (p.texto ?? "").replace(/\s+/g, " ").trim();
  if (texto) return texto.length > 60 ? `${texto.slice(0, 59).trimEnd()}…` : texto;
  const midia = p.midia_id ? midias.find((m) => m.id === p.midia_id) : undefined;
  if (midia) return midia.titulo;
  return "Passo vazio";
}

// Detalhe do passo ("Resposta pronta · Foto: Catálogo"). Vazio quando não há o que dizer.
export function detalheDoPasso(p: PassoSequencia, respostas: RespostaResumo[], midias: MidiaResumo[]): string {
  const partes: string[] = [];
  if (p.resposta_id && respostas.some((r) => r.id === p.resposta_id)) partes.push("Resposta pronta");
  else if (p.texto?.trim()) partes.push("Texto");
  const midia = p.midia_id ? midias.find((m) => m.id === p.midia_id) : undefined;
  if (midia) {
    const rotulo = ROTULO_MIDIA[midia.tipo];
    partes.push(`${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)}: ${midia.titulo}`);
  }
  return partes.join(" · ");
}

// Texto que o passo leva, ainda com as variáveis ({pix}, {negocio}); null se não tem texto
export function textoDoPasso(p: PassoSequencia, respostas: RespostaResumo[]): string | null {
  if (p.resposta_id) {
    const r = respostas.find((x) => x.id === p.resposta_id);
    return r?.texto?.trim() ? r.texto : null;
  }
  return p.texto?.trim() ? p.texto : null;
}

export function passoVazio(p: PassoSequencia, respostas: RespostaResumo[], midias: MidiaResumo[]): boolean {
  return textoDoPasso(p, respostas) === null && !(p.midia_id && midias.some((m) => m.id === p.midia_id));
}

// ---------------------------------------------------------------------------------------------
// Avanço no painel

export type Acao = { tipo: "texto"; texto: string } | { tipo: "midia"; midia: MidiaResumo };

export interface PassoRoteiro {
  id: string;
  titulo: string;
  acoes: Acao[];
}

export interface Roteiro {
  titulo: string;
  passos: PassoRoteiro[];
  // passos que ficaram vazios (resposta ou arquivo apagado) e saíram do roteiro
  pulados: number;
}

// Monta o que o painel percorre. `preencher` troca as variáveis pelo dado da conta (a mesma função das
// respostas prontas). Texto que fica vazio depois de preencher não vira ação. Passo sem ação sai.
export function montarRoteiro(
  seq: Sequencia,
  passos: PassoSequencia[],
  respostas: RespostaResumo[],
  midias: MidiaResumo[],
  preencher: (texto: string) => string,
): Roteiro {
  const daSequencia = passos.filter((p) => p.sequencia_id === seq.id).sort((a, b) => a.ordem - b.ordem);
  const lista: PassoRoteiro[] = [];
  let pulados = 0;
  for (const p of daSequencia) {
    const acoes: Acao[] = [];
    const bruto = textoDoPasso(p, respostas);
    const texto = bruto === null ? "" : preencher(bruto);
    if (texto.trim()) acoes.push({ tipo: "texto", texto });
    const midia = p.midia_id ? midias.find((m) => m.id === p.midia_id) : undefined;
    if (midia) acoes.push({ tipo: "midia", midia });
    if (acoes.length === 0) pulados++;
    else lista.push({ id: p.id, titulo: tituloDoPasso(p, respostas, midias), acoes });
  }
  return { titulo: seq.titulo, passos: lista, pulados };
}

// Onde o dono está: passo e ação dentro do passo (texto primeiro, depois o arquivo)
export interface Posicao {
  passo: number;
  acao: number;
}

export const INICIO: Posicao = { passo: 0, acao: 0 };

export function terminou(r: Roteiro, pos: Posicao): boolean {
  return pos.passo >= r.passos.length;
}

// A ação que o próximo clique faz, ou null no fim
export function acaoAtual(r: Roteiro, pos: Posicao): Acao | null {
  return r.passos[pos.passo]?.acoes[pos.acao] ?? null;
}

// Depois que a ação deu certo (texto entrou na caixa, prévia abriu): aponta para a próxima.
// Não faz nada sozinho: só muda o que o próximo clique vai fazer.
export function depoisDaAcao(r: Roteiro, pos: Posicao): Posicao {
  const passo = r.passos[pos.passo];
  if (!passo) return { passo: r.passos.length, acao: 0 };
  if (pos.acao + 1 < passo.acoes.length) return { passo: pos.passo, acao: pos.acao + 1 };
  return { passo: pos.passo + 1, acao: 0 };
}

// Pular: vai para o começo do próximo passo, sem fazer a ação
export function pular(r: Roteiro, pos: Posicao): Posicao {
  return { passo: Math.min(r.passos.length, pos.passo + 1), acao: 0 };
}

// Voltar: no meio de um passo, volta ao começo dele; no começo, ao passo anterior; no fim, ao último
export function voltar(r: Roteiro, pos: Posicao): Posicao {
  if (r.passos.length === 0) return INICIO;
  if (pos.passo >= r.passos.length) return { passo: r.passos.length - 1, acao: 0 };
  if (pos.acao > 0) return { passo: pos.passo, acao: 0 };
  return { passo: Math.max(0, pos.passo - 1), acao: 0 };
}

// "Passo 2 de 4" (no fim, "Fim · 4 de 4")
export function rotuloProgresso(r: Roteiro, pos: Posicao): string {
  const total = r.passos.length;
  if (total === 0) return "Sem passos";
  if (pos.passo >= total) return `Fim · ${total} de ${total}`;
  return `Passo ${pos.passo + 1} de ${total}`;
}

// Rótulo do botão principal: diz o que o clique faz
export function rotuloDaAcao(a: Acao): string {
  return a.tipo === "texto" ? "Inserir texto" : `Anexar ${ROTULO_MIDIA[a.midia.tipo]}`;
}
