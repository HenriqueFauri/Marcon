import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SLUG_REGEX, type Banner, type BannerBruto, type Vitrine, type VitrineBruta } from "@/lib/vitrine";

// a mesma página gera os metadados e a tela: com cache, a consulta roda uma vez por pedido
export const buscarVitrine = cache(async (slug: string): Promise<Vitrine | null> => {
  const slugLimpo = slug.toLowerCase();
  if (!SLUG_REGEX.test(slugLimpo)) return null;
  const supabase = await createClient();
  // o banner vem de função própria; se ela ainda não existe no banco (migration 0027), a loja abre sem banner
  const [{ data }, { data: dadosBanner }] = await Promise.all([
    supabase.rpc("vitrine_publica", { p_slug: slugLimpo }),
    supabase.rpc("vitrine_banner", { p_slug: slugLimpo }),
  ]);
  const bruta = data as VitrineBruta | null;
  if (!bruta) return null;
  const bannerBruto = dadosBanner as BannerBruto | null;

  // os buckets são privados: a chave de serviço assina links curtos só para esta página
  const admin = createAdminClient();
  const urls = new Map<string, string>();
  let logoUrl: string | null = null;
  let banner: Banner | null = null;
  if (admin) {
    const paths = [...new Set(bruta.produtos.flatMap((p) => p.fotos.map((f) => f.path)))];
    if (paths.length > 0) {
      const { data: assinadas } = await admin.storage.from("produto-fotos").createSignedUrls(paths, 3600);
      for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
    }
    if (bruta.loja.logo_path) {
      const { data: logo } = await admin.storage.from("logo-empresa").createSignedUrl(bruta.loja.logo_path, 3600);
      logoUrl = logo?.signedUrl ?? null;
    }
    if (bannerBruto && (bannerBruto.paths.length > 0 || bannerBruto.titulo)) {
      const { data: assinadas } =
        bannerBruto.paths.length > 0
          ? await admin.storage.from("vitrine-banner").createSignedUrls(bannerBruto.paths, 3600)
          : { data: [] };
      const porPath = new Map((assinadas ?? []).flatMap((a) => (a.path && a.signedUrl ? [[a.path, a.signedUrl] as const] : [])));
      banner = {
        urls: bannerBruto.paths.flatMap((p) => porPath.get(p) ?? []),
        titulo: bannerBruto.titulo,
        subtitulo: bannerBruto.subtitulo,
        botao: bannerBruto.botao,
      };
    }
  }

  const { logo_path: _logo, ...loja } = bruta.loja;
  void _logo;
  return {
    loja: { ...loja, logoUrl },
    banner,
    produtos: bruta.produtos.map((p) => ({
      ...p,
      fotos: p.fotos.flatMap((f) => {
        const url = urls.get(f.path);
        return url ? [{ url, variacaoId: f.variacao_id }] : [];
      }),
    })),
  };
});
