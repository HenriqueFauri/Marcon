import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, btnPrimary } from "@/components/ui";
import { BannerImagens } from "../banner-imagens";
import { PersonalizacaoForm } from "./personalizacao-form";

export const metadata: Metadata = { title: "Vitrine | Personalizar" };

export default async function VitrinePersonalizarPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: vitrine },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("vitrines").select("*").maybeSingle()]);

  if (!vitrine) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-2">Crie sua loja primeiro: escolha o endereço e o WhatsApp. Depois volte aqui para deixar com a sua cara.</p>
          <Link href="/vitrine/configuracoes" className={btnPrimary}>
            Criar minha loja
          </Link>
        </div>
      </Card>
    );
  }

  const meta = user?.user_metadata ?? {};
  const paths = (vitrine.banner_paths as string[] | undefined) ?? [];
  const { data: assinadas } =
    paths.length > 0 ? await supabase.storage.from("vitrine-banner").createSignedUrls(paths, 3600) : { data: [] };
  const imagens = paths.flatMap((path) => {
    const url = assinadas?.find((a) => a.path === path)?.signedUrl;
    return url ? [{ path, url }] : [];
  });

  return (
    <div className="flex flex-col gap-4">
        <PersonalizacaoForm
          config={{
            cor: vitrine.cor,
            tema: vitrine.tema,
            boasVindas: vitrine.boas_vindas ?? "",
            anuncio: vitrine.anuncio ?? "",
            instagram: vitrine.instagram ?? "",
            mostrarEndereco: vitrine.mostrar_endereco,
            ultimasUnidades: vitrine.ultimas_unidades,
            bannerTitulo: vitrine.banner_titulo ?? "",
            bannerSubtitulo: vitrine.banner_subtitulo ?? "",
            bannerBotao: vitrine.banner_botao ?? "",
          }}
          temEndereco={!!(meta.empresa_endereco as string | undefined)}
          bannerImagens={<BannerImagens imagens={imagens} habilitado />}
        />
      <p className="px-4 text-[13px] text-ink-muted">
        O nome e o logo da loja vêm de{" "}
        <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
          Configurações do app
        </Link>
        , em Dados da empresa.
      </p>
    </div>
  );
}
