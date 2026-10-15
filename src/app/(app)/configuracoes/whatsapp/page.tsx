import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, PageHeader, btnPrimary } from "@/components/ui";
import { Grupo, LinhaLink } from "@/components/ajustes";
import { acessoDoAssistente } from "@/lib/whatsapp/acesso";
import { PREFIXO, telefoneMascarado } from "@/lib/whatsapp/vinculo";
import { AVISO_EM, cotasDa, usoDoMes } from "@/lib/whatsapp/uso";
import { gruposLiberados } from "@/lib/whatsapp/rascunho";
import { ApagarConversa, Desvincular, InterruptorConfirmacao, InterruptorVenda, Vincular } from "./controles";

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
  const acesso = await acessoDoAssistente(user);
  if (!user || !acesso.usar) redirect("/configuracoes");

  const { data: vinculo } = await supabase.from("whatsapp_vinculos").select("telefone, lancar_venda, sem_confirmar").maybeSingle();
  const liberadoLancar = acesso.lancar;
  const numero = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
  const voltar = { href: "/configuracoes", label: "Configurações" };

  if (!vinculo) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Assistente <Badge>Não vinculado</Badge>
            </span>
          }
          back={voltar}
        />
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
  const COTA_MES = cotasDa(acesso.admin).mes;
  const pct = Math.min(100, Math.round((usados / COTA_MES) * 100));
  const noLimite = usados >= COTA_MES;
  const perto = !noLimite && usados >= COTA_MES * AVISO_EM;
  // um interruptor por tipo que o servidor liberou; a venda some junto com o interruptor "Lançar vendas"
  const semConfirmar = (vinculo.sem_confirmar ?? []) as string[];
  const confirmacoes = [
    liberadoLancar && vinculo.lancar_venda !== false ? { grupo: "venda", titulo: "Vendas" } : null,
    ...(liberadoLancar
      ? gruposLiberados().map((g) => ({ grupo: g, titulo: { produto: "Produtos novos", estoque: "Estoque", caixa: "Caixa" }[g] }))
      : []),
  ].filter((c): c is { grupo: string; titulo: string } => c !== null);
  const corDaBarra = noLimite ? "bg-danger" : perto ? "bg-warning" : "bg-positive";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Assistente <Badge tone="positive">Ativo</Badge>
          </span>
        }
        description={`WhatsApp final ${telefoneMascarado(vinculo.telefone).replace("...", "")}`}
        back={voltar}
      />

      <div className="flex flex-col gap-7">
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
          {numero && (
            <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full sm:w-auto sm:self-start`}>
              Abrir o WhatsApp
            </a>
          )}
        </Grupo>

        <Grupo titulo="Experimente" semPadding rodape="Toque para abrir o WhatsApp com a pergunta pronta. Mande ajuda para ver mais.">
          {EXEMPLOS.map((e) => (
            <LinhaLink key={e} href={`https://wa.me/${numero}?text=${encodeURIComponent(e)}`} externo rotulo={e} />
          ))}
        </Grupo>

        {confirmacoes.length > 0 && (
          <Grupo
            titulo="Pedir meu SIM antes de lançar"
            semPadding
            rodape="Desligado, o assistente lança na hora e conta o que fez. Por voz, só lanço sem o SIM quando entendo o áudio com segurança; se ficar qualquer dúvida, peço o SIM."
          >
            {confirmacoes.map((c) => (
              <InterruptorConfirmacao key={c.grupo} grupo={c.grupo} titulo={c.titulo} pedir={!semConfirmar.includes(c.grupo)} />
            ))}
          </Grupo>
        )}

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
