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
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }

  useLayoutEffect(ajustar, [props.value]);
  // a largura muda (girar o celular, redimensionar a janela) e o texto dobra diferente
  useEffect(() => {
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
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
