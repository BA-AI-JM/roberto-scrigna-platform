"use client";

/**
 * #27 Stage 1 — "in arrivo" stub for portal tabs whose pages land in Stage 2
 * (Diario → food diary; Progressi → body-comp/photos). The nav tab links here so
 * the IA is complete; the real UI replaces this stub in Stage 2.
 */

export function PortalComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 16px" }}>{title}</h1>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "12px" }} aria-hidden>
          {icon}
        </div>
        <p style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 6px" }}>In arrivo</p>
        <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}
