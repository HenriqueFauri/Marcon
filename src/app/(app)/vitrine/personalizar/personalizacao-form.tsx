"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "@/components/use-action";
import {
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  PALETAS,
  type Tema,
} from "@/lib/vitrine";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { Interruptor, Secao } from "../campos";
import { salvarPersonalizacao } from "../actions";

export interface PersonalizacaoVitrine {
  cor: string;
  tema: Tema;
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
  const [cor, setCor] = useState(config.cor);
  const [tema, setTema] = useState<Tema>(config.tema);
  const [boasVindas, setBoasVindas] = useState(config.boasVindas);
  const [anuncio, setAnuncio] = useState(config.anuncio);

  return (
    <form action={(formData) => run(() => salvarPersonalizacao(formData))} className="flex flex-col gap-6">
      <Secao titulo="Cores">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-muted">Paletas prontas</p>
          <div className="flex flex-wrap gap-2">
            {PALETAS.map((p) => {
              const ativa = p.cor.toLowerCase() === cor.toLowerCase() && p.tema === tema;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => {
                    setCor(p.cor);
                    setTema(p.tema);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                    ativa ? "border-brand bg-brand-tint font-medium text-brand-text" : "border-line hover:bg-fill"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-line" style={{ background: p.cor }} />
                  {p.nome}
                </button>
              );
            })}
          </div>
        </div>
        <input type="hidden" name="tema" value={tema} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cor de destaque">
            <input
              name="cor"
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-11 w-24 cursor-pointer rounded-xl border border-line bg-fill p-1"
            />
          </Field>
          <Field label="Fundo da loja">
            <select value={tema} onChange={(e) => setTema(e.target.value as Tema)} className={inputClass}>
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </select>
          </Field>
        </div>
      </Secao>

      <Secao titulo="Textos do topo">
        <Field label="Frase de boas-vindas (opcional)" hint={`Aparece embaixo do nome da loja. ${boasVindas.length}/${BOAS_VINDAS_MAX}`}>
          <input
            name="boas_vindas"
            value={boasVindas}
            onChange={(e) => setBoasVindas(e.target.value)}
            maxLength={BOAS_VINDAS_MAX}
            placeholder="Ex: Entregamos em toda a cidade. Chame no WhatsApp!"
            className={inputClass}
          />
        </Field>
        <Field label="Barra de anúncio (opcional)" hint={`Faixa colorida no alto da loja. ${anuncio.length}/${ANUNCIO_MAX}`}>
          <input
            name="anuncio"
            value={anuncio}
            onChange={(e) => setAnuncio(e.target.value)}
            maxLength={ANUNCIO_MAX}
            placeholder="Ex: Frete grátis acima de R$ 150"
            className={inputClass}
          />
        </Field>
      </Secao>

      <Secao
        titulo="Banner principal"
        descricao="Imagem grande no topo da loja, com até 3 em carrossel. Os textos são opcionais; sem imagem, o banner usa a cor de destaque."
      >
        {bannerImagens}
        <Field label="Título" hint={`Até ${BANNER_TITULO_MAX} letras`}>
          <input
            name="banner_titulo"
            defaultValue={config.bannerTitulo}
            maxLength={BANNER_TITULO_MAX}
            placeholder="Ex: Novidades da semana"
            className={inputClass}
          />
        </Field>
        <Field label="Subtítulo" hint={`Até ${BANNER_SUBTITULO_MAX} letras`}>
          <input
            name="banner_subtitulo"
            defaultValue={config.bannerSubtitulo}
            maxLength={BANNER_SUBTITULO_MAX}
            placeholder="Ex: Até 30% off em fones e acessórios"
            className={inputClass}
          />
        </Field>
        <Field label="Texto do botão (opcional)" hint="O botão leva o cliente aos produtos. Vazio = sem botão.">
          <input
            name="banner_botao"
            defaultValue={config.bannerBotao}
            maxLength={BANNER_BOTAO_MAX}
            placeholder="Ex: Ver produtos"
            className={`${inputClass} sm:max-w-xs`}
          />
        </Field>
      </Secao>

      <Secao titulo="Produtos e rodapé">
        <Interruptor
          name="ultimas_unidades"
          padrao={config.ultimasUnidades}
          titulo='Avisar "Últimas unidades"'
          ajuda="Mostra quantas restam só quando sobram de 1 a 5. Acima disso o estoque não aparece."
        />
        <Field label="Instagram no rodapé (opcional)">
          <input
            name="instagram"
            defaultValue={config.instagram}
            placeholder="@sualoja"
            className={inputClass}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>
        <Interruptor
          name="mostrar_endereco"
          padrao={config.mostrarEndereco}
          titulo="Mostrar meu endereço no rodapé"
          ajuda={temEndereco ? "Usa o endereço de Configurações > Dados da empresa." : "Preencha o endereço em Configurações > Dados da empresa."}
        />
      </Secao>

      <div className="border-t border-line pt-4">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
          {isPending ? "Salvando..." : "Salvar personalização"}
        </button>
      </div>
    </form>
  );
}
