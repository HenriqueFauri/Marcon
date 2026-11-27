import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INICIO,
  acaoAtual,
  depoisDaAcao,
  detalheDoPasso,
  montarRoteiro,
  passoVazio,
  pular,
  rotuloDaAcao,
  rotuloProgresso,
  terminou,
  tituloDoPasso,
  voltar,
  type PassoSequencia,
  type Posicao,
} from "../src/sequencias.ts";
import { preencherVariaveis } from "../src/respostas.ts";

const seq = { id: "s1", titulo: "Primeiro contato", ordem: 0 };
const respostas = [
  { id: "r1", titulo: "Pix", texto: "Pode pagar no Pix.\nChave: {pix}" },
  { id: "r2", titulo: "Só Pix", texto: "Chave: {pix}" },
];
const midias = [
  { id: "m1", tipo: "imagem" as const, titulo: "Catálogo" },
  { id: "m2", tipo: "audio" as const, titulo: "Explicando" },
];
const dados = { negocio: "Marcon Utilidades", pix: "pix@marcon.com" };
const preencher = (t: string) => preencherVariaveis(t, dados);

function passo(id: string, ordem: number, p: Partial<PassoSequencia>): PassoSequencia {
  return { id, sequencia_id: "s1", ordem, texto: null, resposta_id: null, midia_id: null, ...p };
}

// boas-vindas, foto do catálogo, áudio com texto, Pix (resposta pronta)
const passos = [
  passo("p3", 2, { texto: "Ouve esse áudio:", midia_id: "m2" }),
  passo("p1", 0, { texto: "Oi! Aqui é da {negocio}." }),
  passo("p2", 1, { midia_id: "m1" }),
  passo("p4", 3, { resposta_id: "r1" }),
  passo("outra", 0, { texto: "de outra sequência", sequencia_id: "s2" }),
];

const roteiro = montarRoteiro(seq, passos, respostas, midias, preencher);

test("monta o roteiro na ordem, só da sequência, com as variáveis preenchidas", () => {
  assert.deepEqual(
    roteiro.passos.map((p) => p.id),
    ["p1", "p2", "p3", "p4"],
  );
  assert.deepEqual(roteiro.passos[0].acoes, [{ tipo: "texto", texto: "Oi! Aqui é da Marcon Utilidades." }]);
  assert.deepEqual(roteiro.passos[1].acoes, [{ tipo: "midia", midia: midias[0] }]);
  // texto e arquivo: o texto vem primeiro
  assert.deepEqual(
    roteiro.passos[2].acoes.map((a) => a.tipo),
    ["texto", "midia"],
  );
  assert.equal((roteiro.passos[3].acoes[0] as { texto: string }).texto, "Pode pagar no Pix.\nChave: pix@marcon.com");
  assert.equal(roteiro.pulados, 0);
});

test("cada clique faz uma ação e só então aponta para a próxima", () => {
  let pos: Posicao = INICIO;
  const feitas: string[] = [];
  while (!terminou(roteiro, pos)) {
    const a = acaoAtual(roteiro, pos)!;
    feitas.push(`${rotuloProgresso(roteiro, pos)}: ${rotuloDaAcao(a)}`);
    pos = depoisDaAcao(roteiro, pos);
  }
  assert.deepEqual(feitas, [
    "Passo 1 de 4: Inserir texto",
    "Passo 2 de 4: Anexar foto",
    "Passo 3 de 4: Inserir texto",
    "Passo 3 de 4: Anexar áudio",
    "Passo 4 de 4: Inserir texto",
  ]);
  assert.equal(acaoAtual(roteiro, pos), null);
  assert.equal(rotuloProgresso(roteiro, pos), "Fim · 4 de 4");
  // depois do fim não anda mais
  assert.deepEqual(depoisDaAcao(roteiro, pos), pos);
});

test("pular vai ao começo do próximo passo sem fazer a ação", () => {
  assert.deepEqual(pular(roteiro, INICIO), { passo: 1, acao: 0 });
  // no meio do passo 3 (texto feito, falta o áudio), pular deixa o áudio de lado
  assert.deepEqual(pular(roteiro, { passo: 2, acao: 1 }), { passo: 3, acao: 0 });
  assert.deepEqual(pular(roteiro, { passo: 3, acao: 0 }), { passo: 4, acao: 0 });
  assert.ok(terminou(roteiro, pular(roteiro, { passo: 3, acao: 0 })));
  assert.deepEqual(pular(roteiro, { passo: 4, acao: 0 }), { passo: 4, acao: 0 });
});

test("voltar refaz o passo atual ou volta ao anterior, nunca antes do primeiro", () => {
  assert.deepEqual(voltar(roteiro, INICIO), INICIO);
  assert.deepEqual(voltar(roteiro, { passo: 2, acao: 1 }), { passo: 2, acao: 0 });
  assert.deepEqual(voltar(roteiro, { passo: 2, acao: 0 }), { passo: 1, acao: 0 });
  // do fim volta ao último passo
  assert.deepEqual(voltar(roteiro, { passo: 4, acao: 0 }), { passo: 3, acao: 0 });
});

test("passo que ficou vazio sai do roteiro e é contado", () => {
  const comVazios = [
    passo("a", 0, { texto: "Oi" }),
    passo("b", 1, { resposta_id: "apagada" }), // resposta apagada
    passo("c", 2, { midia_id: "apagado" }), // arquivo apagado
    passo("d", 3, { resposta_id: "r2" }), // só {pix}, conta sem Pix: texto some
    passo("e", 4, { resposta_id: "r2", midia_id: "m1" }), // fica só a foto
  ];
  const r = montarRoteiro(seq, comVazios, respostas, midias, (t) => preencherVariaveis(t, {}));
  assert.deepEqual(
    r.passos.map((p) => p.id),
    ["a", "e"],
  );
  assert.deepEqual(r.passos[1].acoes, [{ tipo: "midia", midia: midias[0] }]);
  assert.equal(r.pulados, 3);
  assert.equal(rotuloProgresso(r, INICIO), "Passo 1 de 2");
  assert.ok(passoVazio(comVazios[1], respostas, midias));
  assert.ok(passoVazio(comVazios[2], respostas, midias));
  assert.ok(!passoVazio(comVazios[3], respostas, midias)); // no app não é vazio: tem resposta
});

test("sequência sem passos não tem ação", () => {
  const r = montarRoteiro(seq, [], respostas, midias, preencher);
  assert.equal(rotuloProgresso(r, INICIO), "Sem passos");
  assert.ok(terminou(r, INICIO));
  assert.equal(acaoAtual(r, INICIO), null);
  assert.deepEqual(voltar(r, INICIO), INICIO);
});

test("nome e detalhe do passo nas listas do app", () => {
  assert.equal(tituloDoPasso(passos[3], respostas, midias), "Pix");
  assert.equal(detalheDoPasso(passos[3], respostas, midias), "Resposta pronta");
  assert.equal(tituloDoPasso(passos[2], respostas, midias), "Catálogo");
  assert.equal(detalheDoPasso(passos[2], respostas, midias), "Foto: Catálogo");
  assert.equal(detalheDoPasso(passos[0], respostas, midias), "Texto · Áudio: Explicando");
  const longo = passo("l", 0, { texto: "x".repeat(80) });
  assert.equal(tituloDoPasso(longo, respostas, midias).length, 60);
  assert.equal(tituloDoPasso(passo("v", 0, { midia_id: "apagado" }), respostas, midias), "Passo vazio");
});
