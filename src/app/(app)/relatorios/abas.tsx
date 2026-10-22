import { Segmentos } from "@/components/ui";

export function AbasRelatorios({ atual }: { atual: "produtos" | "fechamento" }) {
  return (
    <Segmentos
      rotulo="Relatórios"
      substituir={false}
      className="mb-4 w-full sm:w-80"
      itens={[
        { href: "/relatorios", label: "Produtos", ativo: atual === "produtos" },
        { href: "/relatorios/fechamento", label: "Fechamento do mês", ativo: atual === "fechamento" },
      ]}
    />
  );
}
