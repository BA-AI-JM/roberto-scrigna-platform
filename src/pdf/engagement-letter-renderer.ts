/**
 * Engagement-letter HTML renderer (Requirement #29, Stage 1).
 *
 * Pure function: a FILLED letter body (markdown) → a branded A4 HTML document
 * ready for Puppeteer. Mirrors invoice-renderer.ts brand styling (self-contained
 * inline <style>, #1a1a2e, "Roberto Scrigna"). Tested via string assertions.
 *
 * The body is a small, fixed markdown subset (the IT-03 template uses only
 * headings, bold/italic, horizontal rules and paragraphs). Any remaining gap —
 * an unfilled `{{merge_token}}` or a `[PLACEHOLDER: ...]` Roberto still owes — is
 * highlighted so a preview makes the gaps obvious. This renders a DRAFT for
 * preview; the binding copy is produced by the eIDAS e-signature provider later.
 */

export interface EngagementLetterRenderData {
  bodyMd: string;
  documentName: string;
  versionLabel: string;
  language: string;
  /** When true, shows a "BOZZA / ANTEPRIMA" banner (not a signed document). */
  draft?: boolean;
  /**
   * When present, renders the SIGNED copy: a "FIRMATO" stamp instead of the draft
   * banner, plus an SES acceptance attestation block. Used by the internal SES
   * provider's on-demand regeneration.
   */
  signature?: SignatureStamp;
}

/** Internal-SES acceptance details stamped onto the signed letter (KB §11 / eIDAS SES). */
export interface SignatureStamp {
  signerName: string;
  /** Codice fiscale, when held (n/d otherwise). */
  signerCodiceFiscale?: string | null;
  /** ISO timestamp the patient accepted. */
  acceptedAt: string;
  versionNumber: number;
  contentHash: string;
  /** e.g. "in_app_ses". */
  method: string;
}

// ── Markdown subset → HTML ──────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape, then apply inline bold/italic and highlight remaining gaps. */
function renderInline(text: string): string {
  let out = esc(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Highlight unfilled gaps: [PLACEHOLDER: ...] (Roberto owes) and {{token}} (merge miss).
  out = out.replace(/\[PLACEHOLDER:[^\]]*\]/g, (m) => `<span class="gap">${m}</span>`);
  out = out.replace(/\{\{[a-z_]+\}\}/g, (m) => `<span class="gap">${m}</span>`);
  return out;
}

/** Convert the fixed markdown subset (headings, hr, bold/italic, paragraphs) to HTML. */
export function letterMarkdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p>${para.map(renderInline).join("<br/>")}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    if (line.trim() === "---") {
      flushPara();
      blocks.push("<hr/>");
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const level = h[1]!.length;
      blocks.push(`<h${level}>${renderInline(h[2]!)}</h${level}>`);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks.join("\n");
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function formatStampDateTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function renderEngagementLetterHtml(data: EngagementLetterRenderData): string {
  const { bodyMd, documentName, versionLabel, language, signature, draft = true } = data;
  const bodyHtml = letterMarkdownToHtml(bodyMd);
  const signed = !!signature;

  const topBanner = signed
    ? `<div class="signed-banner">FIRMATO — accettato elettronicamente (Firma Elettronica Semplice, eIDAS)</div>`
    : draft
      ? `<div class="draft-banner">BOZZA / ANTEPRIMA — documento non firmato. La sottoscrizione avviene tramite firma elettronica (eIDAS).</div>`
      : "";

  const attestation = signature
    ? `<div class="attestation">
        <div class="attestation-title">Attestazione di accettazione</div>
        <p>Documento accettato elettronicamente da <strong>${esc(signature.signerName)}</strong>,
        C.F. ${esc(signature.signerCodiceFiscale || "n/d")}, il ${esc(formatStampDateTime(signature.acceptedAt))},
        versione ${signature.versionNumber}, hash <span class="mono">${esc(signature.contentHash)}</span>
        &mdash; Firma Elettronica Semplice (SES) ai sensi del Reg. (UE) n. 910/2014 (eIDAS).</p>
        <p class="attestation-method">Metodo: ${esc(signature.method)}.</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${esc(language)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(documentName)} (${esc(versionLabel)})</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      font-size: 12.5px;
      color: #1a1a2e;
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
    }

    .page {
      padding: 40px 48px 48px;
      display: flex;
      flex-direction: column;
      min-height: 297mm;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24px;
      border-bottom: 2px solid #1a1a2e;
      margin-bottom: 16px;
    }

    .brand-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
    .brand-tagline { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .doc-meta { text-align: right; font-size: 11px; color: #6b7280; }
    .doc-meta .ver { font-weight: 700; color: #1a1a2e; font-size: 13px; }

    .draft-banner {
      margin: 16px 0 8px;
      padding: 8px 14px;
      background: #fffbeb;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #92400e;
    }

    .signed-banner {
      margin: 16px 0 8px;
      padding: 8px 14px;
      background: #f0fdf4;
      border: 1px solid #15803d;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #14532d;
      letter-spacing: 0.04em;
    }

    .attestation {
      margin-top: 20px;
      padding: 14px 16px;
      background: #f0fdf4;
      border-left: 3px solid #15803d;
      border-radius: 0 6px 6px 0;
      font-size: 11px;
      color: #14532d;
      line-height: 1.6;
    }
    .attestation-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .attestation-method { margin-top: 6px; color: #166534; }
    .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 10px; word-break: break-all; }

    .body { margin-top: 12px; line-height: 1.6; }
    .body h1 { font-size: 19px; font-weight: 800; margin: 18px 0 4px; letter-spacing: -0.4px; }
    .body h2 { font-size: 14px; font-weight: 700; margin: 16px 0 4px; }
    .body h3 { font-size: 12.5px; font-weight: 600; color: #475569; margin: 0 0 8px; }
    .body p { margin: 0 0 10px; }
    .body hr { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
    .body strong { font-weight: 700; }

    .gap {
      background: #fee2e2;
      color: #b91c1c;
      padding: 0 3px;
      border-radius: 3px;
      font-weight: 600;
      white-space: nowrap;
    }

    .footer {
      margin-top: auto;
      padding-top: 28px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 10.5px;
      color: #9ca3af;
      line-height: 1.7;
    }
    .footer strong { color: #374151; }
  </style>
</head>
<body>
<div class="page">

  <header class="header">
    <div>
      <div class="brand-name">Roberto Scrigna</div>
      <div class="brand-tagline">Nutrizionista &amp; Personal Trainer</div>
    </div>
    <div class="doc-meta">
      <div class="ver">${esc(versionLabel)}</div>
      <div>${esc(documentName)}</div>
    </div>
  </header>

  ${topBanner}

  <div class="body">
    ${bodyHtml}
  </div>

  ${attestation}

  <footer class="footer">
    <strong>Roberto Scrigna</strong> &mdash; Nutrizionista &amp; Personal Trainer<br />
    ${signed ? "Copia firmata elettronicamente (SES, eIDAS)." : "I campi evidenziati in rosso restano da completare prima della firma."}
  </footer>

</div>
</body>
</html>`;
}
