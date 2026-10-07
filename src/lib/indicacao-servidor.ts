import { cookies, headers } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { CARENCIA_DIAS, CODIGO_REGEX, COOKIE_REF, comissaoDe, gerarCodigo, percentualDoAfiliado } from "@/lib/indicacao";

// só contas recém-criadas entram numa indicação: quem já usava o Marcon não vira indicado
// ao abrir um link de indicação depois
const JANELA_DO_CADASTRO_MS = 2 * 24 * 60 * 60 * 1000;

// Liga a conta nova a quem a indicou, usando o código guardado no cookie quando a pessoa
// abriu o link. Chamar logo depois do cadastro. Nunca lança: indicação não pode atrapalhar o login.
export async function vincularIndicacao(user: Pick<User, "id" | "created_at">) {
  try {
    const jar = await cookies();
    const codigo = jar.get(COOKIE_REF)?.value;
    if (!codigo) return;
    jar.delete(COOKIE_REF);

    if (!CODIGO_REGEX.test(codigo)) return;
    if (Date.now() - new Date(user.created_at).getTime() > JANELA_DO_CADASTRO_MS) return;

    const admin = createAdminClient();
    if (!admin) return;
    const { data: afiliado } = await admin.from("afiliados").select("owner_id").eq("codigo", codigo).maybeSingle();
    if (!afiliado || afiliado.owner_id === user.id) return;

    await admin
      .from("indicacoes")
      .upsert({ indicado_id: user.id, afiliado_id: afiliado.owner_id }, { onConflict: "indicado_id", ignoreDuplicates: true });
  } catch (e) {
    console.error("[indicacao] não consegui vincular", e);
  }
}

// Cada conta é afiliada desde o primeiro acesso à tela: o link nasce sem cadastro nem aprovação.
export async function garantirAfiliado(supabase: SupabaseClient, userId: string) {
  const existente = async () =>
    (await supabase.from("afiliados").select("codigo, chave_pix, percentual").maybeSingle()).data;

  const atual = await existente();
  if (atual) return atual;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { error } = await supabase.from("afiliados").insert({ owner_id: userId, codigo: gerarCodigo() });
    if (!error) break;
    // 23505: ou o código já existe (tenta outro) ou outra aba criou a linha agora
    if (error.code !== "23505") throw error;
    const criada = await existente();
    if (criada) return criada;
  }
  const criada = await existente();
  if (!criada) throw new Error("Não consegui criar seu link de indicação. Tente de novo.");
  return criada;
}

// endereço público do app, para montar o link de indicação
export async function enderecoDoApp() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocolo = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocolo}://${host}`;
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

interface PagamentoAsaas {
  id?: string;
  value?: number;
}

// Chamado pelo webhook do Asaas. Cobrança paga de um indicado gera comissão (uma vez só,
// pelo id da cobrança); estorno ou chargeback cancela a comissão daquela cobrança.
export async function registrarComissao(admin: Admin, donoDaAssinatura: string, tipo: string, pagamento?: PagamentoAsaas) {
  if (!pagamento?.id) return;

  if (tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED") {
    const valorPago = Number(pagamento.value ?? 0);
    if (!(valorPago > 0)) return;

    const { data: indicacao, error: erroLeitura } = await admin
      .from("indicacoes")
      .select("afiliado_id")
      .eq("indicado_id", donoDaAssinatura)
      .maybeSingle();
    if (erroLeitura) throw erroLeitura;
    if (!indicacao) return;

    const { data: afiliado, error: erroAfiliado } = await admin
      .from("afiliados")
      .select("percentual")
      .eq("owner_id", indicacao.afiliado_id)
      .maybeSingle();
    if (erroAfiliado) throw erroAfiliado;
    const percentual = percentualDoAfiliado(afiliado?.percentual);

    const liberada = new Date(Date.now() + CARENCIA_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from("comissoes").upsert(
      {
        afiliado_id: indicacao.afiliado_id,
        indicado_id: donoDaAssinatura,
        asaas_payment_id: pagamento.id,
        valor_pago: valorPago,
        percentual,
        valor: comissaoDe(valorPago, percentual),
        liberada_em: liberada,
      },
      { onConflict: "asaas_payment_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }

  if (tipo === "PAYMENT_REFUNDED" || tipo === "PAYMENT_CHARGEBACK_REQUESTED") {
    const { error } = await admin
      .from("comissoes")
      .update({ estornada_em: new Date().toISOString() })
      .eq("asaas_payment_id", pagamento.id)
      .is("estornada_em", null);
    if (error) throw error;
  }
}
