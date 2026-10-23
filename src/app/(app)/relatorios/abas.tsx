import { Segmentos } from "@/components/ui";
import { hrefRelatorio, type PeriodoRelatorio } from "@/lib/relatorios";

// Seções da área de Relatórios; o período escolhido acompanha Resumo e Produtos.
export function AbasRelatorios({ atual, periodo }: { atual: "resumo" | "produtos" | "fechamento"; periodo?: PeriodoRelatorio }) {
  const com = (base: string) => (periodo ? hrefRelatorio(base, periodo) : base);
  return (
    <Segmentos
      rotulo="Relatórios"
      substituir={false}
      className="mb-4 w-full sm:w-96"
      itens={[
        { href: com("/relatorios"), label: "Resumo", ativo: atual === "resumo" },
        { href: com("/relatorios/produtos"), label: "Produtos", ativo: atual === "produtos" },
        { href: "/relatorios/fechamento", label: "Fechamento", ativo: atual === "fechamento" },
      ]}
    />
  );
}
