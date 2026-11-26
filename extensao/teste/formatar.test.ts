import { test } from "node:test";
import assert from "node:assert/strict";
import { estoqueTotal, formatarMensagem, formatarPreco, linkDoProduto, termoSeguro, type ProdutoBusca } from "../src/formatar.ts";

function produto(extra: Partial<ProdutoBusca> = {}): ProdutoBusca {
  return {
    id: "p1",
    nome: "Garrafa térmica 1L",
    marca: "Termolar",
    sku: "GT1",
    codigoBarras: "7890000000001",
    preco: 49.9,
    estoque: 3,
    naVitrine: true,
    capa: null,
    variacoes: [],
    link: null,
    ...extra,
  };
}

test("preço em reais com espaço comum", () => {
  assert.equal(formatarPreco(49.9), "R$ 49,90");
  assert.equal(formatarPreco(1234.5), "R$ 1.234,50");
  assert.equal(formatarPreco(Number.NaN), "R$ 0,00");
});

test("produto simples com estoque: disponível, sem quantidade", () => {
  const t = formatarMensagem(produto());
  assert.equal(t, "*Garrafa térmica 1L*\nR$ 49,90\nDisponível");
  assert.doesNotMatch(t, /3/);
});

test("produto sem estoque: sob consulta", () => {
  assert.equal(formatarMensagem(produto({ estoque: 0 })), "*Garrafa térmica 1L*\nR$ 49,90\nSob consulta");
  assert.match(formatarMensagem(produto({ estoque: -2 })), /Sob consulta/);
});

test("link só entra quando existe", () => {
  const link = "https://www.usemarcon.com/loja/minha-loja?p=p1";
  assert.equal(formatarMensagem(produto({ link })), `*Garrafa térmica 1L*\nR$ 49,90\nDisponível\nVeja na loja: ${link}`);
  assert.doesNotMatch(formatarMensagem(produto({ link: null })), /loja/);
});

const comVariacoes = produto({
  preco: 30,
  estoque: 0,
  variacoes: [
    { id: "v1", nome: "Preta", preco: 30, estoque: 2, sku: null },
    { id: "v2", nome: "Azul", preco: 35, estoque: 0, sku: null },
    { id: "v3", nome: "Rosa", preco: 30, estoque: 5, sku: null },
  ],
});

test("produto com variações: a partir do menor preço e só as opções disponíveis", () => {
  assert.equal(formatarMensagem(comVariacoes), "*Garrafa térmica 1L*\nA partir de R$ 30,00\nDisponível em: Preta, Rosa");
  assert.equal(estoqueTotal(comVariacoes), 7);
});

test("variação: preço da variação e estado dela", () => {
  assert.equal(formatarMensagem(comVariacoes, "v2"), "*Garrafa térmica 1L* (Azul)\nR$ 35,00\nSob consulta");
  assert.equal(formatarMensagem(comVariacoes, "v1"), "*Garrafa térmica 1L* (Preta)\nR$ 30,00\nDisponível");
});

test("variações todas zeradas e mesmo preço", () => {
  const p = produto({ variacoes: [{ id: "v1", nome: "P", preco: 20, estoque: 0, sku: null }, { id: "v2", nome: "M", preco: 20, estoque: 0, sku: null }] });
  assert.equal(formatarMensagem(p), "*Garrafa térmica 1L*\nR$ 20,00\nSob consulta");
});

test("nome com asterisco não quebra o negrito do WhatsApp", () => {
  assert.equal(formatarMensagem(produto({ nome: "Copo *promo*  _novo_" })).split("\n")[0], "*Copo promo novo*");
});

test("texto sem travessão nem hífen como pausa", () => {
  for (const t of [formatarMensagem(produto()), formatarMensagem(comVariacoes), formatarMensagem(comVariacoes, "v1")]) {
    assert.doesNotMatch(t, /—| - /);
  }
});

test("link do produto", () => {
  assert.equal(linkDoProduto("https://www.usemarcon.com/", "minha-loja", "abc"), "https://www.usemarcon.com/loja/minha-loja?p=abc");
});

test("termo seguro tira sintaxe do filtro e curingas", () => {
  assert.equal(termoSeguro("  copo, (vidro) 50%  "), "copo vidro 50");
  assert.equal(termoSeguro('a"b\\c*d_e:f'), "a b c d e f");
  assert.equal(termoSeguro("7891234567890"), "7891234567890");
  assert.equal(termoSeguro("x".repeat(100)).length, 60);
});
