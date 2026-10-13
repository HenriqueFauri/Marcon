import { rodarRotina } from "@/lib/push/cron";
import { enviarResumosDoDia } from "@/lib/push/eventos";

// Todo dia às 23h UTC (20h de Brasília): resumo do dia de quem vendeu. No plano Hobby da Vercel
// a rotina roda uma vez por dia e pode sair em qualquer minuto da hora marcada (20h a 20h59).
export async function GET(request: Request) {
  return rodarRotina(request, "resumo do dia", enviarResumosDoDia);
}
