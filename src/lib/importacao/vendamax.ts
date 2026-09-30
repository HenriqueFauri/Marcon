import { juntar, lerTabela, textoDaLinha, valorDoRotulo } from "./tabela";
import { arredondar, brl, lerData, lerDinheiro, lerFaixa } from "./valores";
import {
  ErroDeLeitura,
  type Analise,
  type Conferencia,
  type ItemVendaLido,
  type LancamentoLido,
  type Pagina,
  type ProdutoLido,
  type VendaLida,
} from "./tipos";

// Relatórios em PDF do VendaMax: produtos, vendas e extrato de caixa.
// O VendaMax não exporta planilha; o PDF gerado por ele tem texto de verdade,
// então dá para ler sem IA, e conferir o que foi lido com os totais do próprio PDF.

const RODAPE = /(Relat[óo]rio|Extrato) gerado pelo|^P[áa]gina \d+/i;
const RESUMO = /^Resumo/i;

export function lerRelatorio(paginas: Pagina[]): Analise {
  const cabecalho = paginas[0]?.slice(0, 4).map(textoDaLinha).join(" ") ?? "";
  const tudo = paginas.flatMap((p) => p.map(textoDaLinha)).join(" ");
  if (!/vendamax/i.test(tudo)) {
    throw new ErroDeLeitura(
      "Este PDF não parece ser um relatório do VendaMax. Por enquanto só leio os dele: produtos, vendas e extrato de caixa.",
    );
  }
  if (/Relat[óo]rio de Produtos/i.test(cabecalho)) return lerProdutos(paginas);
  if (/Relat[óo]rio de Vendas/i.test(cabecalho)) return lerVendas(paginas);
  if (/Extrato de Caixa/i.test(cabecalho)) return lerCaixa(paginas);
  throw new ErroDeLeitura("Não reconheci o tipo de relatório. Envie o de produtos, o de vendas ou o extrato de caixa.");
}

function conferir(rotulo: string, lido: number, esperado: number | null, formato: (n: number) => string): Conferencia[] {
  if (esperado === null) return [];
  return [{ rotulo, lido: formato(lido), esperado: formato(esperado), ok: Math.abs(lido - esperado) < 0.015 }];
}

const inteiro = (n: number) => String(Math.round(n));

