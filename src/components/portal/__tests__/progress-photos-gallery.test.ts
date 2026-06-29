/**
 * #27 — patient progress-photo gallery (display half). Covers the pure
 * selectors, the SSR-rendered gallery (images by date), the empty state, and the
 * gated upload affordance (PHOTO_UPLOAD_ENABLED stays false until migration 007).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  ProgressPhotosGallery,
  PHOTO_UPLOAD_ENABLED,
  hasAnyPhoto,
  snapshotsWithPhotos,
  isAbsoluteUrl,
  collectStoragePaths,
  type PhotoSnapshot,
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
  test("PHOTO_UPLOAD_ENABLED is false until migration 007 (the one-line flip)", () => {
    expect(PHOTO_UPLOAD_ENABLED).toBe(false);
  });
});

describe("gallery render (#27 photos)", () => {
  test("renders the photos (front/side) with the gated note; no upload control", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, { snapshots: [withPhotos], loading: false })
    );
    expect(html).toContain("Foto dei progressi");
    expect(html).toContain('src="https://cdn.example.com/front.jpg"');
    expect(html).toContain('src="https://cdn.example.com/side.jpg"');
    expect(html).toContain("Fronte");
    expect(html).toContain("Lato");
    expect(html).not.toContain("back.jpg"); // null pose not rendered
    expect(html).toContain("Caricamento foto disponibile a breve"); // gated, not wired
    expect(html).not.toContain("type=\"file\""); // no upload input while gated
  });

  test("empty state when no snapshot has photos (gate still shown)", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, { snapshots: [noPhotos], loading: false })
    );
    expect(html).toContain("Nessuna foto");
    expect(html).not.toContain("<img");
    expect(html).toContain("Caricamento foto disponibile a breve");
  });

  test("loading state", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressPhotosGallery, { snapshots: undefined, loading: true })
    );
    expect(html).toContain("Caricamento foto…");
  });
});
