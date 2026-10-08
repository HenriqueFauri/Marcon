"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/use-action";
import { formatarTelefone } from "@/lib/format";
import { sugerirSlug, type Entrega } from "@/lib/vitrine";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { Grupo, Interruptor, Segmentado } from "../campos";
import { salvarConfiguracao } from "../actions";

export interface ConfiguracaoVitrine {
  slug: string;
  ativa: boolean;
  whatsapp: string;
  entrega: Entrega;
  freteFixo: string;
}

const AJUDA_ENTREGA: Record<Entrega, string> = {
  ambos: "O cliente escolhe entrega ou retirada no pedido.",
  entrega: "Só entrega. A opção de retirar no local não aparece.",
  retirada: "Só retirada. Sem endereço de entrega e sem frete.",
};

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
  const dominio = base.replace(/^https?:\/\//, "");

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
      className="flex flex-col gap-7"
    >
      <Grupo rodape='Desligada, o link mostra "loja não encontrada". Produtos, cupons e personalização ficam guardados.'>
        <Interruptor name="ativa" padrao={config?.ativa ?? true} titulo="Vitrine no ar" />
      </Grupo>

      <Grupo titulo="Link e contato" rodape="Se mudar o endereço, o link antigo para de funcionar.">
        <Field label="Endereço da loja">
          <div className="flex items-center rounded-xl bg-fill pl-3.5 focus-within:ring-4 focus-within:ring-brand/15">
            <span className="shrink-0 text-[15px] text-ink-muted">/loja/</span>
            <input
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
              minLength={3}
              maxLength={40}
              placeholder="minha-loja"
              aria-describedby="link-completo"
              className="min-w-0 flex-1 bg-transparent py-2.5 pr-3.5 text-[15px] text-ink outline-none placeholder:text-ink-muted"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
        </Field>
        <p id="link-completo" className="-mt-2 truncate text-[13px] text-ink-muted">
          {dominio}/loja/{slug || "sua-loja"}
        </p>
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
      </Grupo>

      <Grupo titulo="Entrega" rodape={AJUDA_ENTREGA[entrega]}>
        <Segmentado
          name="entrega"
          rotulo="Como o cliente recebe"
          valor={entrega}
          onMudar={setEntrega}
          opcoes={[
            { valor: "ambos", label: "Os dois" },
            { valor: "entrega", label: "Entrega" },
            { valor: "retirada", label: "Retirada" },
          ]}
        />
        {entrega !== "retirada" && (
          <Field label="Frete fixo (opcional)" hint="Vazio = combinar no WhatsApp.">
            <div className="flex items-center rounded-xl bg-fill pl-3.5 focus-within:ring-4 focus-within:ring-brand/15 sm:max-w-48">
              <span className="shrink-0 text-[15px] text-ink-muted">R$</span>
              <input
                name="frete_fixo"
                inputMode="decimal"
                defaultValue={config?.freteFixo ?? ""}
                placeholder="A combinar"
                className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
          </Field>
        )}
      </Grupo>

      <button type="submit" disabled={isPending} className={`${btnPrimary} w-full py-3 sm:w-auto sm:self-start`}>
        {isPending ? "Salvando..." : config ? "Salvar" : "Criar minha loja"}
      </button>
    </form>
  );
}
