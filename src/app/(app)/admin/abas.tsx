import { Segmentos } from "@/components/ui";

// Seções da administração, no mesmo controle segmentado das abas da Vitrine (DESIGN.md).
export function AbasAdmin({ ativa }: { ativa: "contas" | "indicacoes" }) {
  return (
    <Segmentos
      rotulo="Seções da administração"
      substituir={false}
      className="mb-6"
      itens={[
        { href: "/admin", label: "Contas", ativo: ativa === "contas" },
        { href: "/admin/indicacoes", label: "Indicações", ativo: ativa === "indicacoes" },
      ]}
    />
  );
}
