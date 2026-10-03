import { createClient } from "@/lib/supabase/server";
import { lerPdf } from "@/lib/importacao/pdf";
import { lerRelatorio } from "@/lib/importacao/vendamax";
import { ErroDeLeitura } from "@/lib/importacao/tipos";

// Lê um relatório em PDF e devolve uma PRÉVIA do que seria importado. Não grava nada:
// quem grava é a ação do servidor, depois que o usuário confere e confirma.
// Planilhas (CSV, Excel) não passam por aqui: são lidas no navegador, sem limite de envio.

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
  if (!(arquivo instanceof File)) return erro("Envie um arquivo PDF.", 400);
  if (arquivo.size > TAMANHO_MAXIMO) return erro("O PDF passa de 4 MB. Exporte um período menor.", 413);

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  if (String.fromCharCode(...dados.slice(0, 5)) !== "%PDF-") return erro("Este arquivo não é um PDF.", 400);

  try {
    return Response.json({ analises: [lerRelatorio(await lerPdf(dados))] });
  } catch (e) {
    if (e instanceof ErroDeLeitura) return erro(e.message, 422);
    console.error("Falha ao ler PDF de importação", e);
    return erro("Não consegui ler este PDF. Ele pode ser diferente dos relatórios que já conheço.", 500);
  }
}
