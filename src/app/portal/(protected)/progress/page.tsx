"use client";

/**
 * #27 Stage 2 — "Progressi" tab: body composition + measurement trends (from
 * portal.getSnapshots) and the patient's documents (portal.getDocuments).
 *
 * Progress PHOTOS: deferred. getSnapshots doesn't yet return photo_*_url (needs a
 * 1-line select widening) for DISPLAY, and client photo UPLOAD needs the
 * storage-RLS migration — so photos show an "in arrivo" note for now. Measurements
 * + documents are the shipped value.
 */

import { trpc } from "@/lib/trpc/client";
import { MeasurementsView, type MeasurementSnapshot } from "@/components/portal/measurements-view";
import { DocumentsList, type PortalDocument } from "@/components/portal/documents-list";

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

      {/* Progress photos — display needs getSnapshots to expose photo_*_url; upload
          needs the storage-RLS migration. Placeholder until both land. */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "20px",
          marginBottom: "16px",
        }}
      >
        <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px" }}>Foto dei progressi</p>
        <div style={{ padding: "24px", textAlign: "center", color: "#9ca3af", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #e2e8f0", fontSize: "13px" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>📸</div>
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>In arrivo</div>
          Presto potrai caricare e confrontare le foto dei tuoi progressi.
        </div>
      </div>

      <DocumentsList
        documents={documentsQuery.data?.documents as PortalDocument[] | undefined}
        loading={documentsQuery.isLoading}
      />
    </div>
  );
}
