/**
 * Client portal login page.
 *
 * Magic link authentication — client enters email, receives a login link via Resend/Supabase.
 * On submission, calls supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } }).
 */

"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f8fafc",
  padding: "24px",
} as const;

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  padding: "48px 40px",
  width: "100%",
  maxWidth: "420px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

const labelStyle = {
  display: "block",
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "8px",
} as const;

const inputStyle = {
  width: "100%",
  padding: "12px 16px",
  fontSize: "15px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  outline: "none",
  boxSizing: "border-box" as const,
  color: "#111827",
  backgroundColor: "#ffffff",
} as const;

const buttonStyle = {
  width: "100%",
  padding: "13px 20px",
  fontSize: "15px",
  fontWeight: 600,
  backgroundColor: "#1a1a2e",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginTop: "24px",
} as const;

const disabledButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#9ca3af",
  cursor: "not-allowed",
} as const;

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

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              backgroundColor: "#1a1a2e",
              borderRadius: "14px",
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            🥗
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>
            Area Cliente
          </h1>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            Roberto Scrigna — Nutrizione Sportiva
          </p>
        </div>

        {/* Sent state */}
        {status === "sent" ? (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "12px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📧</div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#15803d", margin: "0 0 8px" }}>
              Link inviato!
            </h2>
            <p style={{ fontSize: "14px", color: "#166534", margin: 0 }}>
              Controlla la tua email <strong>{email}</strong> e clicca sul link per accedere. Il
              link scade in 1 ora.
            </p>
          </div>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label htmlFor="email" style={labelStyle}>
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
                style={inputStyle}
                autoComplete="email"
                autoFocus
              />
            </div>

            {status === "error" && errorMsg && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#dc2626",
                  marginBottom: "16px",
                }}
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              style={status === "loading" || !email.trim() ? disabledButtonStyle : buttonStyle}
            >
              {status === "loading" ? "Invio in corso…" : "Invia link di accesso"}
            </button>

            <p
              style={{
                fontSize: "12px",
                color: "#9ca3af",
                textAlign: "center",
                marginTop: "20px",
                lineHeight: "1.5",
              }}
            >
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
