"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/modal";
import { btnPrimary, btnSecondary } from "@/components/ui";

// QR code do link da loja, para imprimir no balcão, na sacola ou no cartão. Gerado no navegador.
export function QrDaLoja({ link, nomeLoja }: { link: string; nomeLoja: string }) {
  const [aberto, setAberto] = useState(false);
  const [imagem, setImagem] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || imagem) return;
    QRCode.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
      .then(setImagem)
      .catch(() => setImagem(null));
  }, [aberto, imagem, link]);

  const arquivo = `qr-${nomeLoja.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "loja"}.png`;

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={`${btnSecondary} px-3`}>
        QR code
      </button>
      <Modal folha size="sm" open={aberto} onClose={() => setAberto(false)} title="QR code da loja">
        <div className="flex flex-col items-center gap-4">
          {imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagem} alt={`QR code do link da loja ${nomeLoja}`} className="aspect-square w-full max-w-64 rounded-2xl bg-white" />
          ) : (
            <div className="aspect-square w-full max-w-64 animate-pulse rounded-2xl bg-fill" />
          )}
          <p className="text-center text-[13px] text-ink-muted">Cole no balcão, na sacola ou no cartão: a câmera do celular abre a loja.</p>
          {imagem && (
            <a href={imagem} download={arquivo} className={`${btnPrimary} w-full py-3`}>
              Baixar imagem
            </a>
          )}
        </div>
      </Modal>
    </>
  );
}
