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
    <div>
      <div className="mb-8">
        <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-3">
          Area professionista
        </div>
        <h1 className="text-[34px] text-ink">Bentornato</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Scrigna — Nutrizione Sportiva
        </p>
      </div>

      {!showReset ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-ink"
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
                className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[15px] text-ink focus:border-brand disabled:opacity-50"
                placeholder="roberto@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-ink"
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
                className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[15px] text-ink focus:border-brand disabled:opacity-50"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-[12px] bg-red-wash px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-full bg-brand px-4 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
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
              className="text-sm text-accent-blue underline-offset-2 hover:text-brand-deep hover:underline"
            >
              Password dimenticata?
            </button>
          </div>
        </>
      ) : (
        <>
          {resetSuccess ? (
            <div className="space-y-4">
              <div className="rounded-[12px] bg-brand-wash px-4 py-4 text-sm text-brand-deep">
                Email di recupero inviata. Controlla la tua casella.
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setResetSuccess(false);
                }}
                className="w-full rounded-full border border-border px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Torna al login
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Inserisci la tua email per ricevere il link di recupero password.
              </p>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="mb-1.5 block text-[13px] font-medium text-ink"
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
                    className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[15px] text-ink focus:border-brand disabled:opacity-50"
                    placeholder="roberto@example.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <div className="rounded-[12px] bg-red-wash px-4 py-3 text-sm text-destructive">
                    {resetError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetLoading || !resetEmail}
                  className="w-full rounded-full bg-brand px-4 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetLoading ? "Invio in corso…" : "Invia link di recupero"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowReset(false);
                    setResetError("");
                  }}
                  className="w-full rounded-full border border-border px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
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
