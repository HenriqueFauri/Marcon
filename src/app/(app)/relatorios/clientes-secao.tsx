import { formatBRL, formatData, hojeISO, linkWhatsApp } from "@/lib/format";
import type { ClienteResumo } from "@/lib/relatorios-dados";
import { IconWhatsapp } from "@/components/icons";
import { btnIcon } from "@/components/ui";

export function diasDesde(iso: string) {
  const hoje = hojeISO();
  return Math.round((new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${iso}T12:00:00Z`).getTime()) / 86400000);
}

// WhatsApp com a mensagem de volta pronta; o dono ainda pode mudar antes de enviar
export function linkDeVolta(c: ClienteResumo) {
  const primeiro = c.nome.trim().split(/\s+/)[0];
  return linkWhatsApp(c.telefone, `Oi ${primeiro}, tudo bem? Faz um tempo que você não passa por aqui e chegou novidade. Quer dar uma olhada?`);
}

export function LinhaCliente({ c, detalhe, comZap = false }: { c: ClienteResumo; detalhe: string; comZap?: boolean }) {
  const zap = comZap ? linkDeVolta(c) : null;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[15px] font-semibold text-brand-text">
        {c.nome.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] text-ink">{c.nome}</p>
        <p className="truncate text-[13px] text-ink-muted">{detalhe}</p>
      </div>
      <p className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{formatBRL(c.total)}</p>
      {zap && (
        <a href={zap} target="_blank" rel="noopener noreferrer" className={btnIcon} aria-label={`Chamar ${c.nome} no WhatsApp`} title="Chamar no WhatsApp">
          <IconWhatsapp width={18} height={18} />
        </a>
      )}
    </li>
  );
}

export function detalheSumido(c: ClienteResumo) {
  return `Última compra em ${formatData(c.ultima)}, há ${diasDesde(c.ultima)} dias`;
}

export function detalheCompras(c: ClienteResumo) {
  return `${c.compras} ${c.compras === 1 ? "compra" : "compras"} · última em ${formatData(c.ultima)}`;
}
