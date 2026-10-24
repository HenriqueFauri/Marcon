import { redirect } from "next/navigation";

// /caixa abre a primeira aba da área (Extrato, em /fluxo-de-caixa)
export default function CaixaPage() {
  redirect("/fluxo-de-caixa");
}
