/**
 * Root error boundary — catches unhandled errors across the entire app.
 */

"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f8fafc",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #fecaca",
          borderRadius: "16px",
          padding: "48px 40px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "0 0 10px",
          }}
        >
          Si è verificato un errore
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0 0 28px",
            lineHeight: "1.6",
          }}
        >
          Qualcosa è andato storto. Prova a ricaricare la pagina o torna alla
          home.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "11px 24px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
          <Link
            href="/"
            style={{
              padding: "11px 24px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Torna alla Home
          </Link>
        </div>

        {error.digest && (
          <p
            style={{
              marginTop: "20px",
              fontSize: "11px",
              color: "#6b7280",
              fontFamily: "monospace",
            }}
          >
            Codice errore: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
