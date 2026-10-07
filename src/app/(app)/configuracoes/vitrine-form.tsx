"use client";

import { useState } from "react";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { formatarTelefone } from "@/lib/format";
import { BOAS_VINDAS_MAX, COR_PADRAO, sugerirSlug } from "@/lib/vitrine";
import { Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { salvarVitrine } from "./actions";

export interface VitrineConfig {
  slug: string;
  ativa: boolean;
  whatsapp: string;
  cor: string;
  boasVindas: string;
}

export function VitrineForm({
  config,
  nomeNegocio,
  telefoneEmpresa,
  base,
  produtosNaVitrine,
  temPlano,
}: {
  config: VitrineConfig | null;
  nomeNegocio: string;
  telefoneEmpresa: string;
  base: string;
  produtosNaVitrine: number;
  temPlano: boolean;
}) {
  const { isPending, run } = useAction();
  const toast = useToast();
  const [slug, setSlug] = useState(config?.slug ?? sugerirSlug(nomeNegocio));
  const [whatsapp, setWhatsapp] = useState(formatarTelefone(config?.whatsapp ?? telefoneEmpresa));
  const [cor, setCor] = useState(config?.cor ?? COR_PADRAO);
  const [boasVindas, setBoasVindas] = useState(config?.boasVindas ?? "");

  const link = `${base}/loja/${slug || "sua-loja"}`;
  const noAr = !!config?.ativa;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie.");
    }
  }

  if (!temPlano) {
    return (
      <p className="rounded-xl bg-fill/60 px-4 py-3 text-sm text-ink-2">
        A vitrine faz parte do plano Marcon (e do teste de 14 dias). Assine para ter a sua loja online com link.
      </p>
    );
  }

  return (
    <form action={(formData) => run(() => salvarVitrine(formData))} className="flex flex-col gap-4">
      <label className="flex items-start gap-3 rounded-xl bg-fill/60 px-4 py-3">
        <input type="checkbox" name="ativa" defaultChecked={config?.ativa ?? true} className="mt-0.5 h-4 w-4 accent-brand" />
        <span className="text-sm">
          <span className="font-medium text-ink">Vitrine no ar</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Desligada, o link mostra &quot;loja não encontrada&quot;. Escolha os produtos em cada cadastro (&quot;Mostrar na vitrine&quot;).
          </span>
        </span>
      </label>

      <Field label="Endereço da loja" hint="De 3 a 40 letras minúsculas, números ou hífen.">
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          required
          minLength={3}
          maxLength={40}
          placeholder="minha-loja"
          className={inputClass}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
      <p className="-mt-2 break-all text-xs text-ink-muted">{link}</p>

      <Field label="WhatsApp que recebe os pedidos">
        <input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          required
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatarTelefone(e.target.value))}
          placeholder="(11) 99999-9999"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <Field label="Cor de destaque">
          <input
            name="cor"
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="h-11 w-24 cursor-pointer rounded-xl border border-line bg-fill p-1"
          />
        </Field>
        <Field label="Frase de boas-vindas (opcional)" hint={`${boasVindas.length}/${BOAS_VINDAS_MAX}`}>
          <input
            name="boas_vindas"
            value={boasVindas}
            onChange={(e) => setBoasVindas(e.target.value)}
            maxLength={BOAS_VINDAS_MAX}
            placeholder="Ex: Entregamos em toda a cidade. Chame no WhatsApp!"
            className={inputClass}
          />
        </Field>
      </div>

      <p className="text-xs text-ink-muted">
        {produtosNaVitrine === 0
          ? "Nenhum produto marcado ainda. Abra um produto, edite e ligue \"Mostrar na vitrine\"."
          : `${produtosNaVitrine} ${produtosNaVitrine === 1 ? "produto aparece" : "produtos aparecem"} na vitrine.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? "Salvando..." : "Salvar vitrine"}
        </button>
        {config && (
          <>
            <button type="button" onClick={copiar} className={btnSecondary}>
              Copiar link
            </button>
            {noAr && (
              <a href={`/loja/${config.slug}`} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                Ver loja
              </a>
            )}
          </>
        )}
      </div>
    </form>
  );
}
