import "server-only";

// Envio de e-mail pela API REST do Resend (sem dependência). A chave vem de RESEND_API_KEY; sem ela,
// ou se o envio falhar, nada quebra: devolve false e a rotina segue. O remetente usa o domínio
// usemarcon.com, já verificado no Resend.
const REMETENTE = process.env.EMAIL_REMETENTE || "UseMarcon <contato@usemarcon.com>";

export interface Email {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

// true só se o Resend aceitou o e-mail
export async function enviarEmail(email: Email): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    console.warn("[email] RESEND_API_KEY ausente: e-mail não enviado", { assunto: email.assunto });
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [email.para], subject: email.assunto, html: email.html, text: email.texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[email] Resend recusou", { status: r.status, corpo: (await r.text()).slice(0, 300) });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] falha no envio", e instanceof Error ? e.message : String(e));
    return false;
  }
}
