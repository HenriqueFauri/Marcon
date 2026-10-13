import { rodarRotina } from "@/lib/push/cron";
import { enviarCobrancasDoDia } from "@/lib/push/eventos";

// Todo dia às 11h UTC (8h de Brasília): lembrete das parcelas vencendo hoje ou atrasadas.
export async function GET(request: Request) {
  return rodarRotina(request, "lembretes de cobrança", enviarCobrancasDoDia);
}
