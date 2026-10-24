"use client";

import { Interruptor } from "@/components/ajustes";

// Peças das telas da vitrine. Grupo, Interruptor, LinhaLink e Segmentado passaram para
// src/components/ajustes.tsx (são usadas em outras áreas também) e continuam exportadas daqui.
export { Grupo, Interruptor, LinhaInfo, LinhaLink, Segmentado } from "@/components/ajustes";

// Só o switch do Interruptor, para a ponta de uma linha de lista (o nome da linha já está ao lado).
// O rótulo fica para o leitor de tela. O Interruptor não é controlado: quem usa passa uma key que
// muda junto com o valor (ex.: `${id}-${ligado}`), para ele acompanhar a tela quando o estado muda de fora.
export function SoInterruptor({
  name,
  ligado,
  rotulo,
  onMudar,
  desabilitado,
}: {
  name: string;
  ligado: boolean;
  rotulo: string;
  onMudar: (ligado: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="shrink-0 [&_label]:gap-0 [&_label>span:first-child]:sr-only">
      <Interruptor name={name} padrao={ligado} titulo={rotulo} onMudar={onMudar} desabilitado={desabilitado} />
    </div>
  );
}
