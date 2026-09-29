import Link from "next/link";
import { btnPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-lg font-semibold text-white">Não encontrado</h1>
      <p className="text-sm text-neutral-400">Esse registro não existe ou foi excluído.</p>
      <Link href="/" className={btnPrimary}>
        Voltar ao início
      </Link>
    </div>
  );
}
