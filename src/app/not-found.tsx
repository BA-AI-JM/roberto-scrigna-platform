/**
 * Custom 404 page — shown when a route is not found.
 */

import Link from "next/link";

export default function NotFound() {
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
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          padding: "48px 40px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            fontSize: "64px",
            fontWeight: 800,
            color: "#e2e8f0",
            lineHeight: 1,
            marginBottom: "8px",
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "0 0 10px",
          }}
        >
          Pagina non trovata
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0 0 32px",
            lineHeight: "1.6",
          }}
        >
          La pagina che stai cercando non esiste o è stata spostata.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <Link
            href="/"
            style={{
              padding: "11px 28px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Torna alla Home
          </Link>
          <Link
            href="/portal/login"
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
            Area Cliente
          </Link>
        </div>
      </div>
    </div>
  );
}
