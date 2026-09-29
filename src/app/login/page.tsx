"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-erros";
import { Field, btnPrimary, inputClass } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

type Modo = "signin" | "signup" | "reset";

const TITULOS: Record<Modo, string> = {
  signin: "Entrar",
  signup: "Criar conta",
  reset: "Recuperar senha",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47a5.54 5.54 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.83Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.92H1.3v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.31 14.31A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.38-2.31V6.58H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.42l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.94 11.94 0 0 0 12 0 12 12 0 0 0 1.3 6.58l4.01 3.11C6.25 6.87 8.89 4.77 12 4.77Z" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Modo>(searchParams.get("modo") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [nome, setNome] = useState("");
  const [nomeNegocio, setNomeNegocio] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("erro") === "link" ? "O link expirou ou já foi usado. Tente de novo." : null,
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function trocarModo(novo: Modo) {
    setMode(novo);
    setError(null);
    setAviso(null);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(traduzirErroAuth(error.message));
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
        });
        if (error) throw error;
        setAviso("Se existir uma conta com esse e-mail, você vai receber um link para criar uma nova senha.");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nome: nome.trim(), nome_negocio: nomeNegocio.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          // projeto com confirmação de e-mail: ainda não dá pra entrar
          setAviso(`Enviamos um link de confirmação para ${email}. Abra o e-mail e depois entre por aqui.`);
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(traduzirErroAuth(err instanceof Error ? err.message : "Algo deu errado."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-3">
        <svg viewBox="0 0 512 512" width="44" height="44" role="img" aria-label="Marcon" className="shrink-0 drop-shadow-md">
          <defs>
            <linearGradient id="marcon-logo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e5794a" />
              <stop offset=".55" stopColor="#d45f30" />
              <stop offset="1" stopColor="#b85028" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="116" fill="url(#marcon-logo)" />
          <path
            transform="translate(127.9 355.4)"
            fill="#fff"
            d="M20.72 0V-198.8H77.5L128.13 -54.04L178.64 -198.8H235.42V0H192.86V-128.8L146.1 -0.5H109.87L63.28 -128.8V0Z"
          />
        </svg>
        <div>
          <p className="text-[17px] font-bold tracking-tight text-ink">Marcon</p>
          <p className="text-xs text-ink-muted">Vendas, estoque e caixa num só lugar</p>
        </div>
      </div>

      <div className="rounded-[28px] bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-ink">{TITULOS[mode]}</h1>
        <p className="mb-6 text-sm text-ink-muted">
          {mode === "reset"
            ? "Informe seu e-mail e enviaremos um link para criar uma nova senha."
            : mode === "signup"
              ? "Leva menos de um minuto."
              : "Que bom te ver de novo."}
        </p>

        {aviso && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-positive/30 bg-positive-tint px-3 py-2 text-sm text-positive"
          >
            {aviso}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <>
              <Field label="Seu nome">
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={inputClass}
                  placeholder="Yasmin Souza"
                />
              </Field>
              <Field label="Nome do negócio">
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={nomeNegocio}
                  onChange={(e) => setNomeNegocio(e.target.value)}
                  className={inputClass}
                  placeholder="Loja da Yasmin"
                />
              </Field>
            </>
          )}
          <Field label="E-mail">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="voce@email.com"
            />
          </Field>
          {mode !== "reset" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="senha" className="text-xs font-medium text-ink-muted">
                  Senha
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => trocarModo("reset")}
                    className="text-xs text-ink-muted hover:text-brand-text"
                  >
                    Esqueci a senha
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-20`}
                  placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "••••••••"}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  aria-label={mostrarSenha ? "Esconder senha" : "Mostrar senha"}
                >
                  {mostrarSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={`${btnPrimary} mt-1 py-2.5`}>
            {loading ? "Aguarde..." : mode === "reset" ? "Enviar link" : TITULOS[mode]}
          </button>
        </form>

        {mode !== "reset" && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-fill" />
              <span className="text-xs text-ink-muted">ou</span>
              <div className="h-px flex-1 bg-fill" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-fill px-4 py-3 text-[15px] font-semibold text-ink transition hover:bg-fill-strong disabled:opacity-50"
            >
              <GoogleIcon />
              {googleLoading ? "Aguarde..." : "Continuar com Google"}
            </button>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {mode === "signin" ? (
          <>
            Não tem conta?{" "}
            <button onClick={() => trocarModo("signup")} className="font-medium text-brand-text hover:underline">
              Criar uma
            </button>
          </>
        ) : (
          <>
            {mode === "signup" ? "Já tem conta? " : "Lembrou a senha? "}
            <button onClick={() => trocarModo("signin")} className="font-medium text-brand-text hover:underline">
              Entrar
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle variante="icone" />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
