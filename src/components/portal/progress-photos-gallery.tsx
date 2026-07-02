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
 * UPLOAD half (storage-RLS migration 007 is now applied): the patient can add
 * front/side/back photos from their phone. Files upload directly to the
 * "client-media" bucket under client-photos/<partner_id>/<client_id>/ using the
 * patient's own JWT (RLS-scoped to their folder), then the resulting storage
 * paths are persisted via portal.addSnapshot so they appear in the gallery —
 * mirrors the patient-side ScreenshotUploader pattern (training-screenshots/).
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
 * Photo UPLOAD switch. TRUE now that storage-RLS migration 007 (client-photos/
 * write for the owning client) is applied on prod — patients can upload their
 * own progress photos. The upload control only renders when this is true AND the
 * patient's partnerId/clientId and a saveSnapshot callback are supplied.
 */
export const PHOTO_UPLOAD_ENABLED = true;

const BUCKET = "client-media";

/** Soft client-side cap; the bucket also enforces its own limit server-side. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const POSES = [
  { key: "photo_front_url", label: "Fronte" },
  { key: "photo_side_url", label: "Lato" },
  { key: "photo_back_url", label: "Retro" },
] as const;

export type PoseKey = (typeof POSES)[number]["key"];

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

// ── Upload orchestration (pure; injectable deps for testability) ───────────────

/** A minimal File shape — keeps the orchestrator unit-testable without the DOM. */
export interface UploadFile {
  name: string;
  size: number;
  type: string;
}

export interface PoseSelection {
  key: PoseKey;
  file: UploadFile;
}

export interface SnapshotPhotoUrls {
  photoFrontUrl?: string;
  photoSideUrl?: string;
  photoBackUrl?: string;
}

const POSE_TO_URL_KEY: Record<PoseKey, keyof SnapshotPhotoUrls> = {
  photo_front_url: "photoFrontUrl",
  photo_side_url: "photoSideUrl",
  photo_back_url: "photoBackUrl",
};

export function safePhotoFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80) || "foto.jpg"
  );
}

function uniqueId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** client-photos/<partner_id>/<client_id>/<uniq>-<safe-filename> */
export function buildPhotoPath(
  partnerId: string,
  clientId: string,
  fileName: string,
  uniq: string
): string {
  return `client-photos/${partnerId}/${clientId}/${uniq}-${safePhotoFilename(fileName)}`;
}

export interface UploadProgressDeps {
  partnerId: string;
  clientId: string;
  /** Upload one file to its computed storage path. */
  upload: (path: string, file: UploadFile) => Promise<{ error: { message: string } | null }>;
  /** Persist the resulting URLs as a new snapshot (portal.addSnapshot). */
  saveSnapshot: (urls: SnapshotPhotoUrls) => Promise<unknown>;
  /** Override the unique-id source (deterministic tests). */
  makeId?: () => string;
}

/**
 * Upload each selected pose to the client-photos subtree, then persist the
 * storage paths as a single snapshot. Returns a result object — never throws —
 * so the UI can surface a clear message instead of crashing.
 */
export async function uploadProgressPhotos(
  selections: PoseSelection[],
  deps: UploadProgressDeps
): Promise<{ ok: boolean; error?: string }> {
  if (!deps.partnerId || !deps.clientId) {
    return { ok: false, error: "Profilo non ancora disponibile. Riprova tra poco." };
  }
  const chosen = selections.filter((s) => s.file);
  if (chosen.length === 0) {
    return { ok: false, error: "Seleziona almeno una foto." };
  }
  const makeId = deps.makeId ?? uniqueId;
  const urls: SnapshotPhotoUrls = {};
  for (const sel of chosen) {
    if (sel.file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `Il file "${sel.file.name}" supera i 10 MB.` };
    }
    const path = buildPhotoPath(deps.partnerId, deps.clientId, sel.file.name, makeId());
    let res: { error: { message: string } | null };
    try {
      res = await deps.upload(path, sel.file);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Errore durante il caricamento." };
    }
    if (res?.error) {
      return { ok: false, error: res.error.message };
    }
    urls[POSE_TO_URL_KEY[sel.key]] = path;
  }
  try {
    await deps.saveSnapshot(urls);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore nel salvataggio delle foto." };
  }
  return { ok: true };
}

// ── Presentation ───────────────────────────────────────────────────────────────

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

/**
 * The patient's own upload control. Mobile-first: each pose input accepts
 * `image/*`, so phones offer "Take Photo" alongside the photo library. Uploads
 * run on the Salva click (not during render), keeping the gallery SSR-safe.
 */
