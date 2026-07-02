"use client";

/**
 * #27 Stage 2 — the patient's documents/PDFs from portal.getDocuments, with
 * download links. Presentational; the page owns the query.
 */

export interface PortalDocument {
  id: string;
  title: string;
  doc_type: string;
  file_url: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  meal_plan: "Piano alimentare",
  supplement_plan: "Piano integratori",
  check_in_report: "Report check-in",
  progress_report: "Report progressi",
  invoice: "Fattura",
  other: "Documento",
};

function docTypeLabel(t: string): string {
  return DOC_TYPE_LABELS[t] ?? "Documento";
}

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  marginBottom: "16px",
};

export function DocumentsList({ documents, loading }: { documents: PortalDocument[] | undefined; loading: boolean }) {
  return (
    <div style={cardStyle}>
      <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px" }}>Documenti</p>

      {loading ? (
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>Caricamento documenti…</p>
      ) : !documents || documents.length === 0 ? (
        <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Nessun documento disponibile.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {documents.map((doc) => {
            const size = formatSize(doc.file_size_bytes);
            return (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "#1a1a2e",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                    {docTypeLabel(doc.doc_type)} · {formatDate(doc.created_at)}{size ? ` · ${size}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8", whiteSpace: "nowrap" }}>Scarica ↓</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
