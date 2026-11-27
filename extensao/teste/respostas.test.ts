import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXEMPLOS,
  exemplosDaConta,
  chaveDaVariavel,
  filtrarRespostas,
  normalizarAtalho,
  preencherVariaveis,
  variaveisSemValor,
  variaveisUsadas,
} from "../src/respostas.ts";

const tudo = {
  negocio: "Marcon Utilidades",
  pix: "pix@marcon.com",
  endereco: "Rua das Flores, 10",
  telefone: "(11) 99999-0000",
  vitrine: "https://www.usemarcon.com/loja/marcon",
};

test("preenche todas as variáveis", () => {
  const t = preencherVariaveis("Oi! Aqui é da {negocio}.\nChave: {pix}\n{endereco} · {telefone}\n{vitrine}", tudo);
  assert.equal(t, "Oi! Aqui é da Marcon Utilidades.\nChave: pix@marcon.com\nRua das Flores, 10 · (11) 99999-0000\nhttps://www.usemarcon.com/loja/marcon");
});

test("aceita acento, maiúscula, espaço e apelido no nome da variável", () => {
  assert.equal(preencherVariaveis("{Negócio} {LOJA} { pix } {chave pix} {Endereço} {link}", tudo),
    "Marcon Utilidades Marcon Utilidades pix@marcon.com pix@marcon.com Rua das Flores, 10 https://www.usemarcon.com/loja/marcon");
  assert.equal(chaveDaVariavel("chave_pix"), "pix");
  assert.equal(chaveDaVariavel("cliente"), null);
});

test("variável sem valor tira a linha inteira, sem deixar marca", () => {
  const texto = "Pode pagar no Pix.\nChave: {pix}\nAssim que pagar, me manda o comprovante.";
  assert.equal(preencherVariaveis(texto, { ...tudo, pix: "" }), "Pode pagar no Pix.\nAssim que pagar, me manda o comprovante.");
  assert.equal(preencherVariaveis(texto, { ...tudo, pix: null }), "Pode pagar no Pix.\nAssim que pagar, me manda o comprovante.");
  assert.equal(preencherVariaveis(texto, { ...tudo, pix: "   " }), "Pode pagar no Pix.\nAssim que pagar, me manda o comprovante.");
  assert.doesNotMatch(preencherVariaveis(texto, {}), /[{}]|Chave/);
});

test("não sobra linha em branco dobrada, no começo nem no fim", () => {
  assert.equal(preencherVariaveis("{vitrine}\n\nOi\n\n{pix}\n\nTchau\n\n{endereco}", {}), "Oi\n\nTchau");
  assert.equal(preencherVariaveis("Oi\r\nTchau", {}), "Oi\nTchau");
});

test("chave desconhecida fica como o dono escreveu", () => {
  assert.equal(preencherVariaveis("Oi {cliente}, {negocio}", tudo), "Oi {cliente}, Marcon Utilidades");
  assert.equal(preencherVariaveis("Sem variável { }", {}), "Sem variável { }");
});

test("valor com quebra de linha vira uma linha só", () => {
  assert.equal(preencherVariaveis("Endereço: {endereco}", { endereco: "Rua A, 1\nCentro\n\n" }), "Endereço: Rua A, 1, Centro");
});

test("variáveis usadas e sem valor", () => {
  assert.deepEqual(variaveisUsadas("{pix} {negocio} {pix} {xyz}"), ["pix", "negocio"]);
  assert.deepEqual(variaveisSemValor("{pix} {negocio} {vitrine}", { negocio: "X" }), ["pix", "vitrine"]);
});

test("atalho normalizado", () => {
  assert.equal(normalizarAtalho("/Pix"), "pix");
  assert.equal(normalizarAtalho("Disponível já!"), "disponivelja");
  assert.equal(normalizarAtalho("a".repeat(40)).length, 20);
});

test("busca por título, texto e atalho, atalho primeiro", () => {
  const lista = [
    { titulo: "Pagamento", texto: "Aceitamos pix e cartão", atalho: "pagamento" },
    { titulo: "Pix", texto: "Chave: {pix}", atalho: "pix" },
    { titulo: "Entrega", texto: "Fazemos entrega", atalho: null },
  ];
  assert.deepEqual(filtrarRespostas(lista, "/pix").map((r) => r.titulo), ["Pix", "Pagamento"]);
  assert.deepEqual(filtrarRespostas(lista, "entrega").map((r) => r.titulo), ["Entrega"]);
  assert.deepEqual(filtrarRespostas(lista, "CARTAO").map((r) => r.titulo), ["Pagamento"]);
  assert.equal(filtrarRespostas(lista, "").length, 3);
  assert.equal(filtrarRespostas(lista, "nada disso").length, 0);
});

test("exemplos dentro dos limites do banco e sem travessão nem fiado", () => {
  assert.equal(EXEMPLOS.length, 7);
  for (const e of EXEMPLOS) {
    assert.ok(e.titulo.length <= 60 && e.texto.length <= 2000);
    assert.match(e.atalho, /^[a-z0-9]{1,20}$/);
    assert.doesNotMatch(e.texto + e.titulo, /\u2014|\u2013| - |fiado/i);
  }
  assert.equal(new Set(EXEMPLOS.map((e) => e.atalho)).size, EXEMPLOS.length);
});

test("exemplo de pagamento usa as formas da conta", () => {
  const pag = (l: typeof EXEMPLOS) => l.find((e) => e.atalho === "pagamento")!.texto;
  assert.equal(pag(exemplosDaConta([])), "Me fala como prefere pagar que eu te passo os detalhes.");
  assert.equal(pag(exemplosDaConta(["PIX"])), "Aceitamos PIX. Qual fica melhor pra você?");
  assert.equal(pag(exemplosDaConta(["Dinheiro", "PIX", " ", "PIX"])), "Aceitamos Dinheiro e PIX. Qual fica melhor pra você?");
  assert.equal(exemplosDaConta(["PIX"]).length, 7);
  assert.doesNotMatch(pag(exemplosDaConta(["PIX"])), /cart/i);
});