function ProgressPhotoUploader({
  partnerId,
  clientId,
  saveSnapshot,
}: {
  partnerId: string;
  clientId: string;
  saveSnapshot: (urls: SnapshotPhotoUrls) => Promise<unknown>;
}) {
  const [files, setFiles] = useState<Partial<Record<PoseKey, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (key: PoseKey, fileList: FileList | null) => {
    const f = fileList && fileList.length > 0 ? fileList[0] : null;
    setError(null);
    setFiles((prev) => {
      const next = { ...prev };
      if (f) next[key] = f;
      else delete next[key];
      return next;
    });
  };

  const selectedCount = POSES.filter((p) => files[p.key]).length;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    const selections: PoseSelection[] = POSES.filter((p) => files[p.key]).map((p) => ({
      key: p.key,
      file: files[p.key] as File,
    }));
    try {
      const { createSupabaseBrowser } = await import("@/lib/supabase/client");
      const sb = createSupabaseBrowser();
      const result = await uploadProgressPhotos(selections, {
        partnerId,
        clientId,
        upload: (path, file) =>
          sb.storage.from(BUCKET).upload(path, file as File, {
            cacheControl: "3600",
            upsert: false,
            contentType: (file as File).type || "application/octet-stream",
          }),
        saveSnapshot,
      });
      if (!result.ok) {
        setError(result.error ?? "Errore durante il caricamento.");
        return;
      }
      setFiles({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto durante il caricamento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: "12px",
        padding: "14px",
        marginBottom: "16px",
        background: "#f8fafc",
      }}
    >
      <p style={{ fontSize: "13px", fontWeight: 600, color: "#374151", margin: "0 0 10px" }}>
        Aggiungi nuove foto
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {POSES.map((p) => {
          const chosen = Boolean(files[p.key]);
          return (
            <label
              key={p.key}
              style={{
                flex: "1 1 90px",
                minWidth: "90px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "12px 8px",
                border: `1px solid ${chosen ? "#6366f1" : "#e2e8f0"}`,
                borderRadius: "10px",
                background: chosen ? "#eef2ff" : "#ffffff",
                cursor: busy ? "not-allowed" : "pointer",
                fontSize: "12px",
                color: "#374151",
                textAlign: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontSize: "11px", color: chosen ? "#4f46e5" : "#6b7280" }}>
                {chosen ? "✓ selezionata" : "Scegli / scatta"}
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => pick(p.key, e.target.files)}
                style={{ display: "none" }}
              />
            </label>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: "10px",
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

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy || selectedCount === 0}
        style={{
          marginTop: "12px",
          width: "100%",
          padding: "11px",
          borderRadius: "10px",
          border: "none",
          background: busy || selectedCount === 0 ? "#c7d2fe" : "#4f46e5",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: 600,
          cursor: busy || selectedCount === 0 ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Caricamento…" : "Salva foto"}
      </button>
      <p style={{ fontSize: "11px", color: "#6b7280", margin: "8px 0 0", textAlign: "center" }}>
        JPG / PNG / WebP / HEIC · max 10 MB per foto
      </p>
    </div>
  );
}

export function ProgressPhotosGallery({
  snapshots,
  loading,
  partnerId,
  clientId,
  saveSnapshot,
}: {
  snapshots: PhotoSnapshot[] | undefined;
  loading: boolean;
  /** Patient's own partner_id — required to surface the upload control. */
  partnerId?: string | null;
  /** Patient's own client_id — required to surface the upload control. */
  clientId?: string | null;
  /** Persist uploaded photo URLs (portal.addSnapshot) and refresh the gallery. */
  saveSnapshot?: (urls: SnapshotPhotoUrls) => Promise<unknown>;
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

  const canUpload = Boolean(PHOTO_UPLOAD_ENABLED && partnerId && clientId && saveSnapshot);

  if (loading) {
    return <div style={{ ...cardStyle, color: "#6b7280", fontSize: "14px" }}>Caricamento foto…</div>;
  }

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px" }}>
        Foto dei progressi
      </p>

      {canUpload && (
        <ProgressPhotoUploader
          partnerId={partnerId as string}
          clientId={clientId as string}
          saveSnapshot={saveSnapshot as (urls: SnapshotPhotoUrls) => Promise<unknown>}
        />
      )}

      {withPhotos.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#6b7280", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #e2e8f0", fontSize: "13px" }}>
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
                      <div style={{ fontSize: "11px", color: "#6b7280", textAlign: "center", marginTop: "4px" }}>{p.label}</div>
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
