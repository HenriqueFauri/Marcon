import Link from "next/link";
import { btnSecondary } from "@/components/ui";

// link errado, loja desligada ou vendedor sem plano com vitrine: não diz qual, só orienta o cliente
export default function LojaNaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fill text-2xl" aria-hidden="true">
        🔎
      </span>
      <h1 className="text-lg font-semibold text-ink">Loja não encontrada</h1>
      <p className="text-sm text-ink-muted">
        Confira se o link está certo. Se foi a loja que te mandou, peça um link novo para ela no WhatsApp.
      </p>
      <Link href="/" className={`${btnSecondary} mt-3`}>
        Conhecer o Marcon
      </Link>
    </main>
  );
}
