"use client";

/**
 * #27 Stage 2 — "Progressi" tab: body composition + measurement trends (from
 * portal.getSnapshots), the patient's progress PHOTOS (display, from the same
 * query — PR #33), and the patient's documents (portal.getDocuments).
 *
 * Photo UPLOAD is still gated behind storage-RLS migration 007 (clients can't
 * write the client-photos bucket yet) — see PHOTO_UPLOAD_ENABLED in the gallery.
 */

import { trpc } from "@/lib/trpc/client";
import { MeasurementsView, type MeasurementSnapshot } from "@/components/portal/measurements-view";
import { DocumentsList, type PortalDocument } from "@/components/portal/documents-list";
import { ProgressPhotosGallery, type PhotoSnapshot } from "@/components/portal/progress-photos-gallery";

export default function PortalProgressPage() {
  const snapshotsQuery = trpc.portal.getSnapshots.useQuery({});
  const documentsQuery = trpc.portal.getDocuments.useQuery();

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 16px" }}>Progressi</h1>

      <MeasurementsView
        snapshots={snapshotsQuery.data as MeasurementSnapshot[] | undefined}
        loading={snapshotsQuery.isLoading}
      />

      {/* Progress photos — DISPLAY from getSnapshots (PR #33). Upload stays gated
          behind storage-RLS migration 007 (see PHOTO_UPLOAD_ENABLED). */}
      <ProgressPhotosGallery
        snapshots={snapshotsQuery.data as PhotoSnapshot[] | undefined}
        loading={snapshotsQuery.isLoading}
      />

      <DocumentsList
        documents={documentsQuery.data?.documents as PortalDocument[] | undefined}
        loading={documentsQuery.isLoading}
      />
    </div>
  );
}
