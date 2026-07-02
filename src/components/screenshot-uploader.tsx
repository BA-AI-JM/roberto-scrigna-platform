"use client";

/**
 * Workout-screenshot uploader.
 *
 * Drop-in component for the coach training-log page (and the portal's
 * client-side log when it lands). Uploads go to the same private
 * "client-media" Supabase Storage bucket under:
 *   training-screenshots/<partner_id>/<client_id>/<uuid>-<filename>
 *
 * Controlled component — the parent owns the list of uploads.
 */

import { useCallback, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "client-media";
const PREVIEW_TTL_SECONDS = 60 * 60;

export interface UploadedScreenshot {
  storagePath: string;
  signedUrl: string;
}

export interface ScreenshotUploaderProps {
  partnerId: string;
  /** Client subfolder owner; uploads are disabled until this is present. */
  clientId: string;
  value: UploadedScreenshot[];
  onChange: (next: UploadedScreenshot[]) => void;
  /** Hint message shown in the drop zone. */
  hint?: string;
  /** Disable upload + delete (used to render historical screenshots read-only). */
  readOnly?: boolean;
}

function safeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

export function ScreenshotUploader({
  partnerId,
  clientId,
  value,
  onChange,
  hint = "Trascina uno screenshot del workout o clicca per caricare",
  readOnly = false,
}: ScreenshotUploaderProps) {
  const supabase = createSupabaseBrowser();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = `training-screenshots/${partnerId}/${clientId}`;
  const ready = Boolean(partnerId && clientId) && !readOnly;

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!ready || !files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const next: UploadedScreenshot[] = [...value];
        for (const file of Array.from(files)) {
          const uniq =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const path = `${prefix}/${uniq}-${safeFilename(file.name)}`;
          const up = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
          if (up.error) {
            setError(up.error.message);
            break;
          }
          const signed = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, PREVIEW_TTL_SECONDS);
          next.push({ storagePath: path, signedUrl: signed.data?.signedUrl ?? "" });
        }
        onChange(next);
      } finally {
        setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [ready, value, onChange, prefix, supabase]
  );

  const removeAt = useCallback(
    async (idx: number) => {
      const item = value[idx];
      if (!item) return;
      // Best-effort cleanup; even if the storage delete fails (e.g. orphan), still drop it from state.
      await supabase.storage.from(BUCKET).remove([item.storagePath]);
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange, supabase]
  );

  return (
    <div>
      {!readOnly && (
        <label
          htmlFor="workout-screenshot-input"
          onDragOver={(e) => {
            if (!ready) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            if (!ready) return;
            e.preventDefault();
            e.stopPropagation();
            void handleFiles(e.dataTransfer?.files ?? null);
          }}
          style={{
            display: "block",
            border: "2px dashed #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            textAlign: "center",
            marginBottom: "12px",
            cursor: ready ? "pointer" : "not-allowed",
            opacity: ready ? 1 : 0.55,
          }}
        >
          <div style={{ fontSize: "26px", marginBottom: "6px" }}>📸</div>
          <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>{hint}</p>
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            {ready
              ? "JPG / PNG / WebP / HEIC · max 10 MB per immagine"
              : "Seleziona prima un cliente per abilitare il caricamento."}
          </p>
          <input
            id="workout-screenshot-input"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            disabled={!ready || uploading}
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </label>
      )}

      {uploading && (
        <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0, marginBottom: "8px" }}>
          Caricamento in corso…
        </p>
      )}

      {error && (
        <div
          style={{
            marginBottom: "8px",
            padding: "10px 12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}

      {value.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          {value.map((item, idx) => (
            <div
              key={item.storagePath}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                borderRadius: "8px",
                overflow: "hidden",
                background: "#f4f4f5",
                border: "1px solid #e4e4e7",
              }}
            >
              {item.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.signedUrl}
                  alt="screenshot"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                    fontSize: "11px",
                  }}
                >
                  (anteprima non disponibile)
                </div>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  title="Rimuovi"
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.55)",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
