// Cliente mínimo da API do Asaas (só o que a assinatura do Marcon usa).
// Só roda no servidor: a chave de API nunca pode chegar ao navegador.
//
// ASAAS_API_KEY  chave do ambiente (sandbox ou produção)
// ASAAS_ENV      "producao" para cobrar de verdade; qualquer outro valor usa o sandbox

const URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

export function asaasConfigurado() {
  return !!process.env.ASAAS_API_KEY;
}

async function chamar<T>(caminho: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error("A cobrança ainda não foi configurada no servidor.");
  const base = process.env.ASAAS_ENV === "producao" ? URLS.producao : URLS.sandbox;

  const resposta = await fetch(`${base}${caminho}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: chave,
      "User-Agent": "Marcon",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { errors?: { description?: string }[] } | null;
    const detalhe = corpo?.errors?.[0]?.description;
    console.error("Asaas", resposta.status, caminho, JSON.stringify(corpo));
    throw new Error(detalhe ?? "Não foi possível falar com o serviço de cobrança. Tente de novo.");
  }
  return (await resposta.json()) as T;
}

export function criarCliente(dados: { nome: string; email: string; cpfCnpj: string; ownerId: string }) {
  return chamar<{ id: string }>("/customers", {
    method: "POST",
    body: {
      name: dados.nome,
      email: dados.email,
      cpfCnpj: dados.cpfCnpj,
      externalReference: dados.ownerId,
      notificationDisabled: false,
    },
  });
}

// cartão de crédito recorrente: o cliente informa o cartão na página de pagamento
// do Asaas (invoiceUrl), então nenhum dado de cartão passa pelo Marcon
export function criarAssinatura(dados: {
  clienteId: string;
  valor: number;
  descricao: string;
  ownerId: string;
  primeiroVencimento: string;
  // para onde o Asaas manda o cliente depois de pagar; precisa ser do mesmo
  // domínio cadastrado nos dados comerciais da conta do Asaas
  retornoUrl?: string;
}) {
  return chamar<{ id: string }>("/subscriptions", {
    method: "POST",
    body: {
      customer: dados.clienteId,
      billingType: "CREDIT_CARD",
      value: dados.valor,
      nextDueDate: dados.primeiroVencimento,
      cycle: "MONTHLY",
      description: dados.descricao,
      externalReference: dados.ownerId,
      ...(dados.retornoUrl ? { callback: { successUrl: dados.retornoUrl, autoRedirect: true } } : {}),
    },
  });
}

// link da primeira cobrança, onde o cliente paga e cadastra o cartão
export async function linkDePagamento(assinaturaId: string) {
  const lista = await chamar<{ data: { invoiceUrl?: string }[] }>(`/subscriptions/${assinaturaId}/payments?limit=1`);
  return lista.data[0]?.invoiceUrl ?? null;
}

export function cancelarAssinatura(assinaturaId: string) {
  return chamar<{ deleted: boolean }>(`/subscriptions/${assinaturaId}`, { method: "DELETE" });
}
