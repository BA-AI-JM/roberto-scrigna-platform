/**
 * Dashboard error boundary — catches unhandled errors in the (dashboard) route group.
 */

"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "32px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #fecaca",
          borderRadius: "14px",
          padding: "40px 36px",
          maxWidth: "460px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "14px" }}>⚠️</div>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "0 0 10px",
          }}
        >
          Si è verificato un errore
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "#6b7280",
            margin: "0 0 24px",
            lineHeight: "1.6",
          }}
        >
          Impossibile caricare questa sezione. Riprova o torna alla dashboard.
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 22px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
          <Link
            href="/dashboard"
            style={{
              padding: "10px 22px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "13px",
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
              marginTop: "16px",
              fontSize: "11px",
              color: "#6b7280",
              fontFamily: "monospace",
            }}
          >
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
