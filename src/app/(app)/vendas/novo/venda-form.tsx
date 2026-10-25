"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CanalVenda, Cliente, FormaPagamento } from "@/types/domain";
import { formatBRL, formatData } from "@/lib/format";
import { useAction } from "@/components/use-action";
import { Field, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { Grupo, Segmentado } from "@/components/ajustes";
import { IconPencil, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Modal } from "@/components/modal";
import { registrarVenda } from "../actions";
import { FotoProduto } from "@/components/foto-produto";
import { ListaProdutos, agruparVendaveis } from "./produto-seletor";

export interface Vendavel {
  chave: string;
  produto_id: string;
  variacao_id: string | null;
  nome: string; // "Produto · Variação", usado em avisos e leitores de tela
  produto_nome: string;
  rotulo: string | null; // nome da variação, ex.: "Azul / M"
  detalhe: string;
  preco_varejo: number;
  preco_atacado: number | null;
  custo: number;
  estoque: number;
  foto: string | null; // link assinado da capa do produto
}

// pedido da vitrine virando venda (Registrar venda, em Vitrine > Pedidos)
export interface PedidoParaVenda {
  id: string | null; // null quando é a repetição de uma venda, não um pedido
  codigo: string;
  repetida?: { cliente: string | null } | null; // "Repetir venda": preços do catálogo de hoje
  canal?: string | null;
  itens: { chave: string; quantidade: number; preco: number }[];
  desconto: number;
  clienteNome: string | null;
  pagamento: string | null;
  semEstoque: string[];
}

interface ItemCarrinho {
  chave: string;
  quantidade: number;
  preco: string; // texto pra permitir digitar "12," sem o campo brigar com o usuário
}

// aceita "12,50", "12.50" e "1.234,50"
export function paraNumero(v: string) {
  const t = v.trim();
  // sem vírgula, "1.234" é milhar (1234) e "12.5" é decimal
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

// o preço aparece no jeito brasileiro (79,00); paraNumero lê de volta
export function emTexto(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// campo de dinheiro: só dígitos, que entram como centavos (1 → 0,01; 12 → 0,12; 125 → 1,25)
export function mascaraDinheiro(digitado: string) {
  const digitos = digitado.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
  return digitos ? emTexto(Number(digitos) / 100) : "";
}

// nome para mostrar em texto corrido: "Camiseta (Azul / M)"
function nomeCompleto(v: Vendavel) {
  return v.rotulo ? `${v.produto_nome} (${v.rotulo})` : v.produto_nome;
}

function somarMeses(dataISO: string, meses: number) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
}

// Linha de formulário no estilo iOS: rótulo à esquerda, valor à direita.
export function Linha({ rotulo, children, extra }: { rotulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">
      <label className="flex items-center justify-between gap-4 py-3">
        <span className="shrink-0 text-[17px] text-ink">{rotulo}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </label>
      {extra && <div className="pb-3">{extra}</div>}
    </div>
  );
}

export const valorLinha =
  "w-full min-w-0 cursor-pointer bg-transparent text-right [text-align-last:right] text-[17px] text-ink-2 outline-none placeholder:text-ink-muted focus:text-ink";

// o que aparece na lista enquanto a pessoa ainda não cadastrou os próprios (Configurações)
export const FORMAS_SUGERIDAS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Transferência"];
export const CANAIS_SUGERIDOS = ["Facebook Marketplace", "OLX", "WhatsApp", "Instagram", "Mercado Livre", "Vitrine"];

// Campo "escolha da lista ou digite": select com os cadastrados + texto livre.
// Com `sugestoes`, vira sempre uma lista de escolha: os cadastrados, depois as sugestões
// que ainda não estão cadastradas e "Outro" (aí sim aparece o campo de texto).
export function SelectOuTexto({
  label,
  opcoes,
  id,
  setId,
  texto,
  setTexto,
  placeholder,
  vazio,
  sugestoes,
}: {
  label: string;
  opcoes: { id: string; nome: string }[];
  id: string;
  setId: (v: string) => void;
  texto: string;
  setTexto: (v: string) => void;
  placeholder: string;
  vazio: string;
  sugestoes?: string[];
}) {
  const [outro, setOutro] = useState(false);

  if (sugestoes) {
    const cadastrados = new Set(opcoes.map((o) => o.nome.trim().toLowerCase()));
    // "Marketplace" cadastrado já cobre a sugestão "Facebook Marketplace" (e vice-versa)
    const extras = sugestoes.filter((n) => {
      const x = n.toLowerCase();
      return ![...cadastrados].some((c) => c === x || c.includes(x) || x.includes(c));
    });
    // texto que não é sugestão também cai em "Outro"
    const digitando = !id && (outro || (texto !== "" && !extras.includes(texto)));
    const valor = id || (digitando ? "__outro" : texto ? `sug:${texto}` : "");
    return (
      <Linha
        rotulo={label}
        extra={
          digitando ? (
            <input
              aria-label={`${label} (digitar)`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={placeholder}
              autoFocus={outro}
              className={inputClass}
            />
          ) : null
        }
      >
        <select
          value={valor}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__outro") {
              setId("");
              setTexto("");
              setOutro(true);
            } else if (v.startsWith("sug:")) {
              setId("");
              setOutro(false);
              setTexto(v.slice(4));
            } else {
              setOutro(false);
              setTexto("");
              setId(v);
            }
          }}
          className={valorLinha}
        >
          <option value="">{vazio}</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
          {extras.map((n) => (
            <option key={n} value={`sug:${n}`}>
              {n}
            </option>
          ))}
          <option value="__outro">Outro (digitar)</option>
        </select>
      </Linha>
    );
  }

  return (
    <Linha
      rotulo={label}
      extra={
        opcoes.length > 0 && !id ? (
          <input
            aria-label={`${label} (digitar)`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        ) : null
      }
    >
      {opcoes.length > 0 ? (
        <select value={id} onChange={(e) => setId(e.target.value)} className={valorLinha}>
          <option value="">{vazio}</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      ) : (
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className={valorLinha} />
      )}
    </Linha>
  );
}

// deixa apagar e digitar à vontade; ao sair do campo volta a mostrar o valor valendo
function CampoQuantidade({
  valor,
  label,
  onChange,
}: {
  valor: number;
  label: string;
  onChange: (q: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      value={texto ?? valor}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && n >= 1) onChange(n);
      }}
      onBlur={() => setTexto(null)}
      aria-label={label}
      className="w-8 bg-transparent text-center text-[17px] font-semibold tabular-nums text-ink outline-none"
    />
  );
}

