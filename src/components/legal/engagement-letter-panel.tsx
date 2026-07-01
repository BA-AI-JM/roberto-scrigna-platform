"use client";

/**
 * Coach engagement-letter surface (#29) — the missing coach half. Lets Roberto:
 *  1. ensure an active letter template exists (seed the default if not),
 *  2. generate + preview the filled letter for a client (with the honest
 *     placeholder gaps he still has to complete),
 *  3. send it to the client for signing, and
 *  4. see the signing status + download the signed PDF once available.
 *
 * Real procedures: legal.getActiveVersion / seedDefaultEngagementLetter /
 * generateEngagementLetter and signature.createSignatureRequest. The persistent
 * status read + signed-PDF download go through the coach-letter data seam
 * (partner-scoped procedures that land later). Brand system, Italian, responsive.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { fetchClientLetterStatus, downloadSignedForClient, letterStatusBadge, NO_LETTER, CoachLetterError } from "@/lib/legal/coach-letter-adapter";

function downloadBase64(pdfBase64: string, mimeType: string, filename: string) {
  const bytes = atob(pdfBase64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: mimeType || "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "documento.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const card = "rounded-xl border-[0.5px] border-border bg-card p-5 sm:p-6";
const btnBrand = "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-[filter] hover:bg-brand-deep active:brightness-95 disabled:opacity-50";
const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full border-[0.5px] border-border bg-card px-5 py-2.5 text-sm font-medium text-ink hover:bg-muted disabled:opacity-50";

export function EngagementLetterPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const templateQuery = trpc.legal.getActiveVersion.useQuery();
  const statusQuery = useQuery({ queryKey: ["clientLetterStatus", clientId], queryFn: () => fetchClientLetterStatus(clientId), retry: false });

  const seed = trpc.legal.seedDefaultEngagementLetter.useMutation({ onSuccess: () => void templateQuery.refetch() });
  const generate = trpc.legal.generateEngagementLetter.useMutation();
  const send = trpc.signature.createSignatureRequest.useMutation({ onSuccess: () => void statusQuery.refetch() });

  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // ── template loading / error ──
  if (templateQuery.isLoading) {
    return (
      <div className={card}>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (templateQuery.error) {
    return (
      <div className={card}>
        <p role="alert" className="text-sm text-[#9f3a2f]">Errore nel caricamento del modello. Riprova più tardi.</p>
      </div>
    );
  }

  const version = templateQuery.data?.version ?? null;

  // ── no active template → seed path ──
  if (!version) {
    return (
      <div className={card}>
        <p className="text-base font-medium text-ink">Nessun modello di lettera attivo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Per generare e inviare una lettera d&apos;incarico serve un modello attivo. Attiva quello predefinito (IT-03): potrai
          personalizzarlo in seguito.
        </p>
        {seed.isError && (
          <p role="alert" className="mt-3 text-sm text-[#9f3a2f]">Attivazione non riuscita. Riprova.</p>
        )}
        <button type="button" onClick={() => seed.mutate()} disabled={seed.isPending} className={`${btnBrand} mt-4`}>
          {seed.isPending ? "Attivazione…" : "Attiva modello predefinito"}
        </button>
      </div>
    );
  }

  // ── has template ──
  const gen = generate.data;
  const sent = send.data;
  const status = sent
    ? { status: sent.status, requestId: sent.requestId, signedAt: null, versionLabel: version.versionLabel }
    : statusQuery.data ?? NO_LETTER;
  const badge = letterStatusBadge(status.status);
  const placeholders = gen ? [...(gen.missingTokens ?? []), ...(gen.pendingPlaceholders ?? [])] : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Active template */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-deep">Modello attivo</p>
          <span className="rounded-full bg-brand-wash px-2.5 py-0.5 text-xs font-medium text-brand-deep">
            {version.versionLabel ?? `v${version.versionNumber}`}
          </span>
        </div>
        <p className="mt-1 text-base font-medium text-ink">{version.documentName}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Lingua {version.language.toUpperCase()} · pubblicato il{" "}
          <span className="tnum">{new Date(version.publishedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </p>
      </div>

      {/* Generate + preview */}
      <div className={card}>
        <p className="text-base font-medium text-ink">Anteprima per {clientName}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera la lettera compilata per vedere esattamente cosa riceverà il cliente prima di inviarla.
        </p>

        {generate.isError && (
          <p role="alert" className="mt-3 text-sm text-[#9f3a2f]">
            {generate.error?.data?.code === "PRECONDITION_FAILED"
              ? "Nessun modello attivo da compilare."
              : "Generazione non riuscita. Riprova."}
          </p>
        )}

        {!gen ? (
          <button type="button" onClick={() => generate.mutate({ clientId })} disabled={generate.isPending} className={`${btnBrand} mt-4`}>
            {generate.isPending ? "Generazione…" : "Genera anteprima"}
          </button>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {placeholders.length > 0 && (
              <div className="rounded-lg border-[0.5px] border-[#ead9bc] bg-amber-wash p-4">
                <p className="text-sm font-medium text-amber">Campi ancora da completare ({placeholders.length})</p>
                <p className="mt-0.5 text-xs text-amber">Questi segnaposto restano nel documento finché non li completi — il cliente li vedrà così.</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {placeholders.map((p, i) => (
                    <li key={`${p}-${i}`} className="rounded bg-amber-wash px-2 py-0.5 text-xs font-medium text-amber">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* PDF preview */}
            <iframe
              title="Anteprima lettera d'incarico"
              src={`data:application/pdf;base64,${gen.pdfBase64}`}
              className="h-[52vh] w-full rounded-lg border-[0.5px] border-border bg-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadBase64(gen.pdfBase64, gen.mimeType, gen.filename)}
                className={btnGhost}
              >
                Scarica bozza PDF
              </button>
              <button type="button" onClick={() => generate.mutate({ clientId })} disabled={generate.isPending} className={btnGhost}>
                {generate.isPending ? "Rigenerazione…" : "Rigenera"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send + status */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-medium text-ink">Firma</p>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: badge.bg, color: badge.fg }}>
            {badge.label}
          </span>
        </div>

        {send.isSuccess ? (
          <div className="mt-3 rounded-lg border-[0.5px] border-brand-soft bg-brand-wash p-4" role="status" aria-live="polite">
            <p className="text-sm font-medium text-brand-deep">Inviata a {clientName} per la firma</p>
            <p className="mt-0.5 text-sm text-brand-deep">
              Il cliente riceverà la richiesta nel portale. Non è una chat: la firma può richiedere qualche giorno.
            </p>
          </div>
        ) : status.status === "signed" ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">Il cliente ha firmato la lettera d&apos;incarico.</p>
            <button
              type="button"
              disabled={downloading || !status.requestId}
              onClick={async () => {
                if (!status.requestId) return;
                setDownloadErr(null);
                setDownloading(true);
                try {
                  const doc = await downloadSignedForClient(status.requestId);
                  downloadBase64(doc.pdfBase64, doc.mimeType, doc.filename);
                } catch (e) {
                  setDownloadErr(e instanceof CoachLetterError && e.code === "FORBIDDEN" ? "Permesso negato." : "Download non ancora disponibile.");
                } finally {
                  setDownloading(false);
                }
              }}
              className={`${btnBrand} mt-3`}
            >
              {downloading ? "Preparazione…" : "Scarica documento firmato"}
            </button>
            {downloadErr && <p role="alert" className="mt-2 text-sm text-[#9f3a2f]">{downloadErr}</p>}
          </div>
        ) : status.status === "none" ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">Non ancora inviata. Genera l&apos;anteprima e invia la lettera al cliente per la firma.</p>
            {send.isError && <p role="alert" className="mt-2 text-sm text-[#9f3a2f]">Invio non riuscito. Riprova.</p>}
            <button type="button" onClick={() => send.mutate({ clientId })} disabled={send.isPending || !gen} className={`${btnBrand} mt-3`} title={!gen ? "Genera prima l'anteprima" : undefined}>
              {send.isPending ? "Invio…" : "Invia al cliente per la firma"}
            </button>
            {!gen && <p className="mt-2 text-xs text-muted-foreground">Genera prima l&apos;anteprima per abilitare l&apos;invio.</p>}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">In attesa della firma del cliente.</p>
        )}
      </div>
    </div>
  );
}
