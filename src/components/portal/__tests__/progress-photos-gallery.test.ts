/**
 * #27 — patient progress-photo gallery (display + UPLOAD). Covers the pure
 * selectors, the upload-path orchestrator (upload → addSnapshot, with error
 * handling), the SSR-rendered gallery (display images, the upload control when
 * enabled, display-only when not), the empty state, and the loading state.
 *
 * Migration 007 is applied → PHOTO_UPLOAD_ENABLED is true and the upload control
 * is wired.
 */

import { describe, test, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  ProgressPhotosGallery,
  PHOTO_UPLOAD_ENABLED,
  hasAnyPhoto,
  snapshotsWithPhotos,
  isAbsoluteUrl,
  collectStoragePaths,
  safePhotoFilename,
  buildPhotoPath,
  uploadProgressPhotos,
  type PhotoSnapshot,
  type PoseSelection,
  type SnapshotPhotoUrls,
} from "../progress-photos-gallery";

const withPhotos: PhotoSnapshot = {
  id: "s1",
  taken_at: "2026-06-01T00:00:00Z",
  photo_front_url: "https://cdn.example.com/front.jpg",
  photo_side_url: "https://cdn.example.com/side.jpg",
  photo_back_url: null,
};
const noPhotos: PhotoSnapshot = {
  id: "s2",
  taken_at: "2026-05-01T00:00:00Z",
  photo_front_url: null,
  photo_side_url: null,
  photo_back_url: null,
};

const file = (name: string, size = 1000, type = "image/jpeg") => ({ name, size, type });

describe("pure selectors (#27 photos)", () => {
  test("hasAnyPhoto / snapshotsWithPhotos", () => {
    expect(hasAnyPhoto(withPhotos)).toBe(true);
    expect(hasAnyPhoto(noPhotos)).toBe(false);
    expect(snapshotsWithPhotos([withPhotos, noPhotos]).map((s) => s.id)).toEqual(["s1"]);
    expect(snapshotsWithPhotos(undefined)).toEqual([]);
  });

  test("isAbsoluteUrl distinguishes URLs from storage paths", () => {
    expect(isAbsoluteUrl("https://x/y.jpg")).toBe(true);
    expect(isAbsoluteUrl("http://x/y.jpg")).toBe(true);
    expect(isAbsoluteUrl("client-photos/p/c/front.jpg")).toBe(false);
  });

  test("collectStoragePaths returns only non-URL (path) values, deduped", () => {
    const snap: PhotoSnapshot = {
      id: "s3", taken_at: null,
      photo_front_url: "client-photos/p/c/f.jpg",
      photo_side_url: "https://cdn/x.jpg", // URL → not a path
      photo_back_url: "client-photos/p/c/b.jpg",
    };
    expect(collectStoragePaths([snap, withPhotos])).toEqual([
      "client-photos/p/c/f.jpg",
      "client-photos/p/c/b.jpg",
    ]);
  });
});

describe("upload gate (#27 photos)", () => {
  test("PHOTO_UPLOAD_ENABLED is true (migration 007 applied)", () => {
    expect(PHOTO_UPLOAD_ENABLED).toBe(true);
  });
});

