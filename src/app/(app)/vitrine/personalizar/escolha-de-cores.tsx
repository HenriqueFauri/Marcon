"use client";

import { PALETAS, avisosDeContraste, mesmasCores, type CoresDaLoja } from "@/lib/vitrine";
import { Grupo } from "../campos";

const CAMPOS: { chave: keyof CoresDaLoja; nome: string; detalhe: string }[] = [
  { chave: "destaque", nome: "Destaque", detalhe: "Categoria e opção escolhidas, banner, logo" },
  { chave: "botao", nome: "Botões", detalhe: "Adicionar ao pedido, enviar pedido" },
  { chave: "fundo", nome: "Fundo", detalhe: "Fundo da página; os cartões acompanham" },
  { chave: "texto", nome: "Texto", detalhe: "Nomes, preços e descrições" },
  { chave: "faixa", nome: "Faixa de anúncio", detalhe: "A barra do alto da loja" },
];

// miniatura da loja com as cores do tema: faixa, um cartão e o botão
function Miniatura({ cores }: { cores: CoresDaLoja }) {
  return (
    <span aria-hidden="true" className="block overflow-hidden rounded-xl" style={{ background: cores.fundo }}>
      <span className="block h-2" style={{ background: cores.faixa }} />
      <span className="flex items-end gap-1.5 p-2">
        <span className="h-6 flex-1 rounded-md" style={{ background: cores.texto, opacity: 0.12 }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: cores.destaque }} />
        <span className="h-3.5 w-7 rounded-full" style={{ background: cores.botao }} />
      </span>
    </span>
  );
}

// Tema pronto + ajuste cor a cor. Controlado pelo formulário (a prévia usa o mesmo estado);
// as cores vão para o servidor em inputs escondidos.
export function EscolhaDeCores({ cores, onMudar }: { cores: CoresDaLoja; onMudar: (c: CoresDaLoja) => void }) {
  const ativa = PALETAS.find((p) => mesmasCores(p.cores, cores));
  const avisos = avisosDeContraste(cores);

  return (
    <>
      <Grupo titulo="Tema" rodape={ativa ? ativa.descricao : "Personalizado. Toque num tema para voltar às cores dele."}>
        <div role="radiogroup" aria-label="Temas prontos" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PALETAS.map((p) => {
            const marcada = p === ativa;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => onMudar({ ...p.cores })}
                className={`flex flex-col gap-1.5 rounded-2xl p-1.5 text-left transition ${
                  marcada ? "bg-fill ring-2 ring-ink" : "hover:bg-fill/60"
                }`}
              >
                <span className="hairline block rounded-xl">
                  <Miniatura cores={p.cores} />
                </span>
                <span className="px-1 pb-0.5 text-[13px] font-medium text-ink">{p.nome}</span>
              </button>
            );
          })}
        </div>
      </Grupo>

      <Grupo
        titulo="Cores"
        semPadding
        rodape={
          avisos.length > 0 ? (
            <span className="text-warning">{avisos.join(" ")}</span>
          ) : (
            "O texto em cima dos botões e da faixa fica preto ou branco sozinho, o que der para ler."
          )
        }
      >
        {CAMPOS.map((c) => (
          <label key={c.chave} className="flex cursor-pointer items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-fill/60">
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] text-ink">{c.nome}</span>
              <span className="block truncate text-[13px] text-ink-muted">{c.detalhe}</span>
            </span>
            <span className="shrink-0 font-mono text-[13px] uppercase text-ink-muted">{cores[c.chave]}</span>
            <span
              className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
              style={{ background: cores[c.chave] }}
            >
              <input
                type="color"
                value={cores[c.chave]}
                onChange={(e) => onMudar({ ...cores, [c.chave]: e.target.value })}
                aria-label={c.nome}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
            <input type="hidden" name={c.chave === "destaque" ? "cor" : `cor_${c.chave}`} value={cores[c.chave]} />
          </label>
        ))}
      </Grupo>
    </>
  );
}