export function VendaForm({
  vendaveis,
  clientes,
  canais,
  formas,
  hoje,
  produtoInicial,
  pedido = null,
}: {
  vendaveis: Vendavel[];
  clientes: Cliente[];
  canais: CanalVenda[];
  formas: FormaPagamento[];
  hoje: string;
  produtoInicial?: string | null;
  pedido?: PedidoParaVenda | null;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();

  // vindo de "Vender este produto": com uma opção só, já entra no carrinho; com
  // variações, a busca abre filtrada e o seletor já vem aberto pra escolher qual
  const iniciais = produtoInicial ? vendaveis.filter((v) => v.produto_id === produtoInicial) : [];
  const [busca, setBusca] = useState(iniciais.length > 1 ? iniciais[0].produto_nome : "");
  const [tabela, setTabela] = useState<"varejo" | "atacado">("varejo");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(() => {
    if (pedido) {
      const existe = new Set(vendaveis.map((v) => v.chave));
      return pedido.itens
        .filter((i) => existe.has(i.chave))
        .map((i) => ({ chave: i.chave, quantidade: i.quantidade, preco: emTexto(i.preco) }));
    }
    return iniciais.length === 1 ? [{ chave: iniciais[0].chave, quantidade: 1, preco: emTexto(iniciais[0].preco_varejo) }] : [];
  });
  // do pedido: cliente, canal e forma de pagamento já cadastrados entram pelo id; os outros, pelo nome
  const doCadastro = <T extends { id: string; nome: string }>(lista: T[], nome: string | null | undefined) =>
    nome ? lista.find((x) => x.nome.trim().toLowerCase() === nome.trim().toLowerCase()) : undefined;
  const clientePedido = doCadastro(clientes, pedido?.clienteNome);
  const nomeCanal = pedido ? (pedido.repetida ? (pedido.canal ?? null) : "Vitrine") : null;
  const canalPedido = doCadastro(canais, nomeCanal);
  const formaPedido = doCadastro(formas, pedido?.pagamento);
  const [clienteId, setClienteId] = useState(clientePedido?.id ?? "");
  const [clienteNome, setClienteNome] = useState(clientePedido ? "" : (pedido?.clienteNome ?? ""));
  const [canalId, setCanalId] = useState(canalPedido?.id ?? "");
  const [canalNome, setCanalNome] = useState(nomeCanal && !canalPedido ? nomeCanal : "");
  const [formaId, setFormaId] = useState(formaPedido?.id ?? "");
  const [formaNome, setFormaNome] = useState(formaPedido ? "" : (pedido?.pagamento ?? ""));
  const [desconto, setDesconto] = useState(pedido && pedido.desconto > 0 ? emTexto(pedido.desconto) : "");
  const [outrosGastos, setOutrosGastos] = useState("");
  const [entrada, setEntrada] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState<"a_vista" | "a_prazo">("a_vista");
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [data, setData] = useState(hoje);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => somarMeses(hoje, 1));
  // o 1º vencimento acompanha a data da venda (um mês depois) até a pessoa escolher outro
  const [vencimentoEscolhido, setVencimentoEscolhido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarZero, setConfirmarZero] = useState(false);
  // venda além do estoque (encomenda): pergunta antes de registrar
  const [confirmarEncomenda, setConfirmarEncomenda] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // atalhos no computador: "/" vai para a busca; Ctrl ou Cmd + Enter registra a venda
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));
      if (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        document.getElementById("buscar-produto")?.focus();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const porChave = useMemo(() => new Map(vendaveis.map((v) => [v.chave, v])), [vendaveis]);
  const temAtacado = vendaveis.some((v) => v.preco_atacado != null);

  const todosGrupos = useMemo(() => agruparVendaveis(vendaveis), [vendaveis]);
  // a busca filtra produtos: achou "Areia" numa variação, o produto aparece com todas as opções
  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo
      ? todosGrupos.filter((g) => g.itens.some((v) => `${v.nome} ${v.detalhe}`.toLowerCase().includes(termo)))
      : todosGrupos;
    return lista.slice(0, 50);
  }, [busca, todosGrupos]);

  const linhas = carrinho
    .map((item) => ({ item, produto: porChave.get(item.chave)! }))
    .filter((l) => l.produto);
  const semPreco = linhas.filter((l) => paraNumero(l.item.preco) === 0);
  // itens que passam do estoque: a venda segue como encomenda e o estoque fica negativo
  const alemDoEstoque = linhas.filter((l) => l.item.quantidade > l.produto.estoque);
  const subtotal = linhas.reduce((s, l) => s + l.item.quantidade * paraNumero(l.item.preco), 0);
  const custo = linhas.reduce((s, l) => s + l.item.quantidade * l.produto.custo, 0);
  const valorDesconto = paraNumero(desconto);
  const valorOutros = paraNumero(outrosGastos);
  const total = subtotal - valorDesconto;
  // outros gastos (motoboy, embalagem...) saem do bolso do lojista: baixam o lucro, não o total do cliente
  const lucro = total - custo - valorOutros;
  const parcelasValidas = Math.min(Math.max(Math.trunc(numeroParcelas) || 1, 1), 60);
  // entrada paga agora: entra no caixa hoje; o restante vira as parcelas
  const valorEntrada = tipoPagamento === "a_prazo" ? paraNumero(entrada) : 0;
  const restante = total - valorEntrada;
  const valorParcela = parcelasValidas > 0 ? restante / parcelasValidas : 0;

  function precoPadrao(v: Vendavel) {
    return tabela === "atacado" && v.preco_atacado != null ? v.preco_atacado : v.preco_varejo;
  }

  function mudarData(nova: string) {
    setData(nova);
    if (!vencimentoEscolhido && /^d{4}-d{2}-d{2}$/.test(nova)) setPrimeiroVencimento(somarMeses(nova, 1));
  }

  // além do estoque não corta: o item mostra o aviso de encomenda e a venda pede confirmação
  function adicionar(v: Vendavel) {
    setErro(null);
    setCarrinho((prev) => {
      const existente = prev.find((i) => i.chave === v.chave);
      if (existente) {
        return prev.map((i) => (i.chave === v.chave ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [...prev, { chave: v.chave, quantidade: 1, preco: emTexto(precoPadrao(v)) }];
    });
  }

  function alterarQuantidade(chave: string, quantidade: number) {
    setCarrinho((prev) =>
      prev.map((i) => (i.chave === chave ? { ...i, quantidade: Math.min(Math.max(Math.trunc(quantidade), 1), 9999) } : i)),
    );
  }

  function trocarTabela(nova: "varejo" | "atacado") {
    setTabela(nova);
    // reaplica o preço da tabela nos itens que já estão no carrinho
    setCarrinho((prev) =>
      prev.map((i) => {
        const v = porChave.get(i.chave);
        if (!v) return i;
        const preco = nova === "atacado" && v.preco_atacado != null ? v.preco_atacado : v.preco_varejo;
        return { ...i, preco: emTexto(preco) };
      }),
    );
  }

  function validar() {
    if (linhas.length === 0) return "Adicione pelo menos um produto.";
    if (linhas.some((l) => paraNumero(l.item.preco) < 0)) return "Há um item com preço negativo.";
    if (valorDesconto < 0) return "O desconto não pode ser negativo.";
    if (valorDesconto > subtotal) return "O desconto é maior que o total da venda.";
    if (valorOutros < 0) return "Os outros gastos não podem ser negativos.";
    if (valorEntrada > 0 && valorEntrada >= total) return "A entrada precisa ser menor que o total. Se pagou tudo, escolha À vista.";
    if (tipoPagamento === "a_prazo" && !clienteId && !clienteNome.trim())
      return "Informe o cliente: venda a prazo precisa saber de quem cobrar.";
    return null;
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validar();
    setErro(problema);
    if (problema) return;
    // preço zerado pode ser brinde ou esquecimento: pergunta antes de registrar
    if (semPreco.length > 0) {
      setConfirmarZero(true);
      return;
    }
    conferirEstoque();
  }

  // item além do estoque: confirma a encomenda antes de registrar
  function conferirEstoque() {
    if (alemDoEstoque.length > 0) {
      setConfirmarEncomenda(true);
      return;
    }
    registrar();
  }

  function registrar() {
    run(
      () =>
        registrarVenda({
          itens: linhas.map((l) => ({
            produto_id: l.produto.produto_id,
            variacao_id: l.produto.variacao_id,
            quantidade: l.item.quantidade,
            preco_unitario: Math.round(paraNumero(l.item.preco) * 100) / 100,
          })),
          clienteId: clienteId || null,
          clienteNome: clienteNome || null,
          canalId: canalId || null,
          canalNome: canalNome || null,
          formaPagamentoId: formaId || null,
          formaPagamentoNome: formaNome || null,
          tipoPagamento,
          numeroParcelas: parcelasValidas,
          primeiroVencimento,
          desconto: valorDesconto,
          entrada: valorEntrada,
          outrosGastos: valorOutros,
          data,
          pedidoId: pedido?.id ?? null,
          encomenda: alemDoEstoque.length > 0,
        }).then((r) => {
          if (r.ok && r.id) router.push(`/vendas/${r.id}`);
          return r;
        }),
      { onError: setErro },
    );
  }

  const noCarrinho = new Map(carrinho.map((i) => [i.chave, i.quantidade]));

  return (
    <form ref={formRef} onSubmit={enviar} className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
      {pedido && (
        <p className="rounded-2xl bg-info-tint px-4 py-3 text-[15px] text-ink-2 lg:col-span-5">
          {pedido.repetida ? (
            <>Repetindo a venda anterior{pedido.repetida.cliente ? <> de <strong className="text-ink">{pedido.repetida.cliente}</strong></> : null}, com os preços de hoje. Confira e registre.</>
          ) : (
            <>Do pedido <strong className="text-ink">#{pedido.codigo}</strong> da vitrine. Confira e registre.</>
          )}
          {pedido.semEstoque.length > 0 && <> Não tá mais à venda, ficou de fora: {pedido.semEstoque.join(", ")}.</>}
        </p>
      )}
      <div className="flex flex-col items-center gap-0.5 pb-1 pt-2 lg:hidden" aria-live="polite">
        <span className="text-[15px] text-ink-muted">
          Total · {linhas.length} {linhas.length === 1 ? "item" : "itens"}
        </span>
        <span className="text-[44px] font-bold leading-[1.05] tracking-tight tabular-nums text-ink">{formatBRL(total)}</span>
        {linhas.length > 0 && (
          <span
            className={`mt-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
              lucro >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
            }`}
          >
            {lucro >= 0 ? "Lucro de" : "Prejuízo de"} {formatBRL(Math.abs(lucro))}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-7 lg:col-span-3">
        {/* overflow visível no cartão: com overflow-hidden a busca não gruda no topo */}
        <Grupo titulo="Produtos" className="[&>div]:overflow-visible">
          {temAtacado && (
            <Segmentado
              rotulo="Tabela de preço"
              valor={tabela}
              onMudar={trocarTabela}
              opcoes={[
                { valor: "varejo", label: "Varejo" },
                { valor: "atacado", label: "Atacado" },
              ]}
            />
          )}
          {/* a busca gruda no topo enquanto a lista rola com a página (sem rolagem dentro da rolagem) */}
          <div className="sticky top-[env(safe-area-inset-top)] z-10 -my-2 bg-surface py-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width={16} height={16} />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto, marca ou SKU..."
                aria-label="Buscar produto"
                id="buscar-produto"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <ListaProdutos
            grupos={grupos}
            noCarrinho={noCarrinho}
            precoPadrao={precoPadrao}
            onAdicionar={adicionar}
            abertoInicial={iniciais.length > 1 ? produtoInicial : null}
          />
        </Grupo>

        <Grupo titulo={`Carrinho${linhas.length ? ` · ${linhas.length} ${linhas.length === 1 ? "item" : "itens"}` : ""}`}>
          {linhas.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">Toque num produto acima para adicionar.</p>
          ) : (
            <ul className="-mx-1 divide-y divide-line">
              {linhas.map(({ item, produto }) => (
                // duas linhas: foto e nome em cima; preço e quantidade embaixo, com a largura toda
                // (ao lado do nome, os botões de 44 px não cabiam em 390 px)
                <li key={item.chave} className="entra flex flex-col gap-2 px-1 py-3">
                  <div className="flex items-center gap-3">
                    <FotoProduto url={produto.foto} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[15px] font-medium leading-snug text-ink">{produto.produto_nome}</p>
                      {produto.rotulo && (
                        <p className="mt-1 inline-block max-w-full break-words rounded-xl bg-fill px-2.5 py-0.5 text-xs font-medium text-ink-2">
                          {produto.rotulo}
                        </p>
                      )}
                      {item.quantidade > 1 && (
                        <p className="mt-0.5 text-[13px] tabular-nums text-ink-muted">
                          {item.quantidade} × {formatBRL(paraNumero(item.preco))} = {formatBRL(item.quantidade * paraNumero(item.preco))}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      className="flex h-11 w-[9rem] min-w-0 items-center gap-1.5 rounded-xl border border-line bg-fill px-2.5 text-ink-muted focus-within:border-brand focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/15"
                      title="Toque para mudar o preço desta venda"
                    >
                      <span className="text-[15px]">R$</span>
                      <input
                        inputMode="numeric"
                        value={item.preco}
                        onChange={(e) =>
                          setCarrinho((prev) =>
                            prev.map((i) =>
                              i.chave === item.chave ? { ...i, preco: mascaraDinheiro(e.target.value) || "0,00" } : i,
                            ),
                          )
                        }
                        aria-label={`Preço unitário de ${produto.nome}`}
                        className="w-full min-w-0 bg-transparent font-semibold tabular-nums text-ink outline-none"
                      />
                      <IconPencil width={14} height={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
                    </label>
                    <div className="flex shrink-0 items-center rounded-full bg-canvas">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-ink disabled:opacity-40"
                        aria-label="Diminuir quantidade"
                        onClick={() =>
                          item.quantidade <= 1
                            ? setCarrinho((prev) => prev.filter((i) => i.chave !== item.chave))
                            : alterarQuantidade(item.chave, item.quantidade - 1)
                        }
                      >
                        {item.quantidade <= 1 ? <IconTrash width={16} height={16} /> : "−"}
                      </button>
                      <CampoQuantidade
                        valor={item.quantidade}
                        label={`Quantidade de ${produto.nome}`}
                        onChange={(q) => alterarQuantidade(item.chave, q)}
                      />
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-ink disabled:opacity-40"
                        aria-label="Aumentar quantidade"
                        onClick={() => alterarQuantidade(item.chave, item.quantidade + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {item.quantidade > produto.estoque && (
                    <p role="status" className="text-right text-[13px] text-warning">
                      Vai ficar com estoque negativo (encomenda).
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              document.getElementById("buscar-produto")?.focus();
              document.getElementById("buscar-produto")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="mt-1 flex w-full items-center gap-3 border-t border-line px-1 pt-3 text-left text-[17px] text-brand-text"
          >
            <span className="flex w-11 justify-center">
              <IconPlus width={22} height={22} strokeWidth={2.2} />
            </span>
            Adicionar produto
          </button>
        </Grupo>

        <Grupo titulo="Cliente" semPadding>
          <div className="px-4">
            <SelectOuTexto
              label="Cliente"
              opcoes={clientes}
              id={clienteId}
              setId={setClienteId}
              texto={clienteNome}
              setTexto={setClienteNome}
              placeholder="Digite o nome do cliente (opcional)"
              vazio="Avulso (sem cadastro)"
            />
          </div>
        </Grupo>
      </div>

      <div className="flex flex-col gap-7 lg:col-span-2">
        <Grupo titulo="Pagamento" semPadding>
          <div className="flex flex-col px-4">
            <div className="py-3">
              <Segmentado
                name="tipo_pagamento"
                rotulo="Tipo de pagamento"
                valor={tipoPagamento}
                onMudar={setTipoPagamento}
                opcoes={[
                  { valor: "a_vista", label: "À vista" },
                  { valor: "a_prazo", label: "A prazo ou parcelado" },
                ]}
              />
            </div>

            {tipoPagamento === "a_prazo" && (
              <Linha
                rotulo="Entrada paga agora (R$)"
                extra={<p className="text-[13px] text-ink-muted">Entra no caixa hoje. O que sobrar vira as parcelas.</p>}
              >
                <input
                  inputMode="numeric"
                  value={entrada}
                  onChange={(e) => setEntrada(mascaraDinheiro(e.target.value))}
                  placeholder="0,00"
                  className={valorLinha}
                />
              </Linha>
            )}

            {tipoPagamento === "a_prazo" && (
              <div className="grid grid-cols-2 gap-2 border-t border-line py-3">
                <Field label="Nº de parcelas">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={numeroParcelas}
                    onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="1º vencimento">
                  <input
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => {
                      setPrimeiroVencimento(e.target.value);
                      setVencimentoEscolhido(true);
                    }}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            <SelectOuTexto
              label="Forma de pagamento"
              opcoes={formas}
              id={formaId}
              setId={setFormaId}
              texto={formaNome}
              setTexto={setFormaNome}
              placeholder="Como o cliente pagou"
              vazio="Escolher"
              sugestoes={FORMAS_SUGERIDAS}
            />

            <SelectOuTexto
              label="Canal de venda"
              opcoes={canais}
              id={canalId}
              setId={setCanalId}
              texto={canalNome}
              setTexto={setCanalNome}
              placeholder="Onde você vendeu"
              vazio="Escolher"
              sugestoes={CANAIS_SUGERIDOS}
            />
            <Linha rotulo="Desconto (R$)">
              <input
                inputMode="numeric"
                value={desconto}
                onChange={(e) => setDesconto(mascaraDinheiro(e.target.value))}
                placeholder="0,00"
                className={valorLinha}
              />
            </Linha>
            <Linha
              rotulo="Outros gastos (R$)"
              extra={
                <p className="text-[13px] text-ink-muted">
                  Motoboy, embalagem, taxa... Sai do seu lucro e do caixa; o total do cliente não muda.
                </p>
              }
            >
              <input
                inputMode="numeric"
                value={outrosGastos}
                onChange={(e) => setOutrosGastos(mascaraDinheiro(e.target.value))}
                placeholder="0,00"
                className={valorLinha}
              />
            </Linha>
            <Linha rotulo="Data da venda">
              <input type="date" value={data} max={hoje} onChange={(e) => mudarData(e.target.value)} className={valorLinha} />
            </Linha>
          </div>
        </Grupo>

        <Grupo titulo="Resumo" className="lg:sticky lg:top-6">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
            </div>
            {valorDesconto > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {formatBRL(valorDesconto)}</dd>
              </div>
            )}
            {valorOutros > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>Outros gastos (seu custo)</dt>
                <dd className="tabular-nums">{formatBRL(valorOutros)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-ink-2">Total</dt>
              <dd className="text-2xl font-semibold tabular-nums text-ink">{formatBRL(total)}</dd>
            </div>
            {linhas.length > 0 && (
              <div className="flex justify-between text-xs">
                <dt className="text-ink-muted">Lucro estimado</dt>
                <dd className={`tabular-nums ${lucro >= 0 ? "text-positive" : "text-danger"}`}>{formatBRL(lucro)}</dd>
              </div>
            )}
          </dl>

          {tipoPagamento === "a_prazo" && total > 0 && (
            <div className="border-t border-line pt-3 text-[13px] text-ink-muted">
              {valorEntrada > 0 && valorEntrada < total && (
                <p className="mb-0.5 font-medium text-ink-2">Entrada de {formatBRL(valorEntrada)} hoje, mais</p>
              )}
              <p className="mb-0.5 font-medium text-ink-2">
                {parcelasValidas}x de {formatBRL(valorParcela)}
              </p>
              {primeiroVencimento && (
                <p>
                  {Array.from({ length: Math.min(parcelasValidas, 4) }, (_, i) => formatData(somarMeses(primeiroVencimento, i))).join(", ")}
                  {parcelasValidas > 4 && "..."}
                </p>
              )}
            </div>
          )}

          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 lg:static lg:bg-none lg:p-0">
            <button
              type="submit"
              disabled={isPending || linhas.length === 0}
              className={`${btnPrimary} h-[54px] w-full !text-[17px] shadow-lg shadow-brand/30 lg:h-auto lg:py-3 lg:shadow-sm`}
            >
              {isPending ? "Registrando..." : `Registrar venda${linhas.length ? ` · ${formatBRL(total)}` : ""}`}
            </button>
          </div>
        </Grupo>
      </div>
      <Modal
        open={confirmarZero}
        onClose={() => setConfirmarZero(false)}
        title="Registrar com preço R$ 0,00?"
        description={
          semPreco.length === 1
            ? `${nomeCompleto(semPreco[0].produto)} está com preço zerado.`
            : `${semPreco.length} itens estão com preço zerado: ${semPreco.map((l) => nomeCompleto(l.produto)).join(", ")}.`
        }
        size="sm"
      >
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setConfirmarZero(false)} className={btnGhost}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmarZero(false);
              conferirEstoque();
            }}
            className={btnPrimary}
          >
            Registrar assim mesmo
          </button>
        </div>
      </Modal>
      <Modal
        open={confirmarEncomenda}
        onClose={() => setConfirmarEncomenda(false)}
        title="Vender sem estoque?"
        description={
          alemDoEstoque.length === 1
            ? `${nomeCompleto(alemDoEstoque[0].produto)} vai ficar com estoque negativo (encomenda).`
            : `${alemDoEstoque.length} itens vão ficar com estoque negativo (encomenda): ${alemDoEstoque.map((l) => nomeCompleto(l.produto)).join(", ")}.`
        }
        size="sm"
      >
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setConfirmarEncomenda(false)} className={btnGhost}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmarEncomenda(false);
              registrar();
            }}
            className={btnPrimary}
          >
            Registrar encomenda
          </button>
        </div>
      </Modal>
    </form>
  );
}
