import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dataISONoFuso, hojeISO, somarDias } from "@/lib/format";
import { DIAS_DE_TESTE } from "@/lib/planos";
import { emailsAdmin } from "@/lib/admin";
import { avisoAdminDeCobrancaFalhou, avisoDeCobrancaFalhou, avisoDeFim, type TipoAviso } from "./modelos";
import { enviarEmail } from "./resend";

type Tipo = TipoAviso | "cobranca_falhou";

// Envia o e-mail uma vez só por (dono, tipo, referência). Reserva a linha antes de enviar: se o envio
// falhar, solta a reserva para tentar de novo na próxima rotina. Nunca lança erro.
async function enviarUmaVez(
  admin: SupabaseClient,
  ownerId: string,
  email: string,
  tipo: Tipo,
  referencia: string,
  conteudo: { assunto: string; html: string; texto: string },
) {
  try {
    if (!process.env.RESEND_API_KEY) return false; // sem chave: não registra, para enviar quando houver
    const { data, error } = await admin
      .from("emails_enviados")
      .upsert({ owner_id: ownerId, tipo, referencia }, { onConflict: "owner_id,tipo,referencia", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    if (!data?.length) return false; // já enviado
    const ok = await enviarEmail({ para: email, ...conteudo });
    if (!ok) await admin.from("emails_enviados").delete().eq("owner_id", ownerId).eq("tipo", tipo).eq("referencia", referencia);
    return ok;
  } catch (e) {
    console.error("[email] enviarUmaVez", { tipo, erro: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

// Rotina diária: aviso 3 dias e 1 dia antes do fim do teste e da cortesia. Roda junto da rotina das 8h.
export async function rotinaDeEmailsDeCiclo(admin: SupabaseClient) {
  if (!process.env.RESEND_API_KEY) return { desligado: true };
  const hoje = hojeISO();
  const em3 = somarDias(hoje, 2); // 3 dias contando hoje
  const em1 = hoje; // último dia

  const { data: linhas, error } = await admin
    .from("assinaturas")
    .select("owner_id, status, cortesia_ate, proximo_vencimento")
    .limit(10000);
  if (error) throw error;
  const porDono = new Map((linhas ?? []).map((l) => [l.owner_id as string, l]));

  let enviados = 0;
  for (let pagina = 1; ; pagina++) {
    const { data, error: erroUsers } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (erroUsers) throw erroUsers;
    for (const u of data.users) {
      if (!u.email || !u.created_at) continue;
      const linha = porDono.get(u.id);
      let tipo: TipoAviso | null = null;
      let fim = "";
      if (linha?.status === "cortesia" && linha.cortesia_ate) {
        fim = linha.cortesia_ate as string;
        if (fim === em3) tipo = "cortesia_3d";
        else if (fim === em1) tipo = "cortesia_1d";
      } else if (!linha || linha.status === "pendente" || linha.status === "cancelada") {
        // sem plano pago valendo: vale o teste, contado da criação da conta. Cancelada ou pendente
        // com período pago ainda valendo não recebe aviso de teste.
        const pagoAte = linha?.proximo_vencimento as string | null | undefined;
        if (pagoAte && pagoAte >= hoje) continue;
        fim = dataISONoFuso(new Date(Date.parse(u.created_at) + DIAS_DE_TESTE * 86_400_000));
        if (fim === em3) tipo = "teste_3d";
        else if (fim === em1) tipo = "teste_1d";
      }
      if (!tipo) continue;
      if (await enviarUmaVez(admin, u.id, u.email, tipo, fim, avisoDeFim(tipo, fim))) enviados++;
    }
    if (data.users.length < 1000) break;
  }
  return { enviados };
}

// Chamado pelo webhook do Asaas quando uma cobrança vence sem pagamento. Não altera a cobrança.
// Avisa o assinante e cada e-mail de ADMIN_EMAILS. O aviso ao admin usa o mesmo registro em
// emails_enviados (tipo cobranca_falhou, na linha do assinante) com a referência "admin:<e-mail>:<cobrança>",
// para não precisar de outro tipo no check da 0070 e não repetir se o Asaas reenviar o evento.
export async function avisarCobrancaFalhou(
  admin: SupabaseClient,
  ownerId: string,
  cobrancaId: string | undefined,
  valor?: number,
) {
  try {
    const { data } = await admin.auth.admin.getUserById(ownerId);
    const email = data.user?.email;
    if (!email) return;
    const referencia = cobrancaId ?? hojeISO();
    await enviarUmaVez(admin, ownerId, email, "cobranca_falhou", referencia, avisoDeCobrancaFalhou());
    const avisoAdmin = avisoAdminDeCobrancaFalhou(ownerId, email, valor);
    for (const emailAdmin of emailsAdmin()) {
      await enviarUmaVez(admin, ownerId, emailAdmin, "cobranca_falhou", `admin:${emailAdmin}:${referencia}`, avisoAdmin);
    }
  } catch (e) {
    console.error("[email] cobrança falhou", e instanceof Error ? e.message : String(e));
  }
}
