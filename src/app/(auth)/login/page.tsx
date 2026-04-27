"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Password reset state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Email o password non corretti."
          : authError.message,
      );
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    setResetError("");
    setResetSuccess(false);

    const supabase = createSupabaseBrowser();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      resetEmail,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      },
    );

    if (resetErr) {
      setResetError(
        resetErr.message === "Email not found"
          ? "Nessun account associato a questa email."
          : "Errore nell'invio. Riprova.",
      );
    } else {
      setResetSuccess(true);
    }
    setResetLoading(false);
  }

  return (
    <div className="rounded-xl border bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 text-2xl text-white">
          RS
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Accedi</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Roberto Scrigna — Nutrition Platform
        </p>
      </div>

      {!showReset ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
                placeholder="roberto@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Accesso in corso…" : "Accedi"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setShowReset(true);
                setResetEmail(email);
                setResetError("");
                setResetSuccess(false);
              }}
              className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
            >
              Password dimenticata?
            </button>
          </div>
        </>
      ) : (
        <>
          {resetSuccess ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
                Email di recupero inviata. Controlla la tua casella.
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setResetSuccess(false);
                }}
                className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Torna al login
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-zinc-600">
                Inserisci la tua email per ricevere il link di recupero password.
              </p>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="mb-1 block text-sm font-medium text-zinc-700"
                  >
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={resetLoading}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
                    placeholder="roberto@example.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {resetError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetLoading || !resetEmail}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetLoading ? "Invio in corso…" : "Invia link di recupero"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowReset(false);
                    setResetError("");
                  }}
                  className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Torna al login
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
