"use client";

/**
 * #2 Stage-1 — empty-state stub for a section whose data lands in a Stage-2
 * backend PR (Notifiche → notification.getForClient; Energia → client.estimateTdee).
 * Renders a labelled "disponibile a breve" placeholder so the consolidated
 * top-down layout is complete and the real panel slots straight in.
 */

interface PlaceholderSectionProps {
  title: string;
  hint: string;
}

export function PlaceholderSection({ title, hint }: PlaceholderSectionProps) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          {title}
        </h3>
      </div>
      <div
        style={{
          margin: "20px 24px",
          padding: "20px 24px",
          textAlign: "center",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "8px",
          border: "1px dashed #e2e8f0",
          fontSize: "13px",
        }}
      >
        <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>
          Disponibile a breve
        </div>
        {hint}
      </div>
    </div>
  );
}
