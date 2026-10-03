import { createClient } from "@/lib/supabase/server";
import { lerPdf } from "@/lib/importacao/pdf";
import { detectarFormato, lerPlanilha } from "@/lib/importacao/planilha";
import { lerRelatorio } from "@/lib/importacao/vendamax";
import { ErroDeLeitura } from "@/lib/importacao/tipos";

// Lê um relatório em PDF ou uma planilha (CSV, Excel) e devolve uma PRÉVIA do que seria
// importado. Não grava nada: quem grava é a ação do servidor, depois que o usuário
// confere e confirma. Uma planilha com várias abas devolve uma prévia por aba.

const TAMANHO_MAXIMO = 4 * 1024 * 1024; // limite de corpo das funções na Vercel é 4,5 MB

function erro(mensagem: string, status: number) {
  return Response.json({ erro: mensagem }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro("Sua sessão expirou. Entre novamente.", 401);

  let arquivo: FormDataEntryValue | null;
  try {
    arquivo = (await request.formData()).get("arquivo");
  } catch {
    return erro("Não consegui receber o arquivo. Tente de novo.", 400);
  }
  if (!(arquivo instanceof File)) return erro("Envie um arquivo de planilha ou PDF.", 400);
  if (arquivo.size > TAMANHO_MAXIMO) return erro("O arquivo passa de 4 MB. Envie um período menor.", 413);

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const formato = detectarFormato(dados);

  try {
    if (formato === "pdf") return Response.json({ analises: [lerRelatorio(await lerPdf(dados))] });
    return Response.json({ analises: await lerPlanilha(dados) });
  } catch (e) {
    if (e instanceof ErroDeLeitura) return erro(e.message, 422);
    console.error("Falha ao ler arquivo de importação", e);
    return erro(
      formato === "pdf"
        ? "Não consegui ler este PDF. Ele pode ser diferente dos relatórios que já conheço."
        : "Não consegui ler este arquivo. Confira se é uma planilha (CSV ou Excel) com títulos nas colunas.",
      500,
    );
  }
}
