"use client";

import { useState } from "react";
import { IconBox } from "./icons";

// Foto pequena do produto (capa). Sem foto, ou se o link assinado venceu com a
// tela aberta há muito tempo, fica o ícone de caixa. `compacta` (36 px) é para listas e busca.
export function FotoProduto({ url, compacta = false }: { url: string | null; compacta?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const tamanho = compacta ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  if (!url || falhou) {
    return (
      <span className={`flex ${tamanho} shrink-0 items-center justify-center bg-brand-tint text-brand-text`}>
        <IconBox width={compacta ? 18 : 22} height={compacta ? 18 : 22} strokeWidth={1.9} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      // a foto pode falhar antes de o React assumir a página: aí o onError não chega, então confere ao montar
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFalhou(true);
      }}
      onError={() => setFalhou(true)}
      className={`${tamanho} shrink-0 bg-fill object-cover`}
    />
  );
}
