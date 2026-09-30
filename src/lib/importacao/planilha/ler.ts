// Leitura de planilhas (CSV e Excel .xlsx) sem biblioteca de planilha: o .xlsx é um
// zip de XMLs simples, e ler só os valores é pouco código. Roda no navegador, então
// a planilha não sobe para o servidor e não tem limite de tamanho do envio.
import { unzipSync, strFromU8 } from "fflate";
import { ErroDeLeitura } from "../tipos";

// texto, número, data já convertida ("2026-09-22") ou vazio
export type Celula = string | number | null;

export interface Aba {
  nome: string;
  linhas: Celula[][];
}

const MAX_LINHAS = 20000;

export function tipoDePlanilha(nome: string): "csv" | "xlsx" | "antiga" | null {
  const n = nome.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".txt")) return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return "xlsx";
  if (n.endsWith(".xls") || n.endsWith(".ods") || n.endsWith(".numbers")) return "antiga";
  return null;
}

export function lerPlanilha(nome: string, dados: Uint8Array): Aba[] {
  const tipo = tipoDePlanilha(nome);
  if (tipo === "csv") return [{ nome: nome.replace(/\.[^.]+$/, ""), linhas: lerCsv(dados) }];
  if (tipo === "xlsx") return lerXlsx(dados);
  throw new ErroDeLeitura("Salve a planilha como Excel (.xlsx) ou CSV e envie de novo.");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Excel em português salva CSV em Windows-1252 e com ";"; Google Planilhas, em UTF-8 e com ","
function decodificar(dados: Uint8Array) {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(dados);
  } catch {
    texto = new TextDecoder("windows-1252").decode(dados);
  }
  return texto.replace(/^﻿/, "");
}

function separador(texto: string) {
  const amostra = texto.split(/\r?\n/).slice(0, 20).join("\n").replace(/"[^"]*"/g, "");
  let melhor = ",";
  let maior = 0;
  for (const s of [";", ",", "\t", "|"]) {
    const n = amostra.split(s).length - 1;
    if (n > maior) {
      maior = n;
      melhor = s;
    }
  }
  return melhor;
}

