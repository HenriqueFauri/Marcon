import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/ajustes";
import { assistenteAtivo, contaPodeEscrever, contaPodeUsar, escritaAtiva } from "@/lib/whatsapp/evolution";
import { PREFIXO, telefoneMascarado } from "@/lib/whatsapp/vinculo";
import { AVISO_EM, COTA_MES, usoDoMes } from "@/lib/whatsapp/uso";
import { ApagarConversa, Desvincular, InterruptorVenda, Vincular } from "./controles";

export const metadata: Metadata = { title: "Assistente no WhatsApp" };

// cada exemplo abre o WhatsApp com a pergunta pronta: mostra o que dá para fazer no mesmo toque
const EXEMPLOS = [
  "quanto vendi hoje?",
  "quem está me devendo?",
  "o que está acabando?",
  "quais produtos vendi essa semana?",
  "como está o caixa do mês?",
  "tenho pedido novo na loja?",
];

export default async function AssistenteWhatsappPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !assistenteAtivo() || !contaPodeUsar(user.email)) redirect("/configuracoes");

  const { data: vinculo } = await supabase.from("whatsapp_vinculos").select("telefone, lancar_venda").maybeSingle();
  const liberadoLancar = escritaAtiva() && contaPodeEscrever(user.email);
  const numero = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
  const voltar = { href: "/configuracoes", label: "Configurações" };

  if (!vinculo) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Assistente no WhatsApp" back={voltar} />
        <Grupo rodape="Você manda um código para o WhatsApp do Marcon e pronto. Dá para desvincular quando quiser.">
          <p className="text-[15px] text-ink">
            {liberadoLancar
              ? "Pergunte estoque, vendas, caixa e quem está devendo, e lance vendas pelo Zap. Antes de lançar, ele sempre pede o seu SIM."
              : "Pergunte estoque, vendas, caixa e quem está devendo, direto pelo Zap."}
          </p>
          <Vincular numeroDoMarcon={numero} prefixo={PREFIXO} />
        </Grupo>
      </div>
    );
  }

  const admin = createAdminClient();
  const usados = admin ? await usoDoMes(admin, user.id).catch(() => 0) : 0;
  const pct = Math.min(100, Math.round((usados / COTA_MES) * 100));
  const noLimite = usados >= COTA_MES;
  const perto = !noLimite && usados >= COTA_MES * AVISO_EM;
  const corDaBarra = noLimite ? "bg-danger" : perto ? "bg-warning" : "bg-positive";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Assistente no WhatsApp" back={voltar} />

      <div className="flex flex-col gap-7">
        <Grupo titulo="Conexão" semPadding>
          <LinhaInfo rotulo="Número" valor={`final ${telefoneMascarado(vinculo.telefone).replace("...", "")}`} />
          <LinhaInfo rotulo="Situação" valor="Ativo" />
        </Grupo>

        <Grupo titulo="Uso do mês" rodape="Só as perguntas contam. Ajuda, limpar, SIM e NÃO não contam. Recomeça no dia 1º.">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[17px] text-ink">
                {usados} de {COTA_MES} perguntas
              </span>
              {(perto || noLimite) && (
                <span className={`text-[13px] font-medium ${noLimite ? "text-danger" : "text-warning"}`}>
                  {noLimite ? "Limite do mês" : "Perto do limite"}
                </span>
              )}
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-fill"
              role="progressbar"
              aria-label="Perguntas usadas no mês"
              aria-valuemin={0}
              aria-valuemax={COTA_MES}
              aria-valuenow={Math.min(usados, COTA_MES)}
            >
              <div className={`h-full rounded-full ${corDaBarra}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </Grupo>

        <Grupo titulo="Experimente" semPadding rodape="Toque para abrir o WhatsApp com a pergunta pronta. Mande ajuda para ver mais.">
          {EXEMPLOS.map((e) => (
            <LinhaLink key={e} href={`https://wa.me/${numero}?text=${encodeURIComponent(e)}`} externo rotulo={e} />
          ))}
        </Grupo>

        <Grupo
          titulo="Ajustes"
          semPadding
          rodape={
            <>
              A conversa fica guardada por 24 horas e as vendas lançadas por aqui, por 90 dias.{" "}
              <Link href="/privacidade" className="text-brand-text underline-offset-2 hover:underline">
                Política de privacidade
              </Link>
            </>
          }
        >
          {liberadoLancar && <InterruptorVenda ligado={vinculo.lancar_venda !== false} />}
          <ApagarConversa />
        </Grupo>

        <Grupo semPadding>
          <Desvincular />
        </Grupo>
      </div>
    </div>
  );
}
