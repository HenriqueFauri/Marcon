import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enderecoDoApp } from "@/lib/indicacao-servidor";
import { lerUso } from "@/lib/uso";
import { Card, PageHeader } from "@/components/ui";
import { BannerImagens } from "./banner-imagens";
import { VitrineForm } from "./vitrine-form";

export const metadata: Metadata = { title: "Vitrine" };

export default async function VitrinePage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: vitrine },
    { count: naVitrine },
    uso,
    base,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("vitrines").select("*").maybeSingle(),
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("na_vitrine", true),
    lerUso(supabase),
    enderecoDoApp(),
  ]);

  const meta = user?.user_metadata ?? {};
  const paths = (vitrine?.banner_paths as string[] | undefined) ?? [];
  const { data: assinadas } =
    paths.length > 0 ? await supabase.storage.from("vitrine-banner").createSignedUrls(paths, 3600) : { data: [] };
  const imagens = paths.flatMap((path) => {
    const url = assinadas?.find((a) => a.path === path)?.signedUrl;
    return url ? [{ path, url }] : [];
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Vitrine"
        description="Sua loja online com link: o cliente escolhe os produtos e o pedido chega pronto no seu WhatsApp."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <VitrineForm
            config={
              vitrine
                ? {
                    slug: vitrine.slug,
                    ativa: vitrine.ativa,
                    whatsapp: vitrine.whatsapp,
                    cor: vitrine.cor,
                    tema: vitrine.tema,
                    boasVindas: vitrine.boas_vindas ?? "",
                    anuncio: vitrine.anuncio ?? "",
                    entrega: vitrine.entrega,
                    freteFixo: vitrine.frete_fixo === null ? "" : String(vitrine.frete_fixo).replace(".", ","),
                    instagram: vitrine.instagram ?? "",
                    mostrarEndereco: vitrine.mostrar_endereco,
                    ultimasUnidades: vitrine.ultimas_unidades,
                    bannerTitulo: vitrine.banner_titulo ?? "",
                    bannerSubtitulo: vitrine.banner_subtitulo ?? "",
                    bannerBotao: vitrine.banner_botao ?? "",
                  }
                : null
            }
            nomeNegocio={(meta.nome_negocio as string | undefined) ?? ""}
            telefoneEmpresa={(meta.empresa_telefone as string | undefined) ?? ""}
            temEndereco={!!(meta.empresa_endereco as string | undefined)}
            base={base}
            produtosNaVitrine={naVitrine ?? 0}
            temPlano={uso ? uso.plano !== "gratis" : true}
            bannerImagens={<BannerImagens imagens={imagens} habilitado={!!vitrine} />}
          />
        </Card>
        <p className="text-xs text-ink-muted">
          O logo e o endereço vêm de{" "}
          <Link href="/configuracoes" className="font-medium text-brand-text hover:underline">
            Configurações
          </Link>
          , e as formas de pagamento também. Os produtos você escolhe em cada cadastro.
        </p>
      </div>
    </div>
  );
}
