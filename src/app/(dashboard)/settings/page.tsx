"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

export default function SettingsPage() {
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    async function loadUser() {
      const supabase = createSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email ?? "");

      const { data: partner } = await supabase
        .from("partner")
        .select("full_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      setUserName(partner?.full_name ?? user.email ?? "");
    }
    loadUser();
  }, []);

  async function handlePasswordReset() {
    if (!userEmail) return;
    setResetLoading(true);
    setResetError("");
    setResetSent(false);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });

    if (error) {
      setResetError("Errore nell'invio. Riprova tra qualche istante.");
    } else {
      setResetSent(true);
    }
    setResetLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">
          Roberto Scrigna
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-ink">
          Impostazioni
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Gestisci il tuo profilo e le preferenze.
        </p>
      </div>

      {/* Profile section */}
      <section className="rounded-xl border-[0.5px] border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-medium text-ink">Profilo</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Nome
            </label>
            <input
              type="text"
              value={userName}
              readOnly
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              type="email"
              value={userEmail}
              readOnly
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
            />
            <p className="mt-1 text-xs text-zinc-400">
              L&apos;email non può essere modificata da qui.
            </p>
          </div>
        </div>
      </section>

      {/* Password section */}
      <section className="rounded-xl border-[0.5px] border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-medium text-ink">Sicurezza</h2>
        </div>
        <div className="px-6 py-5">
          <p className="mb-4 text-sm text-zinc-600">
            Riceverai un&apos;email con un link per impostare una nuova password.
          </p>

          {resetSent && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Email di recupero inviata. Controlla la tua casella.
            </div>
          )}

          {resetError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {resetError}
            </div>
          )}

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={resetLoading || !userEmail}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetLoading ? "Invio in corso…" : "Cambia Password"}
          </button>
        </div>
      </section>

      {/* Notifications section */}
      <section className="rounded-xl border-[0.5px] border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-base font-medium text-ink">Notifiche</h2>
        </div>
        <div className="px-6 py-5">
          <p className="mb-4 text-sm text-zinc-600">
            Gestisci le preferenze di notifica per i tuoi clienti.
          </p>
          <Link
            href="/monitoring/notifications"
            className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Vai alle Notifiche
          </Link>
        </div>
      </section>
    </div>
  );
}