describe("path helpers (#27 photos upload)", () => {
  test("safePhotoFilename strips unsafe chars and bounds length", () => {
    expect(safePhotoFilename("my photo!.jpg")).toBe("my_photo_.jpg");
    expect(safePhotoFilename("")).toBe("foto.jpg");
    expect(safePhotoFilename("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  test("buildPhotoPath scopes to client-photos/<pid>/<cid>/ with the safe name", () => {
    const p = buildPhotoPath("PID", "CID", "front pic.png", "uuid-1");
    expect(p).toBe("client-photos/PID/CID/uuid-1-front_pic.png");
  });
});

describe("uploadProgressPhotos orchestrator (#27 photos upload)", () => {
  test("uploads each selected pose then persists the paths via saveSnapshot", async () => {
    const upload = vi.fn(async (_path: string, _file: unknown) => ({ error: null }));
    const saveSnapshot = vi.fn(async (_urls: SnapshotPhotoUrls) => ({ id: "snap-1" }));
    const frontFile = file("front.jpg");
    const sideFile = file("side.jpg");
    const selections: PoseSelection[] = [
      { key: "photo_front_url", file: frontFile },
      { key: "photo_side_url", file: sideFile },
    ];
    let n = 0;
    const res = await uploadProgressPhotos(selections, {
      partnerId: "PID",
      clientId: "CID",
      upload,
      saveSnapshot,
      makeId: () => `id${++n}`,
    });

    expect(res).toEqual({ ok: true });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenNthCalledWith(1, "client-photos/PID/CID/id1-front.jpg", frontFile);
    expect(upload).toHaveBeenNthCalledWith(2, "client-photos/PID/CID/id2-side.jpg", sideFile);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    const urls = saveSnapshot.mock.calls[0]?.[0];
    expect(urls).toEqual({
      photoFrontUrl: "client-photos/PID/CID/id1-front.jpg",
      photoSideUrl: "client-photos/PID/CID/id2-side.jpg",
    });
  });

  test("no selection → does not upload or save", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const saveSnapshot = vi.fn(async () => ({}));
    const res = await uploadProgressPhotos([], { partnerId: "P", clientId: "C", upload, saveSnapshot });
    expect(res.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  test("missing profile ids → blocked before upload", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const saveSnapshot = vi.fn(async () => ({}));
    const res = await uploadProgressPhotos(
      [{ key: "photo_front_url", file: file("f.jpg") }],
      { partnerId: "", clientId: "C", upload, saveSnapshot }
    );
    expect(res.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  test("oversize file → rejected before upload, no save", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const saveSnapshot = vi.fn(async () => ({}));
    const res = await uploadProgressPhotos(
      [{ key: "photo_front_url", file: file("big.jpg", 11 * 1024 * 1024) }],
      { partnerId: "P", clientId: "C", upload, saveSnapshot }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain("10 MB");
    expect(upload).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  test("upload failure → surfaces the error, snapshot NOT saved", async () => {
    const upload = vi.fn(async () => ({ error: { message: "storage 403" } }));
    const saveSnapshot = vi.fn(async () => ({}));
    const res = await uploadProgressPhotos(
      [{ key: "photo_front_url", file: file("f.jpg") }],
      { partnerId: "P", clientId: "C", upload, saveSnapshot, makeId: () => "id" }
    );
    expect(res).toEqual({ ok: false, error: "storage 403" });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  test("saveSnapshot failure → surfaces the error (no crash)", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const saveSnapshot = vi.fn(async () => {
      throw new Error("db down");
    });
    const res = await uploadProgressPhotos(
      [{ key: "photo_back_url", file: file("b.jpg") }],
      { partnerId: "P", clientId: "C", upload, saveSnapshot, makeId: () => "id" }
    );
    expect(res).toEqual({ ok: false, error: "db down" });
  });
});

describe("gallery render (#27 photos)", () => {
  test("display + upload control when enabled and ids/saveSnapshot supplied", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, {
        snapshots: [withPhotos],
        loading: false,
        partnerId: "PID",
        clientId: "CID",
        saveSnapshot: async () => ({}),
      })
    );
    expect(html).toContain("Foto dei progressi");
    expect(html).toContain('src="https://cdn.example.com/front.jpg"');
    expect(html).toContain('src="https://cdn.example.com/side.jpg"');
    expect(html).toContain("Fronte");
    expect(html).toContain("Lato");
    expect(html).not.toContain("back.jpg"); // null pose not rendered
    // Upload control is wired (no longer the "coming soon" pill).
    expect(html).toContain("Aggiungi nuove foto");
    expect(html).toContain("Salva foto");
    expect(html).toContain('type="file"');
    expect(html).not.toContain("Caricamento foto disponibile a breve");
  });

  test("display-only (no ids) → no upload control", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, { snapshots: [withPhotos], loading: false })
    );
    expect(html).toContain('src="https://cdn.example.com/front.jpg"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Aggiungi nuove foto");
  });

  test("empty state when no snapshot has photos (upload control still available)", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, {
        snapshots: [noPhotos],
        loading: false,
        partnerId: "PID",
        clientId: "CID",
        saveSnapshot: async () => ({}),
      })
    );
    expect(html).toContain("Nessuna foto");
    expect(html).not.toContain("<img");
    expect(html).toContain("Salva foto"); // can still add the first photo
  });

  test("loading state", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, { snapshots: undefined, loading: true })
    );
    expect(html).toContain("Caricamento foto…");
  });
});
