import "server-only";
import { formatBRL, formatData } from "@/lib/format";
import type { Email } from "./resend";

// Textos dos e-mails. Simples, uma ação só, cores do docs/DESIGN.md (terracota só no botão).
// Sem travessão, sem "fiado", sem citar loja de app.
export function urlDoApp() {
  return (process.env.APP_URL || "https://www.usemarcon.com").replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RODAPE_CLIENTE = "Seus dados continuam guardados. Dúvidas? É só responder este e-mail.";

function montar(
  assunto: string,
  paragrafos: string[],
  botao: string,
  caminho: string,
  rodape: string = RODAPE_CLIENTE,
): Omit<Email, "para"> {
  const link = `${urlDoApp()}${caminho}`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f2f7;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 24px">
<p style="margin:0 0 16px;font-size:13px;color:#636366">UseMarcon</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:600">${esc(assunto)}</h1>
${paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#3c3c43">${esc(p)}</p>`).join("")}
<p style="margin:22px 0 0"><a href="${link}" style="display:inline-block;background:#d45f30;color:#1c0a02;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:999px">${esc(botao)}</a></p>
<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#636366">${esc(rodape)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const texto = `${assunto}\n\n${paragrafos.join("\n\n")}\n\n${botao}: ${link}\n\n${rodape}`;
  return { assunto, html, texto };
}

export type TipoAviso = "teste_3d" | "teste_1d" | "cortesia_3d" | "cortesia_1d";

export function avisoDeFim(tipo: TipoAviso, fim: string): Omit<Email, "para"> {
  const quando = formatData(fim);
  switch (tipo) {
    case "teste_3d":
      return montar(
        "Seu teste termina em 3 dias",
        [`O teste do UseMarcon vale até ${quando}.`, "Depois disso a conta passa para o plano grátis, com limites menores. Para seguir com tudo liberado, assine o plano Marcon."],
        "Ver o plano",
        "/assinatura",
      );
    case "teste_1d":
      return montar(
        "Hoje é o último dia do seu teste",
        ["O teste do UseMarcon acaba hoje.", "Amanhã a conta passa para o plano grátis, com limites menores. Para manter tudo liberado, assine o plano Marcon."],
        "Assinar agora",
        "/assinatura",
      );
    case "cortesia_3d":
      return montar(
        "Sua cortesia termina em 3 dias",
        [`O plano Marcon liberado para você vale até ${quando}.`, "Para continuar com tudo liberado depois dessa data, é só assinar."],
        "Ver o plano",
        "/assinatura",
      );
    case "cortesia_1d":
      return montar(
        "Hoje é o último dia da sua cortesia",
        ["O plano Marcon liberado para você vale até hoje.", "Para continuar com tudo liberado, é só assinar."],
        "Assinar agora",
        "/assinatura",
      );
  }
}

export function avisoDeCobrancaFalhou(): Omit<Email, "para"> {
  return montar(
    "Não conseguimos cobrar sua assinatura",
    ["A última cobrança do plano Marcon não foi paga.", "Abra a tela de assinatura para ver o pagamento e resolver. Assim sua conta segue com tudo liberado."],
    "Abrir assinatura",
    "/assinatura",
  );
}

// Aviso interno ao admin (ADMIN_EMAILS) quando a cobrança de um assinante vence sem pagamento.
export function avisoAdminDeCobrancaFalhou(
  ownerId: string,
  emailDoAssinante: string | null,
  valor: number | undefined,
  avisouAssinante: boolean,
): Omit<Email, "para"> {
  const quem = emailDoAssinante ? `de ${emailDoAssinante}` : `da conta ${ownerId}`;
  const paragrafos = [`A cobrança da assinatura ${quem} venceu sem pagamento.`];
  if (typeof valor === "number" && Number.isFinite(valor)) paragrafos.push(`Valor: ${formatBRL(valor)}.`);
  paragrafos.push(
    avisouAssinante
      ? "O assinante também recebeu um aviso por e-mail."
      : "O aviso por e-mail ao assinante não foi enviado. Vale falar com ele direto.",
  );
  return montar(
    "Cobrança de assinante não foi paga",
    paragrafos,
    "Abrir a conta no admin",
    `/admin/contas/${encodeURIComponent(ownerId)}`,
    "Aviso automático do UseMarcon para o admin.",
  );
}