function numeroDoRotulo(paginas: Pagina[], rotulo: RegExp): number | null {
  const texto = valorDoRotulo(paginas, rotulo);
  const m = texto?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function dinheiroDoRotulo(paginas: Pagina[], rotulo: RegExp): number | null {
  const texto = valorDoRotulo(paginas, rotulo, /R\$/);
  return texto ? lerDinheiro(texto) : null;
}

// "Nome (algo)" -> ["Nome", "algo"]
function separarParenteses(texto: string): [string, string | null] {
  const m = texto.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : [texto.trim(), null];
}

// ---------------------------------------------------------------------------
// produtos
// ---------------------------------------------------------------------------

function todosOsValores(texto: string) {
  return [...texto.matchAll(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s*\d+,\d{2}/g)]
    .map((m) => lerDinheiro(m[0]))
    .filter((v): v is number => v !== null);
}

function lerProdutos(paginas: Pagina[]): Analise {
  const registros = lerTabela(paginas, ["#", "Produto", "Categoria", "Custo", "Varejo", "Margem", "Estoque"], {
    ehInicio: (c) => /^\d+$/.test(c[0]),
    ehFim: (t) => RESUMO.test(t),
    ignorar: (t) => RODAPE.test(t),
  });

  const itens: ProdutoLido[] = [];
  for (const reg of registros) {
    const c = juntar(reg);
    const nome = c[1];
    if (!nome) continue;
    const avisos: string[] = [];

    let custo = 0;
    const faixa = lerFaixa(c[3]);
    if (faixa) {
      custo = arredondar((faixa[0] + faixa[1]) / 2);
      avisos.push(
        `Tem variações com custos diferentes (${brl(faixa[0])} a ${brl(faixa[1])}). Usei a média; as variações em si não vêm no relatório.`,
      );
    } else {
      const lido = lerDinheiro(c[3]);
      if (lido === null) avisos.push("Não consegui ler o custo. Confira antes de importar.");
      else custo = lido;
    }

    // o preço de atacado vem junto do de varejo: "R$ 229,00 Atac: R$ 209,00"
    const [textoVarejo, textoAtacado] = c[4].split(/Atac:/i);
    const varejos = todosOsValores(textoVarejo);
    let precoVarejo = 0;
    if (varejos.length === 0) avisos.push("Não consegui ler o preço de venda. Confira antes de importar.");
    else if (varejos.length === 1) precoVarejo = varejos[0];
    else {
      precoVarejo = arredondar(varejos.reduce((s, v) => s + v, 0) / varejos.length);
      avisos.push("Tem mais de um preço de venda (variações). Usei a média.");
    }
    const atacados = textoAtacado ? todosOsValores(textoAtacado) : [];

    const estoque = c[6].match(/^(\d+)/);
    if (!estoque) avisos.push("Não consegui ler o estoque. Considerei 0.");

    itens.push({
      nome,
      categoria: c[2] || null,
      custo,
      precoVarejo,
      precoAtacado: atacados[0] ?? null,
      estoque: estoque ? Number(estoque[1]) : 0,
      avisos,
    });
  }

  const conferencias: Conferencia[] = [];
  const resumo = valorDoRotulo(paginas, /Produtos \/ unidades/)?.match(/(\d+)\s*\/\s*(\d+)/);
  if (resumo) {
    conferencias.push(...conferir("Produtos", itens.length, Number(resumo[1]), inteiro));
    conferencias.push(...conferir("Unidades em estoque", itens.reduce((s, p) => s + p.estoque, 0), Number(resumo[2]), inteiro));
  }

  return { tipo: "produtos", origem: "vendamax", periodo: null, itens, avisos: [], conferencias };
}

// ---------------------------------------------------------------------------
// vendas
// ---------------------------------------------------------------------------

function lerVendas(paginas: Pagina[]): Analise {
  const registros = lerTabela(paginas, ["Venda", "Data", "Produto", "Qtd", "Total", "Pagamento", "Lucro", "Canal"], {
    ehInicio: (c) => c[0] !== "" && lerData(c[1]) !== null,
    ehFim: (t) => RESUMO.test(t),
    ignorar: (t) => RODAPE.test(t),
  });

  const vendas: VendaLida[] = [];
  const avisosGerais: string[] = [];

  for (const reg of registros) {
    const c = reg.cel;
    const numero = c[0];
    const data = lerData(c[1]);
    const total = lerDinheiro(c[4]);
    if (!data || total === null) {
      avisosGerais.push(`Venda ${numero}: não consegui ler a data ou o total; ficou de fora.`);
      continue;
    }
    const avisos: string[] = [];
    const quantidadeTotal = parseInt(c[3], 10) || 1;
    const lucro = lerDinheiro(c[6]);

    // linha principal + sub-itens ("· Produto | qtd | valor") + "Cliente: nome"
    let principal = c[2];
    let cliente: string | null = null;
    const subitens: { nome: string; quantidade: number; total: number }[] = [];
    let alvo: "principal" | "cliente" | number = "principal";
    for (const s of reg.seguintes) {
      const t = s[2];
      if (/^Cliente:/i.test(t)) {
        cliente = t.replace(/^Cliente:\s*/i, "");
        alvo = "cliente";
      } else if (t.startsWith("·")) {
        subitens.push({
          nome: t.replace(/^·\s*/, ""),
          quantidade: parseInt(s[3], 10) || 1,
          total: lerDinheiro(s[4]) ?? 0,
        });
        alvo = subitens.length - 1;
      } else if (t) {
        // nome que quebrou em duas linhas
        if (alvo === "principal") principal += ` ${t}`;
        else if (alvo === "cliente") cliente = `${cliente ?? ""} ${t}`.trim();
        else subitens[alvo].nome += ` ${t}`;
      }
    }

    const extras = principal.match(/\(\+(\d+)\s*ite(?:m|ns)\)\s*$/i);
    const nomePrincipal = principal.replace(/\s*\(\+\d+\s*ite(?:m|ns)\)\s*$/i, "").trim();
    if (extras && Number(extras[1]) !== subitens.length) {
      avisos.push(`O relatório indica ${extras[1]} item(ns) a mais, mas li ${subitens.length}.`);
    }

    // no relatório, a linha principal traz a quantidade e o total da VENDA inteira;
    // o que sobra depois de tirar os sub-itens é do primeiro item
    const quantidadePrincipal = Math.max(quantidadeTotal - subitens.reduce((s, i) => s + i.quantidade, 0), 1);
    const totalPrincipal = arredondar(total - subitens.reduce((s, i) => s + i.total, 0));
    const brutos = [
      { nome: nomePrincipal, quantidade: quantidadePrincipal, total: totalPrincipal },
      ...subitens,
    ];

    let custoTotal = 0;
    if (lucro === null) avisos.push("Sem lucro no relatório; o custo ficou zerado.");
    else custoTotal = Math.max(arredondar(total - lucro), 0);

    const itens: ItemVendaLido[] = brutos.map((b) => {
      const [nomeBase, variacao] = separarParenteses(b.nome);
      const parteDoCusto = total > 0 ? (custoTotal * b.total) / total : 0;
      return {
        nome: b.nome,
        nomeBase,
        variacao,
        quantidade: b.quantidade,
        total: b.total,
        custoUnitario: arredondar(parteDoCusto / b.quantidade),
      };
    });

    const forma = c[5] || null;
    const aPrazo = !!forma && /prazo|fiado|parcel/i.test(forma);
    if (aPrazo) avisos.push("Venda a prazo: não sei ler as parcelas do relatório, por isso não entra por padrão.");

    vendas.push({
      ref: `${numero}|${data}`,
      data,
      itens,
      total,
      custoTotal,
      formaPagamento: forma,
      canal: c[7] || null,
      cliente,
      aPrazo,
      avisos,
    });
  }

  const conferencias: Conferencia[] = [
    ...conferir("Vendas", vendas.length, numeroDoRotulo(paginas, /^Transa[çc][õo]es$/), inteiro),
    ...conferir(
      "Itens vendidos",
      vendas.reduce((s, v) => s + v.itens.reduce((q, i) => q + i.quantidade, 0), 0),
      numeroDoRotulo(paginas, /^Itens vendidos$/),
      inteiro,
    ),
    ...conferir("Total vendido", vendas.reduce((s, v) => s + v.total, 0), dinheiroDoRotulo(paginas, /^Total vendido$/), brl),
    ...conferir(
      "Lucro",
      vendas.reduce((s, v) => s + v.total - v.custoTotal, 0),
      dinheiroDoRotulo(paginas, /^Lucro l[ií]quido$/),
      brl,
    ),
  ];

  const periodo = paginas[0]?.map(textoDaLinha).find((t) => /\d{2}\/\d{2}\s*[–-]\s*\d{2}\/\d{2}/.test(t)) ?? null;
  return { tipo: "vendas", origem: "vendamax", periodo, itens: vendas, avisos: avisosGerais, conferencias };
}

// ---------------------------------------------------------------------------
// extrato de caixa
// ---------------------------------------------------------------------------

function lerCaixa(paginas: Pagina[]): Analise {
  const registros = lerTabela(paginas, ["Data", "Histórico", "Crédito", "Débito", "Saldo"], {
    ehInicio: (c) => lerData(c[0]) !== null,
    ehFim: (t) => RESUMO.test(t),
    ignorar: (t) => RODAPE.test(t),
  });

  const itens: LancamentoLido[] = [];
  const avisos: string[] = [];
  const repeticoes = new Map<string, number>();
  let vendasIgnoradas = 0;
  let totalCreditos = 0;
  let totalDebitos = 0;
  let saldo = dinheiroDoRotulo(paginas, /^Saldo anterior$/) ?? 0;
  let saldoFinalLido: number | null = null;
  let divergencias = 0;

  for (const reg of registros) {
    const c = juntar(reg);
    const data = lerData(c[0]);
    const historico = c[1];
    if (!data || !historico) continue;
    const credito = lerDinheiro(c[2]) ?? 0;
    const debito = lerDinheiro(c[3]) ?? 0;
    const saldoLido = lerDinheiro(c[4]);
    totalCreditos += credito;
    totalDebitos += debito;

    // o saldo corrente de cada linha confirma que crédito e débito foram lidos nas colunas certas
    const esperado = saldo + credito - debito;
    if (saldoLido !== null && Math.abs(saldoLido - esperado) > 0.011) divergencias += 1;
    saldo = saldoLido ?? esperado;
    saldoFinalLido = saldoLido ?? saldoFinalLido;

    if (credito === 0 && debito === 0) continue;

    // vendas já vêm do relatório de vendas; importá-las de novo dobraria o caixa
    if (credito > 0 && /^Venda:/i.test(historico)) {
      vendasIgnoradas += 1;
      continue;
    }

    const tipo = credito > 0 ? "entrada" : "saida";
    const valor = credito > 0 ? credito : debito;

    let origem: LancamentoLido["origem"] = "manual";
    let categoria = "Outros";
    let descricao = historico;
    let produtoNome: string | null = null;

    const compra = historico.match(/^Entrada de estoque:\s*(.+)$/i);
    if (compra && tipo === "saida") {
      const [nome] = separarParenteses(compra[1]);
      origem = "compra";
      categoria = "Fornecimento";
      produtoNome = nome;
    } else {
      const [texto, cat] = separarParenteses(historico);
      descricao = texto;
      if (cat) categoria = cat;
    }

    const chave = `${data}|${tipo}|${valor.toFixed(2)}|${descricao}`;
    const n = (repeticoes.get(chave) ?? 0) + 1;
    repeticoes.set(chave, n);

    itens.push({ ref: `${chave}|${n}`, data, tipo, origem, categoria, descricao, valor, produtoNome });
  }

  if (divergencias > 0) {
    avisos.push(`${divergencias} linha(s) com saldo que não fecha. Confira os valores antes de importar.`);
  }
  if (vendasIgnoradas > 0) {
    avisos.push(
      `${vendasIgnoradas} linha(s) de venda do extrato foram ignoradas: as vendas entram pelo relatório de vendas, senão o caixa contaria em dobro.`,
    );
  }

  const conferencias: Conferencia[] = [
    ...conferir("Total de créditos", totalCreditos, dinheiroDoRotulo(paginas, /^Total de cr[ée]ditos$/), brl),
    ...conferir("Total de débitos", totalDebitos, dinheiroDoRotulo(paginas, /^Total de d[ée]bitos$/), brl),
  ];

  const periodo = paginas[0]?.map(textoDaLinha).find((t) => /^Per[ií]odo:/i.test(t))?.replace(/^Per[ií]odo:\s*/i, "") ?? null;
  return { tipo: "caixa", origem: "vendamax", periodo, itens, vendasIgnoradas, avisos, conferencias };
}