export function lerCsv(dados: Uint8Array): Celula[][] {
  const texto = decodificar(dados);
  const sep = separador(texto);
  const linhas: Celula[][] = [];
  let linha: Celula[] = [];
  let campo = "";
  let aspas = false;

  const fecharCampo = () => {
    const t = campo.trim();
    linha.push(t === "" ? null : t);
    campo = "";
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) fecharCampo();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fecharCampo();
      linhas.push(linha);
      linha = [];
      if (linhas.length > MAX_LINHAS) throw new ErroDeLeitura(`A planilha passa de ${MAX_LINHAS} linhas. Divida em partes.`);
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    fecharCampo();
    linhas.push(linha);
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function desescapar(s: string) {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function atributo(tag: string, nome: string) {
  const m = tag.match(new RegExp(`(?:^|\\s)${nome}="([^"]*)"`));
  return m ? desescapar(m[1]) : null;
}

// junta os pedaços de texto de uma célula (texto com formatação vem em vários <t>)
function textoDe(xml: string) {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let t = "";
  for (const m of semFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += m[1];
  return desescapar(t);
}

// formatos de data do Excel: embutidos (14–22, 45–47) e personalizados com d/m/a
const FORMATOS_DATA = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function estilosDeData(xml: string | undefined): boolean[] {
  if (!xml) return [];
  const personalizados = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(atributo(m[1], "numFmtId"));
    const codigo = atributo(m[1], "formatCode") ?? "";
    personalizados.set(id, codigo);
  }
  const bloco = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  return [...bloco.matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => {
    const id = Number(atributo(m[1], "numFmtId") ?? 0);
    if (FORMATOS_DATA.has(id)) return true;
    const codigo = personalizados.get(id);
    if (!codigo) return false;
    const limpo = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").toLowerCase();
    return /[dy]/.test(limpo);
  });
}

function serialParaData(serial: number, base1904: boolean) {
  const dias = Math.floor(serial) + (base1904 ? 1462 : 0);
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function colunaDe(ref: string) {
  let n = 0;
  for (const c of ref.replace(/\d+/g, "").toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function caminho(alvo: string) {
  if (alvo.startsWith("/")) return alvo.slice(1);
  return `xl/${alvo.replace(/^\.\//, "")}`;
}

export function lerXlsx(dados: Uint8Array): Aba[] {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(dados, {
      filter: (f) =>
        f.name.startsWith("xl/") &&
        (f.name.endsWith(".xml") || f.name.endsWith(".rels")) &&
        !f.name.includes("/drawings/") &&
        !f.name.includes("/charts/") &&
        !f.name.includes("/media/"),
    });
  } catch {
    throw new ErroDeLeitura("Não consegui abrir este arquivo do Excel. Ele pode estar corrompido ou protegido por senha.");
  }
  const xml = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]) : undefined);

  const workbook = xml("xl/workbook.xml");
  if (!workbook) throw new ErroDeLeitura("Este arquivo não parece uma planilha do Excel.");
  const base1904 = /date1904="(1|true)"/.test(workbook);

  const rels = new Map<string, string>();
  for (const m of (xml("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = atributo(m[1], "Id");
    const alvo = atributo(m[1], "Target");
    if (id && alvo) rels.set(id, caminho(alvo));
  }

  const compartilhados = [...(xml("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const ehData = estilosDeData(xml("xl/styles.xml"));

  const abas: Aba[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nome = atributo(m[1], "name") ?? `Aba ${abas.length + 1}`;
    const id = atributo(m[1], "r:id");
    const conteudo = id ? xml(rels.get(id) ?? "") : undefined;
    if (!conteudo) continue;
    if (atributo(m[1], "state") === "hidden" || atributo(m[1], "state") === "veryHidden") continue;
    abas.push({ nome, linhas: lerAba(conteudo, compartilhados, ehData, base1904) });
  }
  if (abas.length === 0) throw new ErroDeLeitura("Não achei nenhuma aba com dados nesta planilha.");
  return abas;
}

function lerAba(xml: string, compartilhados: string[], ehData: boolean[], base1904: boolean): Celula[][] {
  const linhas: Celula[][] = [];
  let proxima = 0;
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(atributo(r[1], "r"));
    const indice = Number.isFinite(numero) && numero > 0 ? numero - 1 : proxima;
    proxima = indice + 1;
    if (indice >= MAX_LINHAS) throw new ErroDeLeitura(`A planilha passa de ${MAX_LINHAS} linhas. Divida em partes.`);
    const linha: Celula[] = [];
    let col = 0;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(c[1], "r");
      if (ref) col = colunaDe(ref);
      const tipo = atributo(c[1], "t");
      const estilo = Number(atributo(c[1], "s") ?? 0);
      const corpo = c[2] ?? "";
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor: Celula = null;
      if (tipo === "s") valor = v != null ? (compartilhados[Number(v)] ?? null) : null;
      else if (tipo === "inlineStr") valor = textoDe(corpo);
      else if (tipo === "str") valor = v != null ? desescapar(v) : null;
      else if (tipo === "b") valor = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (tipo === "e") valor = null; // #DIV/0!, #N/D...: tratado como vazio
      else if (tipo === "d") valor = v ? v.slice(0, 10) : null;
      else if (v != null && v !== "") {
        const n = Number(v);
        valor = Number.isFinite(n) ? (ehData[estilo] ? serialParaData(n, base1904) : n) : null;
      }
      if (typeof valor === "string") valor = valor.trim() || null;
      linha[col] = valor;
      col++;
    }
    for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = null;
    linhas[indice] = linha;
  }
  for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
  return linhas;
}
