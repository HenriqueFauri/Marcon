// Textos do resultado de cada importação. Ficam fora das server actions para a tela
// poder montar a mensagem final somando os resultados de vários lotes.

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function mensagemDeProdutos(c: { criados: number; ignorados: number }) {
  return (
    `${plural(c.criados, "produto importado", "produtos importados")}.` +
    (c.ignorados ? ` ${plural(c.ignorados, "já existia", "já existiam")} e foram pulados.` : "")
  );
}

export function mensagemDeVendas(c: { criadas: number; ignoradas: number; itens_sem_produto: number }) {
  return (
    `${plural(c.criadas, "venda importada", "vendas importadas")}.` +
    (c.ignoradas ? ` ${plural(c.ignoradas, "já estava", "já estavam")} no Marcon e foram puladas.` : "") +
    (c.itens_sem_produto
      ? ` ${plural(c.itens_sem_produto, "item ficou", "itens ficaram")} sem ligação com um produto: importe os produtos primeiro, se ainda não fez.`
      : "")
  );
}

export function mensagemDeLancamentos(c: { criados: number; ignorados: number }) {
  return (
    `${plural(c.criados, "lançamento importado", "lançamentos importados")}.` +
    (c.ignorados ? ` ${plural(c.ignorados, "já estava", "já estavam")} no Marcon e foram pulados.` : "")
  );
}
