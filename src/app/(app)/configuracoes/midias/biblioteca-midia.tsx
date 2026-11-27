"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Grupo } from "@/components/ajustes";
import { ConfirmButton } from "@/components/confirm-button";
import { RotuloAcao } from "@/components/rotulo-acao";
import { SetaLink, linkPendente } from "@/components/seta-link";
import { useToast } from "@/components/toaster";
import { useAction } from "@/components/use-action";
import { EmptyState, Field, PageHeader, Segmentos, btnGhost, btnPrimary, inputClass } from "@/components/ui";
import { comprimirImagem } from "@/lib/imagem";
import { mensagemDeErro } from "@/lib/action";
import { createClient } from "@/lib/supabase/client";
import {
  ACEITA,
  BUCKET_MIDIAS,
  FORMATOS,
  LIMITE_ARQUIVOS,
  LIMITE_CONTA,
  LIMITE_TITULO_MIDIA,
  ROTULO_TIPO,
  caminhoDaMidia,
  conferirArquivo,
  detalheDaMidia,
  formatarTamanho,
  tituloDoArquivo,
  type Midia,
} from "@/lib/midias";
import { apagarMidia, descartarEnvio, registrarMidia, salvarMidia } from "./actions";

export type FiltroMidia = "tudo" | "fotos" | "pdfs" | "audios";

const BASE = "/configuracoes/midias";
const VOLTAR = { href: "/configuracoes", label: "Configurações" };
const FILTROS: { valor: FiltroMidia; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "fotos", rotulo: "Fotos" },
  { valor: "pdfs", rotulo: "PDFs" },
  { valor: "audios", rotulo: "Áudios" },
];

interface Props {
  midias: Midia[];
  visiveis?: Midia[];
  miniaturas?: Record<string, string>;
  usados: number;
  respostas: { id: string; titulo: string }[];
  filtro: FiltroMidia;
  editando?: { midia: Midia; url: string | null };
}

export function BibliotecaMidia(props: Props) {
  if (props.editando) return <Editor midia={props.editando.midia} url={props.editando.url} respostas={props.respostas} />;
  return <Lista {...props} />;
}

// duração do áudio pelo próprio navegador (sem baixar nada de novo); null se não der em 3 s
function duracaoDoAudio(arquivo: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const audio = new Audio();
    const fim = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const espera = setTimeout(() => fim(null), 3000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(espera);
      fim(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      clearTimeout(espera);
      fim(null);
    };
    audio.src = url;
  });
}

// Botão Adicionar: escolhe o arquivo, confere, reduz foto, sobe direto para a pasta do dono no
// Storage e registra. Erro no registro tira o arquivo do Storage.
function useEnviar(cheio: boolean) {
  const router = useRouter();
  const toast = useToast();
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(original: File) {
    const conferido = conferirArquivo(original.name, original.type, original.size);
    // foto grande ainda pode ficar abaixo do limite depois de reduzida: só recusa o resto
    if (!conferido.ok && !(original.type.startsWith("image/") && formatoImagem(original))) {
      toast.error(conferido.erro);
      return;
    }
    setEnviando(true);
    let path: string | null = null;
    try {
      let arquivo = original;
      if (original.type.startsWith("image/")) arquivo = await comprimirImagem(original);
      const final = conferirArquivo(arquivo.name, arquivo.type, arquivo.size);
      if (!final.ok) {
        toast.error(final.erro);
        return;
      }
      const formato = FORMATOS[final.ext];
      const duracao = formato.tipo === "audio" ? await duracaoDoAudio(arquivo) : null;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");
      path = caminhoDaMidia(user.id, crypto.randomUUID(), final.ext);
      const { error } = await supabase.storage.from(BUCKET_MIDIAS).upload(path, arquivo, { contentType: formato.mime, upsert: false });
      if (error) {
        path = null;
        if (/row-level|policy|unauthorized/i.test(error.message)) {
          throw new Error(`A biblioteca chegou ao limite (${formatarTamanho(LIMITE_CONTA)} ou ${LIMITE_ARQUIVOS} arquivos). Apague algum arquivo antes.`);
        }
        throw error;
      }
      const r = await registrarMidia({ path, titulo: tituloDoArquivo(original.name), duracao });
      if (!r.ok) throw new Error(r.error);
      path = null;
      toast.success(r.message ?? "Arquivo adicionado.");
      router.push(`${BASE}?editar=${r.id}`);
      router.refresh();
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não deu para enviar o arquivo."));
      if (path) await descartarEnvio(path).catch(() => {});
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = "";
    }
  }

  const entrada = (
    <input
      ref={campo}
      type="file"
      accept={ACEITA}
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void enviar(f);
      }}
    />
  );
  const botao = (texto: string, classe = btnPrimary) => (
    <button
      type="button"
      disabled={enviando || cheio}
      onClick={() => campo.current?.click()}
      className={classe}
      title={cheio ? "A biblioteca está cheia" : undefined}
    >
      <RotuloAcao pendente={enviando} ocupado="Enviando...">
        {texto}
      </RotuloAcao>
    </button>
  );
  return { entrada, botao };
}

// foto em formato que o navegador reduz para JPEG (o limite de tamanho vale depois de reduzir)
function formatoImagem(f: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(f.type);
}

