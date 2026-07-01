"use client";

/**
 * Patient SES signing screen (#29). Renders the engagement-letter body for one
 * signature request and lets the patient accept it with an explicit,
 * non-preselected action (the SES requirement), then download the stamped PDF.
 *
 * Data:
 * - request lifecycle (status/provider/accepted_at) → signature.getSignatureRequest (#43)
 * - document content (body/header/placeholders) → fetchSignatureDocument seam (→ #45)
 * - accept / download → signature.acceptSignature / downloadSignedDocument (#43)
 *
 * UI-only: no server/router/migration change. Brand teal/blue, mobile-first,
 * sentence-case Italian, AA contrast, keyboard-operable, reduced-motion aware.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { PORTAL_PALETTE as C } from "@/lib/signature/theme";
import { fetchSignatureDocument, SignatureDocumentError } from "@/lib/signature/fetch-signature-document";
import {
  deriveSignPhase,
  denyMessage,
  formatAcceptedAt,
  acceptanceMethodLabel,
  type SignPhase,
} from "@/lib/signature/sign-state";

// ── styles ────────────────────────────────────────────────────────────────────
// Page width/centering is handled by the shared `portal-container` utility (see
// Frame) so the reading column widens gracefully on desktop instead of staying a
// lonely fixed 680px. Cards: hairline border + soft radius, no heavy shadow.
const card: CSSProperties = { background: C.white, border: `0.5px solid ${C.border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" };
const h1: CSSProperties = { fontSize: "22px", fontWeight: 500, color: C.ink, margin: "0 0 4px" };
const muted: CSSProperties = { fontSize: "13px", fontWeight: 400, color: C.slateSoft, margin: 0 };
const gapStyle: CSSProperties = { background: C.amberWash, color: C.amberDeep, borderRadius: "4px", padding: "0 4px", fontWeight: 500 };

const homeCss = `
.sign-screen a:focus-visible, .sign-screen button:focus-visible, .sign-screen input:focus-visible {
  outline: 2px solid ${C.tealCore}; outline-offset: 2px; border-radius: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .sign-screen *, .sign-screen *::before, .sign-screen *::after { transition: none !important; animation: none !important; }
}`;

// ── tiny safe markdown subset (headings / hr / bold / italic / placeholders) ───
function renderInline(seg: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[PLACEHOLDER:[^\]]*\])|(\{\{[a-z_]+\}\})/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    if (m.index > last) out.push(seg.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={`b${k}${i}`}>{m[2]}</strong>);
    else if (m[4] != null) out.push(<em key={`i${k}${i}`}>{m[4]}</em>);
    else out.push(<mark key={`g${k}${i}`} style={gapStyle}>{m[0]}</mark>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < seg.length) out.push(seg.slice(last));
  return out;
}

function renderLetterBody(md: string): ReactNode[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let key = 0;
  const flush = () => {
    if (!para.length) return;
    const text = para.join("\n");
    blocks.push(
      <p key={`p${key++}`} style={{ fontSize: "14px", fontWeight: 400, color: C.slate, lineHeight: 1.6, margin: "0 0 12px" }}>
        {text.split("\n").flatMap((seg, si) => (si === 0 ? renderInline(seg, `p${key}${si}`) : [<br key={`br${key}${si}`} />, ...renderInline(seg, `p${key}${si}`)]))}
      </p>
    );
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      flush();
      const level = (line.match(/^#+/)?.[0].length ?? 1);
      const text = line.replace(/^#{1,3}\s+/, "");
      blocks.push(
        <div key={`h${key++}`} style={{ fontSize: level === 1 ? "17px" : "15px", fontWeight: 500, color: C.ink, margin: "16px 0 8px" }}>
          {renderInline(text, `h${key}`)}
        </div>
      );
      continue;
    }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      flush();
      blocks.push(<hr key={`hr${key++}`} style={{ border: 0, borderTop: `1px solid ${C.border}`, margin: "16px 0" }} />);
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

// ── base64 → download ─────────────────────────────────────────────────────────
function downloadBase64(pdfBase64: string, mimeType: string, filename: string) {
  const bytes = atob(pdfBase64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mimeType || "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "documento-firmato.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── presentational helpers ────────────────────────────────────────────────────
function Notice({ tone, title, children }: { tone: "info" | "warn" | "danger" | "ok"; title: string; children?: ReactNode }) {
  const map = {
    info: { bg: C.tealWash, bd: C.tealSoft, fg: C.tealDeep },
    ok: { bg: C.tealWash, bd: C.tealSoft, fg: C.tealDeep },
    warn: { bg: C.amberWash, bd: "#EAD9BC", fg: C.amberDeep },
    danger: { bg: C.dangerWash, bd: "#F1C9C2", fg: C.dangerDeep },
  }[tone];
  return (
    <div style={{ ...card, background: map.bg, border: `1px solid ${map.bd}` }}>
      <p style={{ fontSize: "15px", fontWeight: 500, color: map.fg, margin: "0 0 6px" }}>{title}</p>
      {children && <div style={{ fontSize: "13px", fontWeight: 400, color: map.fg }}>{children}</div>}
    </div>
  );
}

function DownloadButton({ requestId }: { requestId: string }) {
  const dl = trpc.signature.downloadSignedDocument.useMutation();
  const [err, setErr] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          setErr(false);
          try {
            const res = await dl.mutateAsync({ requestId });
            downloadBase64(res.pdfBase64, res.mimeType, res.filename);
          } catch {
            setErr(true);
          }
        }}
        disabled={dl.isPending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 20px",
          borderRadius: "999px",
          border: "none",
          background: dl.isPending ? C.tealSoft : C.tealDeep,
          color: C.white,
          fontSize: "14px",
          fontWeight: 500,
          cursor: dl.isPending ? "default" : "pointer",
        }}
      >
        {dl.isPending ? "Preparazione…" : "Scarica documento firmato"}
      </button>
      {err && (
        <p role="alert" style={{ ...muted, color: C.dangerDeep, marginTop: "8px" }}>
          Impossibile scaricare il documento ora. Riprova tra poco.
        </p>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export function SignScreen({ requestId }: { requestId: string }) {
  const requestQuery = trpc.signature.getSignatureRequest.useQuery({ requestId }, { retry: false });
  const docQuery = useQuery({ queryKey: ["signatureDocument", requestId], queryFn: () => fetchSignatureDocument(requestId), retry: false });

  const [accepted, setAccepted] = useState(false); // checkbox ticked (never preselected)
  const [externalBlocked, setExternalBlocked] = useState(false);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const accept = trpc.signature.acceptSignature.useMutation({
    onError: (e) => {
      // provider ≠ internal is guarded server-side (PRECONDITION_FAILED).
      const msg = e?.message ?? "";
      if (e?.data?.code === "PRECONDITION_FAILED" && /intern/i.test(msg)) setExternalBlocked(true);
    },
  });
  const justSigned = accept.isSuccess;

  // Move focus to the confirmation when signing completes (a11y).
  useEffect(() => {
    if (justSigned) confirmRef.current?.focus();
  }, [justSigned]);

  // ── loading ──
  if (requestQuery.isLoading) {
    return (
      <Frame>
        <div style={card}>
          <div style={{ height: "20px", width: "55%", background: "#eef2f6", borderRadius: "6px", marginBottom: "14px" }} />
          <div style={{ height: "120px", background: "#f1f5f9", borderRadius: "10px" }} />
        </div>
      </Frame>
    );
  }

  // ── deny / not-this-patient / not-found ──
  if (requestQuery.error) {
    return (
      <Frame>
        <Notice tone="danger" title="Documento non disponibile">
          {denyMessage(requestQuery.error.data?.code)}
        </Notice>
      </Frame>
    );
  }

  const meta = requestQuery.data;
  const doc = docQuery.data;
  const phase: SignPhase = externalBlocked ? "external" : deriveSignPhase(meta?.status, meta?.provider);
  const version = doc ? `${doc.documentName} — ${doc.versionLabel || `v${doc.versionNumber}`}` : "Lettera d'incarico";

  // ── signed (already or just now) ──
  if (justSigned || phase === "signed") {
    const acceptedAt = accept.data?.acceptedAt ?? meta?.accepted_at ?? null;
    const method = accept.data?.acceptanceMethod ?? meta?.acceptance_method ?? "in_app_ses";
    return (
      <Frame>
        <div style={{ ...card, background: C.tealWash, border: `1px solid ${C.tealSoft}` }} role="status" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <CheckIcon />
            <h1 ref={confirmRef} tabIndex={-1} style={{ ...h1, margin: 0, outline: "none" }}>
              Documento firmato
            </h1>
          </div>
          <p style={{ fontSize: "14px", fontWeight: 400, color: C.tealDeep, margin: "0 0 4px" }}>{version}</p>
          <p className="tnum" style={{ fontSize: "13px", fontWeight: 400, color: C.tealDeep, margin: "0 0 2px" }}>
            Firmato il {formatAcceptedAt(acceptedAt)}
          </p>
          <p style={{ fontSize: "12px", fontWeight: 400, color: C.slate, margin: "0 0 16px" }}>{acceptanceMethodLabel(method)}</p>
          <DownloadButton requestId={requestId} />
        </div>
      </Frame>
    );
  }

  // ── terminal non-signable states ──
  if (phase === "external") {
    return (
      <Frame>
        <Notice tone="warn" title="Firma gestita esternamente">
          Questa richiesta viene firmata tramite un servizio esterno, non in-app. Segui le istruzioni ricevute dal tuo
          professionista per completare la firma.
        </Notice>
      </Frame>
    );
  }
  if (phase === "declined") {
    return (
      <Frame>
        <Notice tone="danger" title="Richiesta rifiutata">
          Questa richiesta di firma è stata rifiutata. Contatta il tuo professionista se pensi sia un errore.
        </Notice>
      </Frame>
    );
  }
  if (phase === "expired") {
    return (
      <Frame>
        <Notice tone="warn" title="Richiesta scaduta">
          Il termine per firmare questo documento è scaduto. Chiedi al tuo professionista di inviarne una nuova.
        </Notice>
      </Frame>
    );
  }
  if (phase === "cancelled") {
    return (
      <Frame>
        <Notice tone="warn" title="Richiesta annullata">
          Questa richiesta di firma è stata annullata.
        </Notice>
      </Frame>
    );
  }
  if (phase === "unsignable") {
    return (
      <Frame>
        <Notice tone="info" title="Documento non firmabile">
          Questa richiesta non è al momento disponibile per la firma.
        </Notice>
      </Frame>
    );
  }

  // ── signable: document view + acceptance gate ──
  const docUnavailable = !!docQuery.error;
  const placeholders = [...(doc?.pendingPlaceholders ?? []), ...(doc?.missingTokens ?? [])];
  const canAccept = accepted && !docUnavailable && !accept.isPending;

  return (
    <Frame>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Firma documento</p>
        <h1 style={h1}>{doc?.documentName ?? "Lettera d'incarico"}</h1>
        <p style={muted}>
          {doc ? (
            <>
              Versione {doc.versionLabel || `v${doc.versionNumber}`} · {doc.practitionerName || "Professionista"} → {doc.patientName || "Cliente"}
            </>
          ) : (
            "Documento da firmare"
          )}
        </p>
      </div>

      {/* Placeholder gaps — shown, not hidden */}
      {placeholders.length > 0 && (
        <Notice tone="warn" title="Campi ancora da completare">
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {placeholders.map((p, i) => (
              <li key={`${p}-${i}`} style={{ marginBottom: "2px" }}>
                <code style={gapStyle}>{p}</code>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {/* Document body — read-only, scrollable */}
      <div style={card}>
        {docQuery.isLoading ? (
          <div style={{ height: "200px", background: "#f1f5f9", borderRadius: "10px" }} aria-hidden />
        ) : docUnavailable ? (
          <p style={{ ...muted, color: C.dangerDeep }}>
            Il testo del documento non è al momento disponibile. Riprova più tardi: non puoi firmare finché non puoi leggerlo.
          </p>
        ) : (
          <div
            role="document"
            aria-label="Testo della lettera d'incarico"
            tabIndex={0}
            style={{ maxHeight: "52vh", overflowY: "auto", padding: "4px 4px 4px 2px" }}
          >
            {renderLetterBody(doc?.bodyMd ?? "")}
          </div>
        )}
      </div>

      {/* Acceptance gate — non-preselected checkbox enables explicit Accetto */}
      <div style={card}>
        <label htmlFor="accept-toggle" style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: docUnavailable ? "default" : "pointer" }}>
          <input
            id="accept-toggle"
            type="checkbox"
            checked={accepted}
            disabled={docUnavailable}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ width: "20px", height: "20px", marginTop: "2px", accentColor: C.tealDeep, flexShrink: 0 }}
          />
          <span style={{ fontSize: "14px", fontWeight: 400, color: C.slate, lineHeight: 1.5 }}>
            Ho letto e accetto il contenuto di questo documento e ne autorizzo la firma elettronica.
          </span>
        </label>

        <div style={{ marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => accept.mutate({ requestId })}
            disabled={!canAccept}
            aria-disabled={!canAccept}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: "999px",
              border: "none",
              background: canAccept ? C.tealDeep : C.tealSoft,
              color: canAccept ? C.white : C.tealDeep,
              fontSize: "15px",
              fontWeight: 500,
              cursor: canAccept ? "pointer" : "not-allowed",
            }}
          >
            {accept.isPending ? "Registrazione…" : "Accetto"}
          </button>
          {accept.isError && !externalBlocked && (
            <p role="alert" style={{ ...muted, color: C.dangerDeep, marginTop: "10px" }}>
              Non è stato possibile registrare la firma. Riprova tra poco.
            </p>
          )}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="sign-screen portal-container">
      <style>{homeCss}</style>
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx={12} cy={12} r={11} fill={C.tealCore} />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Re-export the seam error type so route/tests can reference it without a deep import.
export { SignatureDocumentError };
