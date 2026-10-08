import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { CODIGO_REGEX, COOKIE_REF, DIAS_DO_COOKIE } from "@/lib/indicacao";

export async function proxy(request: NextRequest) {
  const resposta = await updateSession(request);

  // link de indicação (?ref=codigo): guarda o código para ligar a conta nova a quem indicou
  const ref = request.nextUrl.searchParams.get("ref")?.toLowerCase();
  if (ref && CODIGO_REGEX.test(ref)) {
    resposta.cookies.set(COOKIE_REF, ref, {
      maxAge: DIAS_DO_COOKIE * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return resposta;
}

export const config = {
  matcher: [
    "/((?!api/cron|api/asaas|api/whatsapp|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
