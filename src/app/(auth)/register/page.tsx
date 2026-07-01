"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 6) {
      setError("La password deve avere almeno 6 caratteri.");
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border-[0.5px] bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 text-4xl">✉️</div>
          <h1 className="text-xl font-medium text-ink">Controlla la tua email</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Abbiamo inviato un link di conferma a <strong>{email}</strong>.
            Clicca sul link per attivare il tuo account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-[0.5px] bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-2xl font-medium text-white">
          RS
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-ink">Crea account</h1>
        <p className="mt-1 text-sm text-zinc-500">Registrazione professionista</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
            Nome completo
          </label>
          <input
            id="name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={loading}
            className="w-full rounded-md border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            placeholder="Roberto Scrigna"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="w-full rounded-md border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            placeholder="roberto@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="w-full rounded-md border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            placeholder="Minimo 6 caratteri"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password || !fullName}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creazione in corso…" : "Crea account"}
        </button>

        <p className="text-center text-xs text-zinc-400">
          Hai già un account?{" "}
          <a href="/login" className="text-zinc-700 underline">
            Accedi
          </a>
        </p>
      </form>
    </div>
  );
}
