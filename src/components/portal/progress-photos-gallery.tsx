"use client";

/**
 * #27 — patient progress-photo gallery for the "Progressi" tab.
 *
 * DISPLAY half: renders the front/side/back photos stored on each snapshot
 * (portal.getSnapshots → photo_front_url/photo_side_url/photo_back_url, PR #33),
 * grouped by snapshot date, newest-first. A stored value may be an absolute URL
 * (rendered directly) or a private-bucket storage path (signed for display via
 * the client's own RLS read access — migration 002).
 *
 * UPLOAD half is GATED: clients can't write the client-photos/ subtree until
 * storage-RLS migration 007 is applied. Flip PHOTO_UPLOAD_ENABLED to true once
 * 007 lands — that is the single switch to surface the upload affordance.
 */

import { useEffect, useState } from "react";

export interface PhotoSnapshot {
  id: string;
  taken_at: string | null;
  photo_front_url: string | null;
  photo_side_url: string | null;
  photo_back_url: string | null;
}

/**
 * Photo UPLOAD switch. FALSE until storage-RLS migration 007 (client-photos/
 * write) is applied — patients can't upload before then. Flip to true to enable.
 */
export const PHOTO_UPLOAD_ENABLED = false;

const BUCKET = "client-media";

const POSES = [
  { key: "photo_front_url", label: "Fronte" },
  { key: "photo_side_url", label: "Lato" },
  { key: "photo_back_url", label: "Retro" },
] as const;

export function hasAnyPhoto(s: PhotoSnapshot): boolean {
  return Boolean(s.photo_front_url || s.photo_side_url || s.photo_back_url);
}

export function snapshotsWithPhotos(snapshots: PhotoSnapshot[] | undefined): PhotoSnapshot[] {
  return (snapshots ?? []).filter(hasAnyPhoto);
}

export function isAbsoluteUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

/** Stored values that are storage paths (not absolute URLs) → need signing. */
export function collectStoragePaths(snapshots: PhotoSnapshot[]): string[] {
  const out: string[] = [];
  for (const s of snapshots) {
    for (const p of POSES) {
      const v = s[p.key];
      if (v && !isAbsoluteUrl(v)) out.push(v);
    }
  }
  return [...new Set(out)];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  marginBottom: "16px",
};

export function ProgressPhotosGallery({
  snapshots,
  loading,
}: {
  snapshots: PhotoSnapshot[] | undefined;
  loading: boolean;
}) {
  const withPhotos = snapshotsWithPhotos(snapshots);
  const storagePaths = collectStoragePaths(withPhotos);
  const [signed, setSigned] = useState<Record<string, string>>({});

  // Sign any storage-path values (the client reads its own client-photos subtree
  // under the 002 RLS read policy). Absolute URLs skip this entirely.
  const pathKey = storagePaths.join("|");
  useEffect(() => {
    if (!pathKey) return;
    let cancelled = false;
    (async () => {
      const { createSupabaseBrowser } = await import("@/lib/supabase/client");
      const res = await createSupabaseBrowser().storage
        .from(BUCKET)
        .createSignedUrls(pathKey.split("|"), 3600);
      if (cancelled || res.error || !res.data) return;
      const map: Record<string, string> = {};
      for (const r of res.data) if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
      setSigned(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathKey]);

  const resolve = (v: string | null): string | null => {
    if (!v) return null;
    return isAbsoluteUrl(v) ? v : signed[v] ?? null;
  };

  if (loading) {
    return <div style={{ ...cardStyle, color: "#9ca3af", fontSize: "14px" }}>Caricamento foto…</div>;
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Foto dei progressi</p>
        {!PHOTO_UPLOAD_ENABLED && (
          <span
            data-testid="photo-upload-gated"
            style={{ fontSize: "11px", color: "#9ca3af", background: "#f1f5f9", borderRadius: "999px", padding: "3px 10px" }}
          >
            Caricamento foto disponibile a breve
          </span>
        )}
      </div>

      {withPhotos.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #e2e8f0", fontSize: "13px" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>📸</div>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>Nessuna foto</div>
          Le tue foto dei progressi compariranno qui.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {withPhotos.map((s) => (
            <div key={s.id}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "8px" }}>{formatDate(s.taken_at)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {POSES.map((p) => {
                  const url = resolve(s[p.key]);
                  if (!url) return null;
                  return (
                    <a
                      key={p.key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ flex: "1 1 96px", minWidth: "96px", maxWidth: "150px" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${p.label} — ${formatDate(s.taken_at)}`}
                        loading="lazy"
                        style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0", display: "block" }}
                      />
                      <div style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", marginTop: "4px" }}>{p.label}</div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
