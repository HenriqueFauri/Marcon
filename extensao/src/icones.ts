// Os mesmos ícones do app (src/components/icons.tsx): traço simples, 24x24, espessura 1,8.
// Copiados como desenho (o app usa React; aqui é DOM puro). Ao mudar um lá, mudar aqui também.

const DESENHOS = {
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  sair: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  abaixo: '<path d="m6 9 6 6 6-6"/>',
  acima: '<path d="m6 15 6-6 6 6"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
} as const;

export type NomeIcone = keyof typeof DESENHOS;

export function icone(nome: NomeIcone, tamanho = 18): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(tamanho),
    height: String(tamanho),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "icone",
  })) {
    svg.setAttribute(k, v);
  }
  svg.innerHTML = DESENHOS[nome]; // desenho fixo deste arquivo, nunca dado de fora
  return svg;
}
