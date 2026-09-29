"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-erros";
import { Field, btnPrimary, inputClass } from "@/components/ui";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }
    setErro(null);
    setSalvando(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    if (error) {
      setErro(traduzirErroAuth(error.message));
      setSalvando(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <form onSubmit={salvar} className="w-full max-w-sm rounded-[28px] bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-ink">Nova senha</h1>
        <p className="mb-6 text-sm text-ink-muted">Escolha a senha que vai usar para entrar daqui pra frente.</p>
        <div className="flex flex-col gap-4">
          <Field label="Nova senha">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Repita a nova senha">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className={inputClass}
            />
          </Field>
          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}
          <button type="submit" disabled={salvando} className={`${btnPrimary} py-2.5`}>
            {salvando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