function Miniatura({ midia, url }: { midia: Midia; url?: string }) {
  if (midia.tipo === "imagem" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl bg-fill object-cover" />;
  }
  const tom = midia.tipo === "audio" ? "bg-tile-positive text-on-tile-positive" : midia.tipo === "documento" ? "bg-tile-danger text-on-tile-danger" : "bg-fill text-ink-muted";
  return (
    <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${tom}`}>
      {midia.tipo === "documento" ? "PDF" : midia.tipo === "audio" ? <IconeOnda /> : "Foto"}
    </span>
  );
}

function IconeOnda() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  );
}

function Lista({ midias, visiveis = midias, miniaturas = {}, usados, respostas, filtro }: Props) {
  const cheio = usados >= LIMITE_CONTA || midias.length >= LIMITE_ARQUIVOS;
  const { entrada, botao } = useEnviar(cheio);
  const titulos = new Map(respostas.map((r) => [r.id, r.titulo]));

  if (midias.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        {entrada}
        <PageHeader title="Biblioteca de mídia" back={VOLTAR} />
        <EmptyState
          title="Nenhum arquivo ainda"
          description="Suba fotos, catálogos em PDF e áudios. Na extensão do WhatsApp Web, Anexar coloca o arquivo na conversa e você envia."
          action={botao("Adicionar arquivo")}
        />
      </div>
    );
  }

  const rodape = `${formatarTamanho(usados)} de ${formatarTamanho(LIMITE_CONTA)} usados · até ${formatarTamanho(10 * 1024 * 1024)} por arquivo. Na extensão do WhatsApp Web, Anexar abre a prévia do WhatsApp com o arquivo. Quem envia é você.`;
  const titulo = visiveis.length === 1 ? "1 arquivo" : `${visiveis.length} arquivos`;

  return (
    <div className="mx-auto max-w-2xl">
      {entrada}
      <PageHeader title="Biblioteca de mídia" back={VOLTAR} action={botao("Adicionar")} />
      <div className="flex flex-col gap-7">
        <Segmentos
          rotulo="Tipo de arquivo"
          itens={FILTROS.map((f) => ({ href: f.valor === "tudo" ? BASE : `${BASE}?tipo=${f.valor}`, label: f.rotulo, ativo: f.valor === filtro }))}
        />
        {visiveis.length === 0 ? (
          <EmptyState title="Nada aqui" description="Nenhum arquivo desse tipo ainda." />
        ) : (
          <Grupo titulo={titulo} semPadding rodape={rodape}>
            {visiveis.map((m) => {
              const resposta = m.resposta_id ? titulos.get(m.resposta_id) : null;
              return (
                <Link
                  key={m.id}
                  href={`${BASE}?editar=${m.id}`}
                  className={`flex items-center gap-3 border-t border-line px-4 py-3 transition first:border-t-0 hover:bg-fill/60 active:bg-fill ${linkPendente}`}
                >
                  <Miniatura midia={m} url={miniaturas[m.path]} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[17px] text-ink">{m.titulo}</span>
                    <span className="truncate text-[13px] text-ink-muted">
                      {detalheDaMidia(m)}
                      {resposta ? ` · ${resposta}` : ""}
                    </span>
                  </span>
                  <SetaLink />
                </Link>
              );
            })}
          </Grupo>
        )}
      </div>
    </div>
  );
}

function Editor({ midia, url, respostas }: { midia: Midia; url: string | null; respostas: { id: string; titulo: string }[] }) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [titulo, setTitulo] = useState(midia.titulo);

  function salvar(formData: FormData) {
    run(() => salvarMidia(formData), {
      onSuccess: () => {
        router.push(BASE);
        router.refresh();
      },
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={midia.titulo} back={{ href: BASE, label: "Biblioteca de mídia" }} />
      <form action={salvar} className="flex flex-col gap-7">
        <input type="hidden" name="id" value={midia.id} />
        <Grupo titulo={ROTULO_TIPO[midia.tipo]} rodape={detalheDaMidia(midia)}>
          {!url ? (
            <p className="text-[15px] text-ink-muted">Não deu para abrir o arquivo agora.</p>
          ) : midia.tipo === "imagem" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={midia.titulo} className="max-h-80 w-full rounded-2xl bg-fill object-contain" />
          ) : midia.tipo === "audio" ? (
            <audio controls preload="metadata" src={url} className="w-full" />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[17px] text-brand-text hover:opacity-80">
              Abrir PDF ›
            </a>
          )}
        </Grupo>

        <Grupo titulo="Arquivo" rodape="O nome também é o nome do arquivo na conversa (o PDF chega com ele).">
          <Field label="Nome">
            <input
              name="titulo"
              required
              maxLength={LIMITE_TITULO_MIDIA}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Resposta pronta" hint="Opcional. Na extensão, o arquivo aparece junto da resposta, com o botão Anexar.">
            <select name="resposta_id" defaultValue={midia.resposta_id ?? ""} className={inputClass}>
              <option value="">Nenhuma</option>
              {respostas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titulo}
                </option>
              ))}
            </select>
          </Field>
        </Grupo>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
            <RotuloAcao pendente={isPending} ocupado="Salvando...">
              Salvar
            </RotuloAcao>
          </button>
          <Link href={BASE} className={`${btnGhost} w-full sm:w-auto`}>
            Cancelar
          </Link>
        </div>
      </form>

      <div className="mt-10 px-4">
        <ConfirmButton
          title={`Apagar “${midia.titulo}”?`}
          description="O arquivo sai do app e da extensão. O que já foi enviado nas conversas continua lá."
          confirmLabel="Apagar"
          successMessage="Arquivo apagado."
          onConfirm={() => apagarMidia(midia.id)}
          onDone={() => {
            router.push(BASE);
            router.refresh();
          }}
          className="text-[15px] text-danger hover:opacity-80"
        >
          Apagar arquivo
        </ConfirmButton>
      </div>
    </div>
  );
}
