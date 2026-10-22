import { rodarRotina } from "@/lib/push/cron";
import { enviarCobrancasDoDia, enviarRenovacoesDeAnuncios } from "@/lib/push/eventos";
import { rotinaDeCortesias } from "@/lib/push/cortesias";
import { rotinaDeContas } from "@/lib/push/contas";

// Todo dia às 11h UTC (8h de Brasília): lembrete das parcelas vencendo hoje ou atrasadas e, na mesma
// rotina, o fim e o aviso das cortesias, as contas a pagar e os anúncios para renovar (o plano Hobby da Vercel aceita só 2 rotinas agendadas).
export async function GET(request: Request) {
  return rodarRotina(request, "lembretes de cobrança e cortesias", async (admin) => {
    const cobrancas = await enviarCobrancasDoDia(admin);
    // uma falha nas cortesias não esconde o resultado das cobranças
    const cortesias = await rotinaDeCortesias(admin).catch((e) => {
      console.error("[cron] cortesias", e);
      return { erro: true };
    });
    const contas = await rotinaDeContas(admin).catch((e) => {
      console.error("[cron] contas a pagar", e);
      return { erro: true };
    });
    const anuncios = await enviarRenovacoesDeAnuncios(admin).catch((e) => {
      console.error("[cron] renovar anúncios", e);
      return { erro: true };
    });
    return { cobrancas, cortesias, contas, anuncios };
  });
}
