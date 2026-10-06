"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/toaster";
import { Card, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { IconLink, IconWhatsapp } from "@/components/icons";
import { linkWhatsApp } from "@/lib/format";
import { novoLinkRecibo } from "../actions";

// Recibo da venda para o cliente: um link que abre sem login e mostra itens, total
// e a situação de cada parcela (ver src/app/r/[token]).
export function ReciboCard({
  vendaId,
  token,
  clienteNome,
  clienteTelefone,
  nomeNegocio,
}: {
  vendaId: string;
  token: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  nomeNegocio: string | null;
}) {
  const toast = useToast();

  function url() {
    return `${window.location.origin}/r/${token}`;
  }

  function mensagem() {
    const primeiroNome = clienteNome?.trim().split(/\s+/)[0];
    const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
    const loja = nomeNegocio ? ` na ${nomeNegocio}` : "";
    return `${saudacao} Aqui está o recibo da sua compra${loja}: ${url()}`;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url());
      toast.success("Link do recibo copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  // no celular abre a lista de apps (WhatsApp, Instagram...); no computador copia
  async function compartilhar() {
    if (!navigator.share) return copiar();
    try {
      await navigator.share({ title: "Recibo", text: mensagem() });
    } catch (e) {
      if ((e as Error).name !== "AbortError") copiar();
    }
  }

  const whatsapp = linkWhatsApp(clienteTelefone);

  return (
    <Card
      title="Recibo"
      description="Mande o link para o cliente. As parcelas aparecem com a situação de hoje."
      className="mb-6"
    >
      <div className="flex flex-wrap gap-2">
        {whatsapp ? (
          <button
            type="button"
            onClick={() => window.open(linkWhatsApp(clienteTelefone, mensagem()) ?? whatsapp, "_blank", "noopener")}
            className={btnPrimary}
          >
            <IconWhatsapp width={16} height={16} /> Enviar pelo WhatsApp
          </button>
        ) : (
          <button type="button" onClick={compartilhar} className={btnPrimary}>
            Compartilhar recibo
          </button>
        )}
        <button type="button" onClick={copiar} className={btnSecondary}>
          <IconLink width={16} height={16} /> Copiar link
        </button>
        <a href={`/r/${token}`} target="_blank" rel="noopener" className={btnGhost}>
          Ver recibo
        </a>
        <a href={`/r/${token}?pdf=1`} target="_blank" rel="noopener" className={btnGhost}>
          Baixar PDF
        </a>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>{whatsapp ? null : "O cliente não tem telefone cadastrado, então o recibo vai pelo compartilhar."}</span>
        <ConfirmButton
          title="Criar um link novo?"
          description="O link enviado antes para de abrir. Use se mandou o recibo para a pessoa errada."
          confirmLabel="Criar link novo"
          onConfirm={() => novoLinkRecibo(vendaId)}
          className="font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          ariaLabel="Criar link novo do recibo"
        >
          Desativar este link
        </ConfirmButton>
      </div>
    </Card>
  );
}
