"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePonteiro } from "react";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { AutoTextarea } from "@/components/auto-textarea";
import { btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { DESCRICAO_VITRINE_MAX, TITULO_VITRINE_MAX, type Tema, type VitrineProduto } from "@/lib/vitrine";
import { PreviaDoProduto } from "@/app/loja/[slug]/loja";
import { reordenarFotos } from "../../../produtos/actions";
import { Grupo, Interruptor, LinhaLink } from "../../campos";
import { definirCapaDaVitrine, definirDestaque, definirFotoNaVitrine, definirNaVitrine, salvarTextosDaVitrine } from "../../actions";

interface Foto {
  id: string;
  url: string | null;
  variacaoId: string | null;
  naVitrine: boolean;
}

interface Props {
  produto: {
    id: string;
    nome: string;
    descricao: string;
    preco: number;
    precoVaria: boolean;
    precoBase: number;
    marca: string | null;
    temVariacoes: boolean;
    esgotado: boolean;
    ativo: boolean;
    naVitrine: boolean;
    destaque: boolean;
    titulo: string;
    descricaoDaLoja: string;
    capaId: string | null;
  };
  fotos: Foto[];
  variacoes: { id: string; nome: string; preco: number; esgotado: boolean }[];
  lojaCores: {
    cor: string;
    tema: Tema;
    cor_botao: string | null;
    cor_fundo: string | null;
    cor_texto: string | null;
    cor_faixa: string | null;
  } | null;
  anuncios: { id: string; rotulo: string; titulo: string; descricao: string }[];
  linkNaLoja: string | null;
}

// A loja mostra primeiro a capa escolhida e depois a ordem das fotos; a capa do cartão é a primeira
// foto geral visível (sem nenhuma geral, a primeira que houver). Mesma regra de fotosDe() em loja.tsx.
function capaDaLoja(fotos: Foto[], capaId: string | null) {
  const visiveis = fotos.filter((f) => f.naVitrine);
  const ordenadas = [...visiveis.filter((f) => f.id === capaId), ...visiveis.filter((f) => f.id !== capaId)];
  return ordenadas.find((f) => f.variacaoId === null) ?? ordenadas[0] ?? null;
}

export function ProdutoNaVitrine({ produto, fotos: fotosIniciais, variacoes, lojaCores, anuncios, linkNaLoja }: Props) {
  const toast = useToast();
  const { isPending, run } = useAction();
  const [naVitrine, setNaVitrine] = useState(produto.naVitrine);
  const [destaque, setDestaque] = useState(produto.destaque);
  const [fotos, setFotos] = useState(fotosIniciais);
  const [capaId, setCapaId] = useState(produto.capaId);
  const [titulo, setTitulo] = useState(produto.titulo);
  const [descricao, setDescricao] = useState(produto.descricaoDaLoja);
  const [salvo, setSalvo] = useState({ titulo: produto.titulo, descricao: produto.descricaoDaLoja });
  // muda para remontar os interruptores quando o banco recusa (eles não são controlados)
  const [tentativa, setTentativa] = useState(0);
  const [verPrevia, setVerPrevia] = useState(false);

  // Arrastar muda a ordem das fotos do bloco (a primeira vira a capa se nenhuma foi escolhida): no mouse,
  // é só arrastar; no toque, segurar um instante e arrastar, para não brigar com a rolagem da tela.
  const [arrastando, setArrastando] = useState<string | null>(null);
  // soltar depois de arrastar não conta como toque para esconder a foto
  const [acabouDeArrastar, setAcabouDeArrastar] = useState(false);
  const gesto = useRef<{
    id: string;
    x: number;
    y: number;
    ativo: boolean;
    pointerId: number;
    el: HTMLElement;
    antes: Foto[];
    atual: Foto[];
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // no toque, a tela não rola enquanto uma foto está sendo arrastada
  useEffect(() => {
    const bloquear = (e: TouchEvent) => {
      if (gesto.current?.ativo) e.preventDefault();
    };
    document.addEventListener("touchmove", bloquear, { passive: false });
    return () => document.removeEventListener("touchmove", bloquear);
  }, []);

  const capa = capaDaLoja(fotos, capaId);
  const temGeral = fotos.some((f) => f.variacaoId === null);
  const alterado = titulo !== salvo.titulo || descricao !== salvo.descricao;
  const tituloNaLoja = titulo.trim() || produto.nome;
  const descricaoNaLoja = descricao.trim() || produto.descricao;

  function mudarNaVitrine(valor: boolean) {
    setNaVitrine(valor);
    run(() => definirNaVitrine([produto.id], valor), {
      onError: () => {
        setNaVitrine(!valor);
        setTentativa((t) => t + 1);
      },
    });
  }

  function mudarDestaque(valor: boolean) {
    setDestaque(valor);
    run(() => definirDestaque(produto.id, valor), {
      onError: () => {
        setDestaque(!valor);
        setTentativa((t) => t + 1);
      },
    });
  }

  function ativarArraste() {
    const g = gesto.current;
    if (!g) return;
    g.ativo = true;
    try {
      g.el.setPointerCapture(g.pointerId);
    } catch {}
    setArrastando(g.id);
    navigator.vibrate?.(10);
  }

  function iniciarArraste(e: EventoDePonteiro<HTMLElement>, id: string) {
    const foto = fotos.find((x) => x.id === id);
    if (!foto) return;
    const doBloco = fotos.filter((f) => f.variacaoId === foto.variacaoId);
    if (e.button !== 0 || isPending || doBloco.length < 2) return;
    const g = {
      id,
      x: e.clientX,
      y: e.clientY,
      ativo: false,
      pointerId: e.pointerId,
      el: e.currentTarget,
      antes: fotos,
      atual: fotos,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    if (e.pointerType !== "mouse") g.timer = setTimeout(ativarArraste, 280);
    gesto.current = g;
  }

  function moverArraste(e: EventoDePonteiro<HTMLElement>) {
    const g = gesto.current;
    if (!g) return;
    if (!g.ativo) {
      const distancia = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (e.pointerType === "mouse") {
        if (distancia > 6) ativarArraste();
        else return;
      } else {
        // mexeu antes do toque longo: é rolagem, não arraste
        if (distancia > 10) {
          if (g.timer) clearTimeout(g.timer);
          gesto.current = null;
        }
        return;
      }
    }
    const alvoId = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-foto-id]")?.dataset.fotoId;
    if (!alvoId || alvoId === g.id) return;
    const de = g.atual.findIndex((f) => f.id === g.id);
    const para = g.atual.findIndex((f) => f.id === alvoId);
    // só troca de lugar dentro do mesmo bloco (gerais ou a mesma variação)
    if (de < 0 || para < 0 || g.atual[de].variacaoId !== g.atual[para].variacaoId) return;
    const nova = [...g.atual];
    const [item] = nova.splice(de, 1);
    nova.splice(para, 0, item);
    g.atual = nova;
    setFotos(nova);
  }

  function terminarArraste() {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    if (!g.ativo) return;
    setAcabouDeArrastar(true);
    setTimeout(() => setAcabouDeArrastar(false), 80);
    setArrastando(null);
    const variacaoId = g.antes.find((f) => f.id === g.id)?.variacaoId ?? null;
    const ids = g.atual.filter((f) => f.variacaoId === variacaoId).map((f) => f.id);
    const idsAntes = g.antes.filter((f) => f.variacaoId === variacaoId).map((f) => f.id);
    if (ids.join(",") === idsAntes.join(",")) return;
    run(() => reordenarFotos(produto.id, ids), { success: "Ordem salva.", onError: () => setFotos(g.antes) });
  }

  function alternarFoto(foto: Foto) {
    if (acabouDeArrastar) return;
    const antes = fotos;
    setFotos((atual) => atual.map((f) => (f.id === foto.id ? { ...f, naVitrine: !foto.naVitrine } : f)));
    run(() => definirFotoNaVitrine(foto.id, produto.id, !foto.naVitrine), { onError: () => setFotos(antes) });
  }

  function usarDeCapa(foto: Foto) {
    const antes = capaId;
    setCapaId(foto.id);
    run(() => definirCapaDaVitrine(produto.id, foto.id), { onError: () => setCapaId(antes) });
  }

  function salvarTexto() {
    run(() => salvarTextosDaVitrine(produto.id, titulo, descricao), {
      onSuccess: () => setSalvo({ titulo, descricao }),
    });
  }

  function copiarDoAnuncio(id: string) {
    const a = anuncios.find((x) => x.id === id);
    if (!a) return;
    setTitulo(a.titulo.replace(/\s+/g, " ").trim().slice(0, TITULO_VITRINE_MAX));
    setDescricao(a.descricao.trim().slice(0, DESCRICAO_VITRINE_MAX));
    toast.success("Texto copiado do anúncio. Ajuste e salve.");
  }

  async function copiarLink() {
    if (!linkNaLoja) return;
    try {
      await navigator.clipboard.writeText(linkNaLoja);
      toast.success("Link do produto copiado.");
    } catch {
      toast.error("Não consegui copiar o link.");
    }
  }

  // o produto como a loja o monta: texto editado (mesmo sem salvar), fotos visíveis com a capa na frente
  const produtoDaLoja: VitrineProduto = useMemo(() => {
    const visiveis = fotos.filter((f) => f.naVitrine && f.url);
    const ordenadas = [...visiveis.filter((f) => f.id === capaId), ...visiveis.filter((f) => f.id !== capaId)];
    return {
      id: produto.id,
      nome: tituloNaLoja,
      marca: produto.marca,
      descricao: descricaoNaLoja || null,
      categoria: null,
      preco: produto.precoBase,
      destaque,
      tem_variacoes: produto.temVariacoes,
      esgotado: produto.esgotado,
      ultimas: null,
      variacoes: variacoes.map((v) => ({ id: v.id, nome: v.nome, preco: v.preco, esgotado: v.esgotado, ultimas: null })),
      fotos: ordenadas.map((f) => ({ url: f.url as string, variacaoId: f.variacaoId })),
    };
  }, [fotos, capaId, produto, tituloNaLoja, descricaoNaLoja, destaque, variacoes]);

  const blocos = [
    { id: null as string | null, titulo: variacoes.length > 0 ? "Fotos gerais" : null },
    ...variacoes.map((v) => ({ id: v.id as string | null, titulo: v.nome as string | null })),
  ]
    .map((b) => ({ ...b, fotos: fotos.filter((f) => f.variacaoId === b.id) }))
    .filter((b) => b.fotos.length > 0);

  return (
    <div className="flex flex-col gap-7">
      <Grupo
        titulo="Como aparece na loja"
        rodape={!produto.ativo ? "Produto inativo no cadastro: ele não aparece na loja mesmo ligado aqui." : undefined}
      >
        <div className="flex gap-4">
          <div className="hairline w-[132px] shrink-0 overflow-hidden rounded-2xl bg-surface">
            <div className="relative aspect-square bg-fill">
              {capa?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capa.url} alt="" className={`h-full w-full object-cover ${naVitrine ? "" : "opacity-50 grayscale"}`} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-muted">
                  <span className="text-3xl font-semibold opacity-40">{produto.nome.trim().charAt(0).toUpperCase()}</span>
                  <span className="text-[11px]">sem foto</span>
                </div>
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug text-ink">{tituloNaLoja}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">
                {produto.precoVaria && <span className="mr-1 text-[11px] font-normal text-ink-muted">a partir de</span>}
                {formatBRL(produto.preco)}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[17px] font-semibold leading-snug text-ink">{produto.nome}</p>
            <p className={`text-[13px] font-medium ${naVitrine && produto.ativo ? "text-positive" : "text-ink-muted"}`}>
              {naVitrine && produto.ativo ? "Na vitrine" : "Fora da vitrine"}
              {naVitrine && destaque ? " · Destaque" : ""}
            </p>
            {descricaoNaLoja ? (
              <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-snug text-ink-muted">{descricaoNaLoja}</p>
            ) : (
              <p className="text-[13px] text-ink-faint">Sem descrição.</p>
            )}
          </div>
        </div>
        {lojaCores && (
          <button type="button" onClick={() => setVerPrevia(true)} className={`${btnSecondary} w-full py-2.5`}>
            Ver como o cliente vê
          </button>
        )}
        {linkNaLoja && naVitrine && produto.ativo && (
          <div className="grid grid-cols-2 gap-2">
            <a href={linkNaLoja} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} py-2.5`}>
              Ver na loja
            </a>
            <button type="button" onClick={copiarLink} className={`${btnSecondary} py-2.5`}>
              Copiar link
            </button>
          </div>
        )}
      </Grupo>

      <Grupo>
        <Interruptor key={`v${tentativa}`} name="na_vitrine" padrao={naVitrine} titulo="Mostrar na vitrine" onMudar={mudarNaVitrine} />
        <Interruptor
          key={`d${tentativa}`}
          name="destaque"
          padrao={destaque}
          titulo="Destaque"
          ajuda="Aparece primeiro, na faixa de destaques da loja."
          onMudar={mudarDestaque}
          desabilitado={!naVitrine}
        />
      </Grupo>

      <Grupo
        titulo="Fotos na loja"
        rodape={
          fotos.length > 0
            ? "Toque na foto para mostrar ou esconder na loja. Segure e arraste para mudar a ordem (a ordem vale também no anúncio). A foto escondida continua no anúncio. A capa é a foto do cartão do produto."
            : undefined
        }
      >
        {fotos.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Este produto ainda não tem foto. Envie as fotos em Fotos e anúncios, logo abaixo.</p>
        ) : (
          blocos.map((bloco) => (
            <div key={bloco.id ?? "gerais"}>
              {bloco.titulo && <h3 className="mb-2 text-[13px] font-medium text-ink-muted">{bloco.titulo}</h3>}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {bloco.fotos.map((foto, i) => {
                  const eCapa = capa?.id === foto.id;
                  // só foto geral vira capa do cartão; produto só com foto de variação usa qualquer uma
                  const podeSerCapa = foto.naVitrine && !eCapa && (foto.variacaoId === null || !temGeral);
                  return (
                    <div key={foto.id} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        data-foto-id={foto.id}
                        // eslint-disable-next-line react-hooks/refs -- o gesto só lê e grava o ref dentro do evento
                        onPointerDown={(e) => iniciarArraste(e, foto.id)}
                        onPointerMove={moverArraste}
                        onPointerUp={terminarArraste}
                        onPointerCancel={terminarArraste}
                        onContextMenu={(e) => {
                          if (gesto.current) e.preventDefault(); // segurar no celular não abre o menu da imagem
                        }}
                        aria-pressed={foto.naVitrine}
                        aria-label={`Foto ${i + 1}: ${foto.naVitrine ? "aparece na loja, toque para esconder" : "escondida, toque para mostrar"}`}
                        disabled={isPending}
                        onClick={() => alternarFoto(foto)}
                        className={`relative aspect-square select-none overflow-hidden rounded-2xl border bg-fill transition [-webkit-touch-callout:none] ${
                          arrastando === foto.id ? "z-10 scale-105 border-brand opacity-80 shadow-xl ring-2 ring-brand" : eCapa ? "border-brand ring-2 ring-brand" : "border-line"
                        }`}
                      >
                        {foto.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={foto.url}
                            alt=""
                            draggable={false}
                            loading="lazy"
                            className={`h-full w-full object-cover transition ${foto.naVitrine ? "" : "opacity-30 grayscale"}`}
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-ink-muted">sem preview</span>
                        )}
                        {eCapa && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Capa</span>
                        )}
                        {!foto.naVitrine && (
                          <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                            Escondida
                          </span>
                        )}
                      </button>
                      {podeSerCapa ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => usarDeCapa(foto)}
                          className="text-center text-[13px] font-medium text-brand-text hover:underline disabled:opacity-50"
                        >
                          Usar de capa
                        </button>
                      ) : (
                        <span className="text-center text-[13px] text-ink-muted">{eCapa ? "Capa da loja" : foto.naVitrine ? "Na loja" : "Fora da loja"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </Grupo>

      <Grupo titulo="Texto na loja" rodape="Em branco, a loja usa o nome e a descrição do cadastro.">
        {anuncios.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">Copiar de um anúncio</span>
            <select
              value=""
              onChange={(e) => copiarDoAnuncio(e.target.value)}
              className={inputClass}
              aria-label="Copiar o texto de um anúncio"
            >
              <option value="">Escolher anúncio...</option>
              {anuncios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}
                  {a.titulo ? `: ${a.titulo.slice(0, 40)}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="vitrine-titulo" className="text-[13px] font-medium text-ink-muted">
              Título
            </label>
            <span className="text-xs text-ink-muted">
              {titulo.length}/{TITULO_VITRINE_MAX}
            </span>
          </div>
          <AutoTextarea
            umaLinha
            id="vitrine-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={TITULO_VITRINE_MAX}
            placeholder={produto.nome}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vitrine-descricao" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
            Descrição
          </label>
          <AutoTextarea
            id="vitrine-descricao"
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={DESCRICAO_VITRINE_MAX}
            placeholder={produto.descricao || "Conte o que o cliente precisa saber."}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={salvarTexto} disabled={isPending || !alterado} className={`${btnPrimary} w-full py-3 sm:w-auto`}>
            {isPending ? "Salvando..." : alterado ? "Salvar texto" : "Salvo"}
          </button>
          {(titulo || descricao) && (
            <button
              type="button"
              onClick={() => {
                setTitulo("");
                setDescricao("");
              }}
              className="text-[15px] font-medium text-brand-text hover:underline"
            >
              Usar o texto do cadastro
            </button>
          )}
        </div>
      </Grupo>

      {lojaCores && <PreviaDoProduto produto={produtoDaLoja} loja={lojaCores} aberto={verPrevia} onFechar={() => setVerPrevia(false)} />}

      <Grupo titulo="Este produto" semPadding>
        <LinhaLink href={`/anuncios/${produto.id}`} rotulo="Fotos e anúncios" />
        <LinhaLink href={`/produtos/${produto.id}`} rotulo="Cadastro, preço e estoque" />
      </Grupo>
    </div>
  );
}
