"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toaster";
import { formatBRL } from "@/lib/format";
import { btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";

export interface ProdutoParaDivulgar {
  id: string;
  nome: string;
  preco: number;
  varia: boolean; // preço "a partir de" (variações com preços diferentes)
  foto: string | null;
}

function mensagemDe(p: ProdutoParaDivulgar, linkDaLoja: string) {
  const preco = formatBRL(p.preco);
  return `${p.varia ? `${p.nome}, a partir de ${preco}.` : `${p.nome} por ${preco}.`}\nVeja as fotos e faça seu pedido aqui: ${linkDaLoja}?p=${p.id}`;
}

function Miniatura({ p }: { p: ProdutoParaDivulgar }) {
  return p.foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.foto} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-fill object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fill text-[15px] text-ink-muted">
      {p.nome.charAt(0).toUpperCase()}
    </span>
  );
}

// Divulgar um produto: escolhe o produto, ajusta o texto e manda no Zap (status, grupos) ou copia.
// O link do produto (?p=id) mostra a foto e o preço dele na prévia do WhatsApp.
export function DivulgarProduto({ produtos, linkDaLoja }: { produtos: ProdutoParaDivulgar[]; linkDaLoja: string }) {
  const toast = useToast();
  const [escolhido, setEscolhido] = useState(produtos[0]);
  const [texto, setTexto] = useState(() => mensagemDe(produtos[0], linkDaLoja));
  const [trocando, setTrocando] = useState(false);
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? produtos.filter((p) => p.nome.toLowerCase().includes(termo)) : produtos;
  }, [produtos, busca]);

  function escolher(p: ProdutoParaDivulgar) {
    setEscolhido(p);
    setTexto(mensagemDe(p, linkDaLoja));
    setTrocando(false);
    setBusca("");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setTrocando(true)}
        className="-mx-1 flex items-center gap-3 rounded-2xl px-1 py-1 text-left transition hover:bg-fill/60"
      >
        <Miniatura p={escolhido} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] text-ink">{escolhido.nome}</span>
          <span className="block text-[13px] text-ink-muted">
            {escolhido.varia ? "a partir de " : ""}
            {formatBRL(escolhido.preco)}
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-medium text-brand-text">Trocar</span>
      </button>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        aria-label="Mensagem para divulgar"
        className={`${inputClass} resize-none leading-relaxed`}
      />

      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} px-3`}>
          <IconWhatsapp />
          Mandar no Zap
        </a>
        <button type="button" onClick={copiar} className={`${btnSecondary} px-3`}>
          Copiar texto
        </button>
      </div>

      <Modal folha open={trocando} onClose={() => setTrocando(false)} title="Escolha o produto">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto"
          aria-label="Buscar produto"
          className={inputClass}
        />
        <ul className="mt-2 divide-y divide-line">
          {visiveis.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => escolher(p)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <Miniatura p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{p.nome}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {p.varia ? "a partir de " : ""}
                    {formatBRL(p.preco)}
                  </span>
                </span>
                {p.id === escolhido.id && <span className="text-[13px] font-medium text-brand-text">Escolhido</span>}
              </button>
            </li>
          ))}
          {visiveis.length === 0 && <li className="py-6 text-center text-[15px] text-ink-muted">Nenhum produto com esse nome.</li>}
        </ul>
      </Modal>
    </>
  );
}
