import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import { Card } from "@/components/ui";
import { Cupons, type CupomDaLista } from "../cupons";

export const metadata: Metadata = { title: "Vitrine | Cupons" };

export default async function VitrineCuponsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vitrine_cupons")
    .select("id, codigo, tipo, valor, minimo, validade, ativo")
    .order("created_at", { ascending: false });
  const cupons = (data ?? []).map((c) => ({
    ...c,
    valor: Number(c.valor),
    minimo: c.minimo === null ? null : Number(c.minimo),
  })) as CupomDaLista[];

  return (
    <Card title="Cupons de desconto" description="Crie um código para divulgar. O cliente digita no pedido e o desconto vai junto na mensagem.">
      <Cupons cupons={cupons} hoje={hojeISO()} />
    </Card>
  );
}
