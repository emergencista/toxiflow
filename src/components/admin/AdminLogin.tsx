"use client";

import { useState } from "react";

function getAdminApiPath(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  const basePath = window.location.pathname.startsWith("/toxiflow") ? "/toxiflow" : "";
  return `${basePath}${path}`;
}

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(getAdminApiPath("/api/admin/session"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const result = (await response.json()) as { error?: string; requiresOtp?: boolean };

      if (!response.ok) {
        throw new Error(result.error ?? "Falha no login.");
      }

      if (result.requiresOtp) {
        setRequiresOtp(true);
        setError(null);
        return;
      }

      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha no login.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(getAdminApiPath("/api/admin/session"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code: otp })
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Falha na verificação do código.");
      }

      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha na verificação do código.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_22px_70px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admin protegido</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Entrar no painel</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {requiresOtp ? "Digite o código enviado no Telegram para concluir o acesso." : "Acesso restrito por login, senha e 2FA."}
      </p>

      {requiresOtp ? (
        <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Código de verificação
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "Validando..." : "Validar código"}
          </button>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Login
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
