"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { formatarTelefone } from "@/lib/format";
import {
  ANUNCIO_MAX,
  BANNER_BOTAO_MAX,
  BANNER_SUBTITULO_MAX,
  BANNER_TITULO_MAX,
  BOAS_VINDAS_MAX,
  COR_PADRAO,
  ENTREGAS,
  PALETAS,
  sugerirSlug,
  type Entrega,
  type Tema,
} from "@/lib/vitrine";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { salvarVitrine } from "./actions";

export interface VitrineConfig {
  slug: string;
  ativa: boolean;
  whatsapp: string;
  cor: string;
  tema: Tema;
  boasVindas: string;
  anuncio: string;
  entrega: Entrega;
  freteFixo: string;
  instagram: string;
  mostrarEndereco: boolean;
  ultimasUnidades: boolean;
  bannerTitulo: string;
  bannerSubtitulo: string;
  bannerBotao: string;
}

function Interruptor({ name, padrao, titulo, ajuda }: { name: string; padrao: boolean; titulo: string; ajuda: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl bg-fill/60 px-4 py-3">
      <input type="checkbox" name={name} defaultChecked={padrao} className="mt-0.5 h-4 w-4 accent-brand" />
      <span className="text-sm">
        <span className="font-medium text-ink">{titulo}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5">
      <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

export function VitrineForm({
  config,
  nomeNegocio,
  telefoneEmpresa,
  temEndereco,
  base,
  produtosNaVitrine,
  temPlano,
  bannerImagens,
}: {
  config: VitrineConfig | null;
  nomeNegocio: string;
  telefoneEmpresa: string;
  temEndereco: boolean;
  base: string;
  produtosNaVitrine: number;
  temPlano: boolean;
  bannerImagens: ReactNode;
}) {
  const { isPending, run } = useAction();
  const toast = useToast();
  const [slug, setSlug] = useState(config?.slug ?? sugerirSlug(nomeNegocio));
  const [whatsapp, setWhatsapp] = useState(formatarTelefone(config?.whatsapp ?? telefoneEmpresa));
  const [cor, setCor] = useState(config?.cor ?? COR_PADRAO);
  const [tema, setTema] = useState<Tema>(config?.tema ?? "claro");
  const [boasVindas, setBoasVindas] = useState(config?.boasVindas ?? "");
  const [anuncio, setAnuncio] = useState(config?.anuncio ?? "");
  const [entrega, setEntrega] = useState<Entrega>(config?.entrega ?? "ambos");

  const link = `${base}/loja/${slug || "sua-loja"}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie.");
    }
  }

  if (!temPlano) {
    return (
      <p className="rounded-xl bg-fill/60 px-4 py-3 text-sm text-ink-2">
        A vitrine faz parte do plano Marcon (e do teste de 14 dias). Assine para ter a sua loja online com link.
      </p>
    );
  }

  return (
    <form action={(formData) => run(() => salvarVitrine(formData))} className="flex flex-col gap-5">
      <Interruptor
        name="ativa"
        padrao={config?.ativa ?? true}
        titulo="Vitrine no ar"
        ajuda={'Desligada, o link mostra "loja não encontrada". Escolha os produtos em cada cadastro ("Mostrar na vitrine").'}
      />

      <Field label="Endereço da loja" hint="De 3 a 40 letras minúsculas, números ou hífen.">
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          required
          minLength={3}
          maxLength={40}
          placeholder="minha-loja"
          className={inputClass}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
      <p className="-mt-3 break-all text-xs text-ink-muted">{link}</p>

      <Field label="WhatsApp que recebe os pedidos">
        <input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          required
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatarTelefone(e.target.value))}
          placeholder="(11) 99999-9999"
          className={inputClass}
        />
      </Field>

      <Secao titulo="Aparência">
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
        <Field label="Frase de boas-vindas (opcional)" hint={`${boasVindas.length}/${BOAS_VINDAS_MAX}`}>
          <input
            name="boas_vindas"
            value={boasVindas}
            onChange={(e) => setBoasVindas(e.target.value)}
            maxLength={BOAS_VINDAS_MAX}
            placeholder="Ex: Entregamos em toda a cidade. Chame no WhatsApp!"
            className={inputClass}
          />
        </Field>
        <Field label="Barra de anúncio no topo (opcional)" hint={`${anuncio.length}/${ANUNCIO_MAX}`}>
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

      <Secao titulo="Banner principal">
        <p className="-mt-2 text-xs text-ink-muted">
          Imagem grande no topo da loja, com até 3 em carrossel. Os textos são opcionais; sem imagem, o banner usa a cor de destaque.
        </p>
        {bannerImagens}
        <Field label="Título" hint={`Até ${BANNER_TITULO_MAX} letras`}>
          <input
            name="banner_titulo"
            defaultValue={config?.bannerTitulo ?? ""}
            maxLength={BANNER_TITULO_MAX}
            placeholder="Ex: Novidades da semana"
            className={inputClass}
          />
        </Field>
        <Field label="Subtítulo" hint={`Até ${BANNER_SUBTITULO_MAX} letras`}>
          <input
            name="banner_subtitulo"
            defaultValue={config?.bannerSubtitulo ?? ""}
            maxLength={BANNER_SUBTITULO_MAX}
            placeholder="Ex: Até 30% off em fones e acessórios"
            className={inputClass}
          />
        </Field>
        <Field label="Texto do botão (opcional)" hint="O botão leva o cliente aos produtos. Vazio = sem botão.">
          <input
            name="banner_botao"
            defaultValue={config?.bannerBotao ?? ""}
            maxLength={BANNER_BOTAO_MAX}
            placeholder="Ex: Ver produtos"
            className={`${inputClass} sm:max-w-xs`}
          />
        </Field>
      </Secao>

      <Secao titulo="Entrega">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ENTREGAS.map((e) => (
            <label
              key={e.valor}
              className={`cursor-pointer rounded-xl border px-3.5 py-3 text-sm transition ${
                entrega === e.valor ? "border-brand bg-brand-tint" : "border-line hover:bg-fill"
              }`}
            >
              <input
                type="radio"
                name="entrega"
                value={e.valor}
                checked={entrega === e.valor}
                onChange={() => setEntrega(e.valor)}
                className="sr-only"
              />
              <span className="block font-medium text-ink">{e.titulo}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{e.ajuda}</span>
            </label>
          ))}
        </div>
        {entrega !== "retirada" && (
          <Field label="Frete fixo (opcional)" hint="Somado ao total quando o cliente escolhe entrega. Vazio = combinar no WhatsApp.">
            <input
              name="frete_fixo"
              inputMode="decimal"
              defaultValue={config?.freteFixo ?? ""}
              placeholder="Ex: 10,00"
              className={`${inputClass} sm:max-w-40`}
            />
          </Field>
        )}
      </Secao>

      <Secao titulo="Rodapé e vendas">
        <Field label="Instagram (opcional)">
          <input
            name="instagram"
            defaultValue={config?.instagram ?? ""}
            placeholder="@sualoja"
            className={inputClass}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>
        <Interruptor
          name="mostrar_endereco"
          padrao={config?.mostrarEndereco ?? false}
          titulo="Mostrar meu endereço no rodapé"
          ajuda={temEndereco ? "Usa o endereço de Configurações > Dados da empresa." : "Preencha o endereço em Configurações > Dados da empresa."}
        />
        <Interruptor
          name="ultimas_unidades"
          padrao={config?.ultimasUnidades ?? true}
          titulo='Avisar "Últimas unidades"'
          ajuda="Mostra quantas restam só quando sobram de 1 a 5. Acima disso o estoque não aparece."
        />
      </Secao>

      <p className="text-xs text-ink-muted">
        {produtosNaVitrine === 0
          ? 'Nenhum produto marcado ainda. Abra um produto, edite e ligue "Mostrar na vitrine".'
          : `${produtosNaVitrine} ${produtosNaVitrine === 1 ? "produto aparece" : "produtos aparecem"} na vitrine.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar vitrine"}
        </button>
        {config && (
          <>
            <button type="button" onClick={copiar} className={btnSecondary}>
              Copiar link
            </button>
            {config.ativa && (
              <a href={`/loja/${config.slug}`} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                Ver loja
              </a>
            )}
          </>
        )}
      </div>
    </form>
  );
}
