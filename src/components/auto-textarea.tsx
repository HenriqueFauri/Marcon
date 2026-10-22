"use client";

import { useEffect, useLayoutEffect, useRef, type ChangeEvent, type TextareaHTMLAttributes } from "react";

// Caixa de texto que cresce com o conteúdo: texto colado ou escrito pela IA aparece inteiro,
// sem cortar nem rolar dentro do campo (no celular, um <input> mostra só o começo do título).
// umaLinha: não aceita quebra de linha (título, nome), mas o texto longo dobra na tela.
export function AutoTextarea({
  umaLinha = false,
  className = "",
  onChange,
  onKeyDown,
  rows,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { umaLinha?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function ajustar() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // dentro de um bloco recolhido (Mais detalhes) o campo não tem medida: deixa em auto até aparecer
    if (el.scrollHeight === 0) return;
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }

  useLayoutEffect(ajustar, [props.value]);
  // a largura muda (girar o celular, redimensionar a janela, abrir o bloco recolhido em que o campo está) e o texto dobra diferente
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let largura = el.offsetWidth;
    const observador = new ResizeObserver(() => {
      if (el.offsetWidth === largura) return;
      largura = el.offsetWidth;
      ajustar();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  function mudar(e: ChangeEvent<HTMLTextAreaElement>) {
    if (umaLinha && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, " ");
    onChange?.(e);
    ajustar();
  }

  return (
    <textarea
      ref={ref}
      rows={rows ?? (umaLinha ? 1 : 3)}
      {...props}
      onChange={mudar}
      onKeyDown={(e) => {
        if (umaLinha && e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      className={`${className} resize-none overflow-hidden`}
    />
  );
}
