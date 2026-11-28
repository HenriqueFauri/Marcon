// Regras de criar e editar que o app (server actions) e a extensão (painel) usam juntas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ERRO_ATALHO_REPETIDO, atalhoRepetido, conferirResposta, ehUuid, idsParaOrdenar, proximaOrdem } from "../src/respostas.ts";
import { conferirPasso, conferirTituloSequencia, fonteDoPasso } from "../src/sequencias.ts";
import { ERRO_BIBLIOTECA_CHEIA, conferirTituloMidia, erroDaMidiaNoBanco } from "../src/midias.ts";

const U = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const U2 = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

test("conferirResposta: limpa, normaliza o atalho e trava tamanhos", () => {
  assert.deepEqual(conferirResposta({ titulo: "  Pix ", texto: "Chave: {pix}\r\n", atalho: "/PIX" }), {
    ok: true,
    dados: { titulo: "Pix", texto: "Chave: {pix}", atalho: "pix" },
  });
  assert.deepEqual(conferirResposta({ titulo: "Oi", texto: "Olá", atalho: "" }), { ok: true, dados: { titulo: "Oi", texto: "Olá", atalho: null } });
  assert.equal(conferirResposta({ titulo: "", texto: "x", atalho: "" }).ok, false);
  assert.equal(conferirResposta({ titulo: "x", texto: "   ", atalho: "" }).ok, false);
  assert.equal(conferirResposta({ titulo: "x".repeat(61), texto: "a", atalho: "" }).ok, false);
  assert.equal(conferirResposta({ titulo: "x", texto: "a".repeat(2001), atalho: "" }).ok, false);
  // atalho só com símbolo não vira atalho vazio calado: avisa
  const r = conferirResposta({ titulo: "x", texto: "a", atalho: "///" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.erro : "", /letras e números/);
  // nulos e indefinidos (FormData sem o campo) não quebram
  assert.equal(conferirResposta({ titulo: null, texto: undefined, atalho: null }).ok, false);
});

test("atalho repetido: pelo código do Postgres ou pelo nome do índice", () => {
  assert.equal(atalhoRepetido({ code: "23505" }), true);
  assert.equal(atalhoRepetido({ message: 'duplicate key value violates unique constraint "respostas_prontas_owner_id_atalho_key"' }), true);
  assert.equal(atalhoRepetido({ message: "outra coisa" }), false);
  assert.equal(atalhoRepetido(null), false);
  assert.match(ERRO_ATALHO_REPETIDO, /atalho/);
});

test("ehUuid, idsParaOrdenar e proximaOrdem", () => {
  assert.equal(ehUuid(U), true);
  assert.equal(ehUuid("r1"), false);
  assert.equal(ehUuid(42), false);
  assert.equal(idsParaOrdenar([U, U2], 200), true);
  assert.equal(idsParaOrdenar([U, "x"], 200), false);
  assert.equal(idsParaOrdenar([U, U2], 1), false);
  assert.equal(idsParaOrdenar("nada", 200), false);
  assert.equal(proximaOrdem(undefined), 0);
  assert.equal(proximaOrdem(null), 0);
  assert.equal(proximaOrdem(4), 5);
  assert.equal(proximaOrdem(10000), 10000);
});

test("conferirTituloSequencia", () => {
  assert.deepEqual(conferirTituloSequencia("  Primeiro   contato "), { ok: true, titulo: "Primeiro contato" });
  assert.equal(conferirTituloSequencia("").ok, false);
  assert.equal(conferirTituloSequencia("a".repeat(61)).ok, false);
});

test("conferirPasso: escrever, resposta ou só arquivo", () => {
  assert.deepEqual(conferirPasso({ fonte: "escrever", texto: " Oi {negocio} ", respostaId: U, midiaId: "" }), {
    ok: true,
    dados: { texto: "Oi {negocio}", resposta_id: null, midia_id: null },
  });
  assert.deepEqual(conferirPasso({ fonte: "resposta", texto: "ignorado", respostaId: U, midiaId: U2 }), {
    ok: true,
    dados: { texto: null, resposta_id: U, midia_id: U2 },
  });
  assert.deepEqual(conferirPasso({ fonte: "nenhum", texto: "", respostaId: "", midiaId: U2 }), {
    ok: true,
    dados: { texto: null, resposta_id: null, midia_id: U2 },
  });
  assert.equal(conferirPasso({ fonte: "nenhum", texto: "", respostaId: "", midiaId: "" }).ok, false);
  assert.equal(conferirPasso({ fonte: "escrever", texto: "  ", respostaId: "", midiaId: "" }).ok, false);
  assert.equal(conferirPasso({ fonte: "escrever", texto: "a".repeat(2001), respostaId: "", midiaId: "" }).ok, false);
  assert.equal(conferirPasso({ fonte: "resposta", texto: "", respostaId: "r1", midiaId: "" }).ok, false);
  assert.equal(conferirPasso({ fonte: "escrever", texto: "a", respostaId: "", midiaId: "m1" }).ok, false);
  assert.equal(conferirPasso({ fonte: "outra", texto: "a", respostaId: "", midiaId: "" }).ok, false);
});

test("fonteDoPasso abre o editor no lugar certo", () => {
  assert.equal(fonteDoPasso({ texto: null, resposta_id: U }), "resposta");
  assert.equal(fonteDoPasso({ texto: "Oi", resposta_id: null }), "escrever");
  assert.equal(fonteDoPasso({ texto: "  ", resposta_id: null }), "nenhum");
  assert.equal(fonteDoPasso({ texto: null, resposta_id: null }), "nenhum");
});

test("conferirTituloMidia e mensagens do banco da biblioteca", () => {
  assert.deepEqual(conferirTituloMidia(" Catálogo  de Natal "), { ok: true, titulo: "Catálogo de Natal" });
  assert.equal(conferirTituloMidia("").ok, false);
  assert.equal(conferirTituloMidia("a".repeat(81)).ok, false);
  assert.equal(erroDaMidiaNoBanco("Limite de 200 arquivos na biblioteca de mídia."), "Limite de 200 arquivos na biblioteca de mídia.");
  assert.equal(erroDaMidiaNoBanco("A biblioteca de mídia passou de 50 MB. Apague algum arquivo antes."), "A biblioteca de mídia passou de 50 MB. Apague algum arquivo antes.");
  assert.equal(erroDaMidiaNoBanco("registro relacionado não encontrado (resposta_id)"), "Resposta pronta não encontrada.");
  assert.equal(erroDaMidiaNoBanco("erro qualquer"), null);
  assert.match(ERRO_BIBLIOTECA_CHEIA, /MB ou 200 arquivos/);
});
