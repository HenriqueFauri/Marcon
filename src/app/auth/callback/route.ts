import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { vincularIndicacao } from "@/lib/indicacao-servidor";
import { registrarOrigem } from "@/lib/origem-servidor";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // só caminhos internos: evita redirecionamento aberto pra outro site
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // cadastro por Google ou por link de confirmação: é aqui que a indicação é ligada
      // a origem do cadastro (marcas do link) também é gravada aqui
      if (data.user) {
        await vincularIndicacao(data.user);
        await registrarOrigem(data.user);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=link`);
}
