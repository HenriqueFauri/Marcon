import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assinaturaDaVenda,
  canalPadrao,
  emCentavos,
  erroDaVenda,
  filtrarClientes,
  lerPreco,
  soDigitos,
  totalDaVenda,
  validarVendaRapida,
} from "../src/venda.ts";

const U = "3f2b1c4d-0000-4000-8000-000000000001";
const P = "3f2b1c4d-0000-4000-8000-000000000002";
const V = "3f2b1c4d-0000-4000-8000-000000000003";
const base = () => ({
  chave: U,
  itens: [{ produto_id: P, variacao_id: null as string | null, quantidade: 2, preco_unitario: 49.9 }],
  formaPagamentoId: null as string | null,
  canalId: null as string | null,
  clienteId: null as string | null,
  clienteNome: null as string | null,
});

test("lerPreco aceita vírgula, ponto e milhar", () => {
  assert.equal(lerPreco("49,90"), 49.9);
  assert.equal(lerPreco("49.90"), 49.9);
  assert.equal(lerPreco("1.234,56"), 1234.56);
  assert.equal(lerPreco("R$ 10"), 10);
  assert.equal(lerPreco("0"), 0);
  assert.ok(Number.isNaN(lerPreco("")));
  assert.ok(Number.isNaN(lerPreco("abc")));
  assert.ok(Number.isNaN(lerPreco("-5")));
  assert.ok(Number.isNaN(lerPreco("1,234")));
});

test("total em centavos exatos", () => {
  assert.equal(totalDaVenda([{ quantidade: 1, preco_unitario: 0.1 }, { quantidade: 1, preco_unitario: 0.2 }]), 0.3);
  assert.equal(totalDaVenda([{ quantidade: 3, preco_unitario: 19.99 }]), 59.97);
  assert.equal(emCentavos(49.9), 4990);
});

test("cliente pelo nome sem acento ou pelo telefone só com dígitos", () => {
  const lista = [
    { id: "1", nome: "João da Silva", telefone: "(11) 98765-4321" },
    { id: "2", nome: "Maria Souza", telefone: null },
    { id: "3", nome: "Joana", telefone: "11 91234 0000" },
  ];
  assert.deepEqual(filtrarClientes(lista, "joao").map((c) => c.id), ["1"]);
  assert.deepEqual(filtrarClientes(lista, "silva jo").map((c) => c.id), ["1"]);
  assert.deepEqual(filtrarClientes(lista, "98765").map((c) => c.id), ["1"]);
  assert.deepEqual(filtrarClientes(lista, "(11) 9876").map((c) => c.id), ["1"]);
  assert.deepEqual(filtrarClientes(lista, "11").map((c) => c.id), [], "2 dígitos ainda não buscam telefone nem nome");
  assert.deepEqual(filtrarClientes(lista, "").map((c) => c.id), []);
  assert.equal(soDigitos("(11) 9-8"), "1198");
});

test("canal padrão é o WhatsApp da conta, se existir", () => {
  assert.equal(canalPadrao([{ id: "a", nome: "Instagram" }, { id: "b", nome: "Whatsapp" }])?.id, "b");
  assert.equal(canalPadrao([{ id: "a", nome: "Grupo do WhatsApp" }])?.id, "a");
  assert.equal(canalPadrao([{ id: "a", nome: "Instagram" }]), null);
  assert.equal(canalPadrao([]), null);
});

test("assinatura muda quando a venda muda e não muda à toa", () => {
  const { chave: _chave, ...v } = base();
  const a = assinaturaDaVenda(v);
  assert.equal(a, assinaturaDaVenda({ ...v, clienteNome: "  " }));
  assert.equal(a, assinaturaDaVenda({ ...v, itens: [{ ...v.itens[0], preco_unitario: 49.900000001 }] }));
  assert.notEqual(a, assinaturaDaVenda({ ...v, itens: [{ ...v.itens[0], quantidade: 3 }] }));
  assert.notEqual(a, assinaturaDaVenda({ ...v, itens: [{ ...v.itens[0], preco_unitario: 50 }] }));
  assert.notEqual(a, assinaturaDaVenda({ ...v, canalId: U }));
  assert.notEqual(a, assinaturaDaVenda({ ...v, clienteNome: "Ana" }));
});

test("validação aceita a venda certa", () => {
  const r = validarVendaRapida({
    ...base(),
    itens: [{ produto_id: P, variacao_id: V, quantidade: 1, preco_unitario: 10.005 }],
    clienteNome: "  Ana   Lima ",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.dados.itens[0].preco_unitario, 10.01);
    assert.equal(r.dados.clienteNome, "Ana Lima");
  }
});

test("validação recusa o que não é venda rápida", () => {
  const item = base().itens[0];
  const ruins: unknown[] = [
    null,
    "x",
    { ...base(), chave: "nao-e-uuid" },
    { ...base(), chave: undefined },
    { ...base(), itens: [] },
    { ...base(), itens: "x" },
    { ...base(), itens: Array.from({ length: 51 }, () => item) },
    { ...base(), itens: [{ ...item, produto_id: "1 or 1=1" }] },
    { ...base(), itens: [{ ...item, variacao_id: "x" }] },
    { ...base(), itens: [{ ...item, quantidade: 0 }] },
    { ...base(), itens: [{ ...item, quantidade: 1.5 }] },
    { ...base(), itens: [{ ...item, quantidade: "2" }] },
    { ...base(), itens: [{ ...item, preco_unitario: -1 }] },
    { ...base(), itens: [{ ...item, preco_unitario: Number.NaN }] },
    { ...base(), itens: [{ ...item, preco_unitario: 1e12 }] },
    { ...base(), canalId: "canal" },
    { ...base(), formaPagamentoId: 5 },
    { ...base(), clienteId: "x" },
    { ...base(), clienteNome: 123 },
    { ...base(), clienteNome: "a".repeat(121) },
  ];
  for (const r of ruins) assert.equal(validarVendaRapida(r).ok, false, JSON.stringify(r)?.slice(0, 80));
});

test("validação ignora campo extra (desconto, prazo, dono)", () => {
  const r = validarVendaRapida({ ...base(), desconto: 999, tipoPagamento: "a_prazo", owner_id: P, encomenda: true });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(Object.keys(r.dados).sort(), ["canalId", "chave", "clienteId", "clienteNome", "formaPagamentoId", "itens"]);
});

test("erros claros de estoque, limite e sessão", () => {
  assert.match(erroDaVenda("estoque insuficiente para Torneira: tem 1, pediu 2"), /^Estoque insuficiente para Torneira: tem 1, pediu 2\. Ajuste/);
  assert.match(
    erroDaVenda("Você chegou ao limite de 30 vendas por mês do plano grátis. Assine o plano Marcon para vender sem limite."),
    /limite de 30 vendas/,
  );
  assert.equal(erroDaVenda("não autenticado"), "Sua sessão acabou. Entre de novo.");
  assert.match(erroDaVenda(""), /Tente de novo/);
});
