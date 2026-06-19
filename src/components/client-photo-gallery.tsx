"use client";

/**
 * Client photo gallery + uploader.
 *
 * Renders the partner-facing photo wall for a client. Uploads go directly to
 * the "client-media" Supabase Storage bucket from the browser — the user's JWT
 * is checked against the bucket's RLS policy, so no server intermediary is
 * needed.
 *
 * Path convention:
 *   client-photos/<partner_id>/<client_id>/<uuid>-<safe-filename>
 *
 * Requires migration 002_client_media_storage.sql to be applied (bucket +
 * RLS policies).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "client-media";
const READ_URL_TTL_SECONDS = 60 * 60; // 1 hour

interface PhotoItem {
  storagePath: string;
  signedUrl: string;
  createdAt: string | null;
}

export interface ClientPhotoGalleryProps {
  clientId: string;
  partnerId: string;
  /** When true, the +upload affordance is hidden (gallery becomes read-only). */
  readOnly?: boolean;
}

function safeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

function pathPrefix(partnerId: string, clientId: string): string {
  return `client-photos/${partnerId}/${clientId}`;
}

export function ClientPhotoGallery({
  clientId,
  partnerId,
  readOnly = false,
}: ClientPhotoGalleryProps) {
  const supabase = createSupabaseBrowser();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const prefix = pathPrefix(partnerId, clientId);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const list = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (list.error) {
      setError(list.error.message);
      setLoading(false);
      return;
    }
    const files = (list.data ?? []).filter((o) => o.name && !o.name.endsWith("/"));
    if (files.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    const paths = files.map((f) => `${prefix}/${f.name}`);
    const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, READ_URL_TTL_SECONDS);
    if (signed.error) {
      setError(signed.error.message);
      setLoading(false);
      return;
    }
    const byPath = new Map(
      (signed.data ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""])
    );
    setPhotos(
      files
        .map((f) => {
          const sp = `${prefix}/${f.name}`;
          return {
            storagePath: sp,
            signedUrl: byPath.get(sp) ?? "",
            createdAt: f.created_at ?? null,
          };
        })
        .filter((p) => p.signedUrl)
    );
    setLoading(false);
  }, [supabase, prefix]);

  useEffect(() => {
    if (!partnerId || !clientId) return;
    void refresh();
  }, [refresh, partnerId, clientId]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
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
        }
        await refresh();
      } finally {
        setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [supabase, prefix, refresh]
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!confirm("Eliminare questa foto?")) return;
      const del = await supabase.storage.from(BUCKET).remove([path]);
      if (del.error) {
        setError(del.error.message);
        return;
      }
      await refresh();
    },
    [supabase, refresh]
  );

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
            style={{ fontSize: "13px", color: "#374151" }}
          />
          {uploading && (
            <span style={{ fontSize: "12px", color: "#6b7280" }}>Caricamento…</span>
          )}
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>
            JPG / PNG / WebP / HEIC · max 10 MB per foto
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>Caricamento foto…</p>
      ) : photos.length === 0 ? (
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>
          Nessuna foto. {readOnly ? "" : "Carica la prima foto sopra."}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          {photos.map((p) => (
            <div
              key={p.storagePath}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#f4f4f5",
                border: "1px solid #e4e4e7",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.signedUrl}
                alt={p.storagePath.split("/").pop() ?? "foto"}
                onClick={() => setPreviewPath(p.signedUrl)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  cursor: "zoom-in",
                  display: "block",
                }}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(p.storagePath);
                  }}
                  title="Elimina foto"
                  style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0, 0, 0, 0.55)",
                    color: "#ffffff",
                    fontSize: "13px",
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

      {previewPath && (
        <div
          onClick={() => setPreviewPath(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "32px",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewPath}
            alt="preview"
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "8px" }}
          />
        </div>
      )}
    </div>
  );
}
