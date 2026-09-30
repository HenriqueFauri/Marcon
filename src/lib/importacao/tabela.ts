import type { Item, Linha, Pagina } from "./tipos";

// Leitor de tabelas de PDF pela posição das colunas.
// O PDF não tem "tabela": só textos soltos com coordenadas. Cada texto vai para a
// coluna mais próxima do seu início, usando o ponto médio entre os cabeçalhos como
// divisa (números alinhados à direita começam um pouco antes do cabeçalho).

const TOLERANCIA_Y = 2.5;

export function agruparLinhas(itens: Item[]): Linha[] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const item of ordenados) {
    const atual = linhas[linhas.length - 1];
    if (atual && Math.abs(atual.y - item.y) <= TOLERANCIA_Y) atual.itens.push(item);
    else linhas.push({ y: item.y, itens: [item] });
  }
  for (const l of linhas) l.itens.sort((a, b) => a.x - b.x);
  return linhas;
}

export function textoDaLinha(linha: Linha) {
  return linha.itens.map((i) => i.texto).join(" ");
}

interface Coluna {
  nome: string;
  x: number;
}

const norm = (s: string) => s.trim().toLowerCase();

function acharCabecalho(pagina: Pagina, nomes: string[]) {
  for (let i = 0; i < pagina.length; i++) {
    const colunas: Coluna[] = [];
    for (const nome of nomes) {
      const item = pagina[i].itens.find((t) => norm(t.texto) === norm(nome));
      if (!item) break;
      colunas.push({ nome, x: item.x });
    }
    if (colunas.length === nomes.length) return { indice: i, colunas };
  }
  return null;
}

function colunaDe(x: number, colunas: Coluna[]) {
  for (let i = colunas.length - 1; i > 0; i--) {
    if (x >= (colunas[i - 1].x + colunas[i].x) / 2) return i;
  }
  return 0;
}

function celulas(linha: Linha, colunas: Coluna[]): string[] {
  const partes: string[][] = colunas.map(() => []);
  for (const item of linha.itens) partes[colunaDe(item.x, colunas)].push(item.texto);
  return partes.map((p) => p.join(" ").trim());
}

// um registro é a linha que começa o item + as que vêm "coladas" depois
// (nome que quebrou em duas linhas, sub-itens de uma venda, etc.)
export interface Registro {
  cel: string[];
  seguintes: string[][];
}

// junta a linha principal com as seguintes, coluna a coluna (nome que quebrou em duas linhas)
export function juntar(reg: Registro): string[] {
  return reg.cel.map((c, i) => [c, ...reg.seguintes.map((s) => s[i])].filter(Boolean).join(" ").trim());
}

interface Regras {
  ehInicio: (cel: string[]) => boolean;
  ehFim: (texto: string) => boolean;
  ignorar: (texto: string) => boolean;
}

export function lerTabela(paginas: Pagina[], nomes: string[], regras: Regras): Registro[] {
  const registros: Registro[] = [];
  for (const pagina of paginas) {
    const cab = acharCabecalho(pagina, nomes);
    if (!cab) continue;
    for (const linha of pagina.slice(cab.indice + 1)) {
      const texto = textoDaLinha(linha);
      if (regras.ehFim(texto)) return registros;
      if (regras.ignorar(texto)) continue;
      const cel = celulas(linha, cab.colunas);
      if (regras.ehInicio(cel)) registros.push({ cel, seguintes: [] });
      else if (registros.length > 0) registros[registros.length - 1].seguintes.push(cel);
    }
  }
  return registros;
}

// valor que o relatório informa junto de um rótulo, ex.: "Total vendido | R$ 1.212,00".
// O mesmo rótulo aparece também numa linha de cabeçalho (sem valor): `aceita` pula essas.
export function valorDoRotulo(paginas: Pagina[], rotulo: RegExp, aceita: RegExp = /\d/): string | null {
  for (const pagina of paginas) {
    for (const linha of pagina) {
      const i = linha.itens.findIndex((t) => rotulo.test(t.texto));
      if (i < 0) continue;
      const resto = linha.itens.slice(i + 1).map((t) => t.texto).join(" ");
      if (resto && aceita.test(resto)) return resto;
    }
  }
  return null;
}
