"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { formatarTelefone } from "@/lib/format";
import { ENTREGAS, sugerirSlug, type Entrega } from "@/lib/vitrine";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { Interruptor, Secao } from "../campos";
import { salvarConfiguracao } from "../actions";

export interface ConfiguracaoVitrine {
  slug: string;
  ativa: boolean;
  whatsapp: string;
  entrega: Entrega;
  freteFixo: string;
}

export function ConfiguracaoForm({
  config,
  nomeNegocio,
  telefoneEmpresa,
  base,
}: {
  config: ConfiguracaoVitrine | null;
  nomeNegocio: string;
  telefoneEmpresa: string;
  base: string;
}) {
  const router = useRouter();
  const { isPending, run } = useAction();
  const [slug, setSlug] = useState(config?.slug ?? sugerirSlug(nomeNegocio));
  const [whatsapp, setWhatsapp] = useState(formatarTelefone(config?.whatsapp ?? telefoneEmpresa));
  const [entrega, setEntrega] = useState<Entrega>(config?.entrega ?? "ambos");
  const link = `${base}/loja/${slug || "sua-loja"}`;

  return (
    <form
      action={(formData) =>
        run(() => salvarConfiguracao(formData), {
          // na criação, leva para a visão geral com os próximos passos
          onSuccess: () => {
            if (!config) router.push("/vitrine");
          },
        })
      }
      className="flex flex-col gap-6"
    >
      <Secao titulo="Loja no ar">
        <Interruptor
          name="ativa"
          padrao={config?.ativa ?? true}
          titulo="Vitrine no ar"
          ajuda='Desligada, o link mostra "loja não encontrada". Produtos, cupons e personalização continuam guardados.'
        />
      </Secao>

      <Secao titulo="Endereço e contato">
        <Field label="Endereço da loja" hint="De 3 a 40 letras minúsculas, números ou hífen. Se mudar, o link antigo para de funcionar.">
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
      </Secao>

      <Secao titulo="Entrega e retirada" descricao="O que o cliente pode escolher no pedido.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ENTREGAS.map((e) => (
            <label
              key={e.valor}
              className={`cursor-pointer rounded-xl border px-3.5 py-3 text-sm transition ${
                entrega === e.valor ? "border-brand bg-brand-tint" : "border-line hover:bg-fill"
              }`}
            >
              <input
                type="radio"
                name="entrega"
                value={e.valor}
                checked={entrega === e.valor}
                onChange={() => setEntrega(e.valor)}
                className="sr-only"
              />
              <span className="block font-medium text-ink">{e.titulo}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{e.ajuda}</span>
            </label>
          ))}
        </div>
        {entrega !== "retirada" && (
          <Field label="Frete fixo (opcional)" hint="Somado ao total quando o cliente escolhe entrega. Vazio = combinar no WhatsApp.">
            <input
              name="frete_fixo"
              inputMode="decimal"
              defaultValue={config?.freteFixo ?? ""}
              placeholder="Ex: 10,00"
              className={`${inputClass} sm:max-w-40`}
            />
          </Field>
        )}
      </Secao>

      <div className="border-t border-line pt-4">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full sm:w-auto`}>
          {isPending ? "Salvando..." : config ? "Salvar configurações" : "Criar minha loja"}
        </button>
      </div>
    </form>
  );
}
