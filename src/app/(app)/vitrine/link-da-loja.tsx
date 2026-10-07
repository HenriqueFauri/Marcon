"use client";

import { useToast } from "@/components/toaster";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { IconWhatsapp } from "@/components/icons";

// link da loja com os atalhos para divulgar: copiar, abrir e mandar no WhatsApp (status, grupos, clientes)
export function LinkDaLoja({ link, nomeLoja }: { link: string; nomeLoja: string }) {
  const toast = useToast();
  const textoWhats = `Confira os produtos da ${nomeLoja} e faça seu pedido por aqui: ${link}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl bg-fill px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink" title={link}>
          {link.replace(/^https?:\/\//, "")}
        </span>
        <button type="button" onClick={copiar} className="shrink-0 text-[13px] font-semibold text-brand-text hover:underline">
          Copiar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(textoWhats)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnPrimary} px-3`}
        >
          <IconWhatsapp />
          Divulgar
        </a>
        <a href={link} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} px-3`}>
          Ver loja
        </a>
      </div>
    </div>
  );
}
