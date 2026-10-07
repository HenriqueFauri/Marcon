"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useAction } from "@/components/use-action";
import {
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  type CoresDaLoja,
  type DadosDaPrevia,
} from "@/lib/vitrine";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { Grupo, Interruptor, LinhaLink } from "../campos";
import { EscolhaDeCores } from "./escolha-de-cores";
import { PreviaAoVivo } from "./previa-ao-vivo";
import { salvarPersonalizacao } from "../actions";

export interface PersonalizacaoVitrine {
  cores: CoresDaLoja;
  boasVindas: string;
  anuncio: string;
  instagram: string;
  mostrarEndereco: boolean;
  ultimasUnidades: boolean;
  bannerTitulo: string;
  bannerSubtitulo: string;
  bannerBotao: string;
}

export function PersonalizacaoForm({
  config,
  temEndereco,
  bannerImagens,
  bannerUrls,
}: {
  config: PersonalizacaoVitrine;
  temEndereco: boolean;
  bannerImagens: ReactNode;
  bannerUrls: string[];
}) {
  const { isPending, run } = useAction();
  const [cores, setCores] = useState(config.cores);
  const [boasVindas, setBoasVindas] = useState(config.boasVindas);
  const [anuncio, setAnuncio] = useState(config.anuncio);
  const [instagram, setInstagram] = useState(config.instagram);
  const [bannerTitulo, setBannerTitulo] = useState(config.bannerTitulo);
  const [bannerSubtitulo, setBannerSubtitulo] = useState(config.bannerSubtitulo);
  const [bannerBotao, setBannerBotao] = useState(config.bannerBotao);
  const dadosDaPrevia = useMemo<DadosDaPrevia>(
    () => ({
      cores,
      boasVindas,
      anuncio,
      instagram,
      banner: {
        urls: bannerUrls,
        titulo: bannerTitulo.trim() || null,
        subtitulo: bannerSubtitulo.trim() || null,
        botao: bannerBotao.trim() || null,
      },
    }),
    [cores, boasVindas, anuncio, instagram, bannerUrls, bannerTitulo, bannerSubtitulo, bannerBotao],
  );

  return (
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-10">
      {/* no celular, o botão da prévia vem antes do formulário; no computador, a moldura fica à direita */}
      <div className="lg:col-start-2 lg:row-start-1 lg:h-full">
        <PreviaAoVivo dados={dadosDaPrevia} />
      </div>
      <form
        action={(formData) => run(() => salvarPersonalizacao(formData))}
        className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-start-1"
      >
        <Grupo titulo="Loja" semPadding rodape="O nome e o logo são os mesmos do app, em Configurações, Dados da empresa.">
          <LinhaLink href="/configuracoes" rotulo="Nome e logo" detalhe="Configurações" />
        </Grupo>

        <EscolhaDeCores cores={cores} onMudar={setCores} />

        <Grupo titulo="Topo da loja">
          <Field label="Frase de boas-vindas" hint={`Embaixo do nome da loja. ${boasVindas.length}/${BOAS_VINDAS_MAX}`}>
            <input
              name="boas_vindas"
              value={boasVindas}
              onChange={(e) => setBoasVindas(e.target.value)}
              maxLength={BOAS_VINDAS_MAX}
              placeholder="Entregamos em toda a cidade"
              className={inputClass}
            />
          </Field>
          <Field label="Barra de anúncio" hint={`Faixa colorida no alto. ${anuncio.length}/${ANUNCIO_MAX}`}>
            <input
              name="anuncio"
              value={anuncio}
              onChange={(e) => setAnuncio(e.target.value)}
              maxLength={ANUNCIO_MAX}
              placeholder="Frete grátis acima de R$ 150"
              className={inputClass}
            />
          </Field>
        </Grupo>

        <Grupo titulo="Banner" rodape="Até 3 imagens em carrossel. Sem imagem, o banner usa a cor de destaque.">
          {bannerImagens}
          <Field label="Título">
            <input
              name="banner_titulo"
              value={bannerTitulo}
              onChange={(e) => setBannerTitulo(e.target.value)}
              maxLength={BANNER_TITULO_MAX}
              placeholder="Novidades da semana"
              className={inputClass}
            />
          </Field>
          <Field label="Subtítulo">
            <input
              name="banner_subtitulo"
              value={bannerSubtitulo}
              onChange={(e) => setBannerSubtitulo(e.target.value)}
              maxLength={BANNER_SUBTITULO_MAX}
              placeholder="Até 30% off em fones"
              className={inputClass}
            />
          </Field>
          <Field label="Texto do botão" hint="Leva o cliente aos produtos. Vazio = sem botão.">
            <input
              name="banner_botao"
              value={bannerBotao}
              onChange={(e) => setBannerBotao(e.target.value)}
              maxLength={BANNER_BOTAO_MAX}
              placeholder="Ver produtos"
              className={inputClass}
            />
          </Field>
        </Grupo>

        <Grupo titulo="Produtos">
          <Interruptor
            name="ultimas_unidades"
            padrao={config.ultimasUnidades}
            titulo="Últimas unidades"
            ajuda="Avisa quando restam de 1 a 5. Acima disso, o estoque não aparece."
          />
        </Grupo>

        <Grupo titulo="Rodapé">
          <Interruptor
            name="mostrar_endereco"
            padrao={config.mostrarEndereco}
            titulo="Mostrar endereço"
            ajuda={temEndereco ? "O de Configurações, Dados da empresa." : "Preencha em Configurações, Dados da empresa."}
          />
          <div className="border-t border-line" />
          <Field label="Instagram">
            <div className="flex items-center rounded-xl bg-fill pl-3.5 focus-within:ring-4 focus-within:ring-brand/15">
              <span className="shrink-0 text-[15px] text-ink-muted">@</span>
              <input
                name="instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="sualoja"
                className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          </Field>
        </Grupo>

        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full py-3 sm:w-auto sm:self-start`}>
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
