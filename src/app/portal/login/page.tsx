/**
 * Client portal login page.
 *
 * Magic link authentication — client enters email, receives a login link via Resend/Supabase.
 * On submission, calls supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } }).
 */

"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { isSafePortalPath, PORTAL_NEXT_COOKIE } from "@/lib/portal/next-path";

// ── Component ─────────────────────────────────────────────────────────────────

/** Magic link login form for client portal. */
export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  /**
   * Submit the magic link request to Supabase Auth.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    const supabase = createSupabaseBrowser();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/portal/auth/callback`
        : "/portal/auth/callback";

    // A4 (#14): deep-link after login. The delivery email arrives as
    // /portal/login?next=/portal/plan — stash the validated target in a
    // short-lived cookie (NOT in emailRedirectTo: the GoTrue redirect
    // allowlist stays untouched); the auth callback reads and clears it.
    if (typeof window !== "undefined") {
      const nextTarget = new URLSearchParams(window.location.search).get("next");
      if (isSafePortalPath(nextTarget)) {
        document.cookie = `${PORTAL_NEXT_COOKIE}=${encodeURIComponent(nextTarget)}; path=/; max-age=900; samesite=lax`;
      }
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false, // clients must already exist in the system
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(
        error.message.includes("User not found") || error.message.includes("signup")
          ? "Email non trovata. Contatta il tuo coach per attivare l'accesso."
          : error.message
      );
    } else {
      setStatus("sent");
    }
  }

  const isBusy = status === "loading" || !email.trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-wash p-6">
      <div className="w-full max-w-[420px] rounded-xl border-[0.5px] border-brand-soft bg-white p-10 shadow-sm sm:p-12">
        {/* Header */}
        <div className="mb-9 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-2xl">
            🥗
          </div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">
            Roberto Scrigna — Nutrizione Sportiva
          </p>
          <h1 className="m-0 text-xl font-medium text-ink">Area Cliente</h1>
        </div>

        {/* Sent state */}
        {status === "sent" ? (
          <div className="rounded-xl border-[0.5px] border-brand-soft bg-brand-wash p-6 text-center">
            <div className="mb-3 text-3xl">📧</div>
            <h2 className="mb-2 mt-0 text-base font-medium text-brand-deep">Link inviato!</h2>
            <p className="m-0 text-sm text-brand-deep">
              Controlla la tua email <strong className="font-medium">{email}</strong> e clicca sul
              link per accedere. Il link scade in 1 ora.
            </p>
          </div>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="la-tua@email.com"
                required
                disabled={status === "loading"}
                className="w-full rounded-md border border-input bg-white px-4 py-3 text-[15px] text-foreground outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                autoComplete="email"
                autoFocus
              />
            </div>

            {status === "error" && errorMsg && (
              <div className="mb-4 rounded-md border-[0.5px] border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="mt-6 w-full rounded-md bg-brand px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-brand-soft"
            >
              {status === "loading" ? "Invio in corso…" : "Invia link di accesso"}
            </button>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
              Riceverai un link via email per accedere senza password.
              <br />
              Non hai un account? Contatta il tuo coach.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
