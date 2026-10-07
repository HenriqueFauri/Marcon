"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "@/components/use-action";
import {
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  type CoresDaLoja,
} from "@/lib/vitrine";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { Grupo, Interruptor } from "../campos";
import { EscolhaDeCores } from "./escolha-de-cores";
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
}: {
  config: PersonalizacaoVitrine;
  temEndereco: boolean;
  bannerImagens: ReactNode;
}) {
  const { isPending, run } = useAction();
  const [cores, setCores] = useState(config.cores);
  const [boasVindas, setBoasVindas] = useState(config.boasVindas);
  const [anuncio, setAnuncio] = useState(config.anuncio);

  return (
    <form action={(formData) => run(() => salvarPersonalizacao(formData))} className="flex flex-col gap-7">
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
            defaultValue={config.bannerTitulo}
            maxLength={BANNER_TITULO_MAX}
            placeholder="Novidades da semana"
            className={inputClass}
          />
        </Field>
        <Field label="Subtítulo">
          <input
            name="banner_subtitulo"
            defaultValue={config.bannerSubtitulo}
            maxLength={BANNER_SUBTITULO_MAX}
            placeholder="Até 30% off em fones"
            className={inputClass}
          />
        </Field>
        <Field label="Texto do botão" hint="Leva o cliente aos produtos. Vazio = sem botão.">
          <input
            name="banner_botao"
            defaultValue={config.bannerBotao}
            maxLength={BANNER_BOTAO_MAX}
            placeholder="Ver produtos"
            className={inputClass}
          />
        </Field>
      </Grupo>

      <Grupo titulo="Produtos e rodapé">
        <Interruptor
          name="ultimas_unidades"
          padrao={config.ultimasUnidades}
          titulo="Últimas unidades"
          ajuda="Avisa quando restam de 1 a 5. Acima disso, o estoque não aparece."
        />
        <div className="border-t border-line" />
        <Interruptor
          name="mostrar_endereco"
          padrao={config.mostrarEndereco}
          titulo="Endereço no rodapé"
          ajuda={temEndereco ? "O de Configurações, Dados da empresa." : "Preencha em Configurações, Dados da empresa."}
        />
        <div className="border-t border-line" />
        <Field label="Instagram">
          <div className="flex items-center rounded-xl bg-fill pl-3.5 focus-within:ring-4 focus-within:ring-brand/15">
            <span className="shrink-0 text-[15px] text-ink-muted">@</span>
            <input
              name="instagram"
              defaultValue={config.instagram}
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
  );
}
