import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caminhoDaMidia,
  caminhoValido,
  conferirArquivo,
  detalheDaMidia,
  filtrarMidias,
  formatarDuracao,
  formatarTamanho,
  formatoDeGravacao,
  formatoDoArquivo,
  LIMITE_ARQUIVO,
  nomeParaEnvio,
  tituloDoArquivo,
} from "../src/midias.ts";
import { deBase64, paraBase64 } from "../src/base64.ts";

const DONO = "11111111-2222-3333-4444-555555555555";
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("formato pelo nome e pelo tipo que o navegador informa", () => {
  assert.equal(formatoDoArquivo("foto.JPEG", "image/jpeg"), "jpg");
  assert.equal(formatoDoArquivo("catalogo.pdf", ""), "pdf");
  assert.equal(formatoDoArquivo("Gravação 12.m4a", "audio/x-m4a"), "m4a");
  assert.equal(formatoDoArquivo("voz.opus", "audio/ogg"), "ogg");
  assert.equal(formatoDoArquivo("sem-nome", "audio/mpeg"), "mp3");
  assert.equal(formatoDoArquivo("blob", "audio/mp4;codecs=mp4a.40.2"), "m4a");
  assert.equal(formatoDoArquivo("voz.mp4", "audio/mp4"), "m4a");
});

test("recusa o que o WhatsApp não abre como foto, PDF ou áudio", () => {
  assert.equal(formatoDoArquivo("video.mp4", "video/mp4"), null);
  assert.equal(formatoDoArquivo("gravacao.webm", "audio/webm"), null);
  assert.equal(formatoDoArquivo("planilha.xlsx", "application/vnd.ms-excel"), null);
  assert.equal(formatoDoArquivo("foto.heic", "image/heic"), null);
  assert.equal(formatoDoArquivo("pagina.html", "text/html"), null);
});

test("confere tamanho antes de enviar", () => {
  assert.deepEqual(conferirArquivo("a.pdf", "application/pdf", 1000), { ok: true, ext: "pdf" });
  assert.equal(conferirArquivo("a.pdf", "application/pdf", 0).ok, false);
  assert.equal(conferirArquivo("a.pdf", "application/pdf", LIMITE_ARQUIVO + 1).ok, false);
  assert.equal(conferirArquivo("a.exe", "", 10).ok, false);
});

test("gravação: prefere M4A (AAC), aceita OGG, nunca WebM", () => {
  assert.equal(formatoDeGravacao((m) => m.startsWith("audio/mp4") || m.startsWith("audio/webm"))?.ext, "m4a");
  assert.equal(formatoDeGravacao((m) => m.startsWith("audio/ogg"))?.ext, "ogg");
  assert.equal(formatoDeGravacao((m) => m.startsWith("audio/webm")), null);
});

test("caminho na pasta do dono, no formato que o banco aceita", () => {
  const p = caminhoDaMidia(DONO, ID, "pdf");
  assert.equal(p, `${DONO}/${ID}.pdf`);
  assert.ok(caminhoValido(p, DONO));
  assert.ok(!caminhoValido(p, "99999999-2222-3333-4444-555555555555"));
  assert.ok(!caminhoValido(`${DONO}/../${ID}.pdf`, DONO));
  assert.ok(!caminhoValido(`${DONO}/${ID}.exe`, DONO));
});

test("título e nome do arquivo na conversa", () => {
  assert.equal(tituloDoArquivo("catalogo_natal-2026.pdf"), "catalogo natal 2026");
  assert.equal(tituloDoArquivo(".pdf"), "Arquivo");
  assert.equal(nomeParaEnvio("Catálogo: Natal / 2026", "pdf"), "Catálogo Natal 2026.pdf");
  assert.equal(nomeParaEnvio("   ", "m4a"), "arquivo.m4a");
  assert.ok(nomeParaEnvio("x".repeat(300), "pdf").length <= 104);
});

test("tamanho, duração e detalhe da linha", () => {
  assert.equal(formatarTamanho(500), "1 KB");
  assert.equal(formatarTamanho(250 * 1024), "250 KB");
  assert.equal(formatarTamanho(1.25 * 1024 * 1024), "1,3 MB");
  assert.equal(formatarDuracao(5), "0:05");
  assert.equal(formatarDuracao(125.4), "2:05");
  assert.equal(detalheDaMidia({ tipo: "audio", tamanho: 300 * 1024, duracao: 32, origem: "gravacao" }), "Áudio · 0:32 · 300 KB · gravado");
  assert.equal(detalheDaMidia({ tipo: "documento", tamanho: 2 * 1024 * 1024, duracao: null, origem: "arquivo" }), "PDF · 2,0 MB");
});

test("busca sem acento, por palavra e por tipo", () => {
  const lista = [
    { titulo: "Catálogo de Natal", nome_arquivo: "Catálogo de Natal.pdf", tipo: "documento" as const },
    { titulo: "Explicação da garantia", nome_arquivo: "garantia.m4a", tipo: "audio" as const },
    { titulo: "Vitrine", nome_arquivo: "vitrine.jpg", tipo: "imagem" as const },
  ];
  assert.equal(filtrarMidias(lista, "catalogo").length, 1);
  assert.equal(filtrarMidias(lista, "audio").length, 1);
  assert.equal(filtrarMidias(lista, "pdf natal").length, 1);
  assert.equal(filtrarMidias(lista, "foto").length, 1);
  assert.equal(filtrarMidias(lista, "").length, 3);
  assert.equal(filtrarMidias(lista, "nada disso").length, 0);
});

test("base64 vai e volta, inclusive arquivo grande", () => {
  const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
  const volta = deBase64(paraBase64(bytes));
  assert.equal(volta.length, bytes.length);
  assert.deepEqual(volta.subarray(0, 50), bytes.subarray(0, 50));
  assert.equal(volta[199_999], bytes[199_999]);
});
