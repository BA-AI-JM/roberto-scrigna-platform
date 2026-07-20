"use client";

/**
 * #27 Stage 2 — "Progressi" tab: body composition + measurement trends (from
 * portal.getSnapshots), the patient's progress PHOTOS (display + upload, from
 * the same query — PR #33), and the patient's documents (portal.getDocuments).
 *
 * Photo UPLOAD is now enabled (storage-RLS migration 007 applied): the patient
 * uploads front/side/back photos to their own client-photos/<pid>/<cid>/ folder
 * and they are persisted via portal.addSnapshot — see PHOTO_UPLOAD_ENABLED.
 */

import { trpc } from "@/lib/trpc/client";
import { MeasurementsView, type MeasurementSnapshot } from "@/components/portal/measurements-view";
import { DocumentsList, type PortalDocument } from "@/components/portal/documents-list";
import {
  ProgressPhotosGallery,
  type PhotoSnapshot,
  type SnapshotPhotoUrls,
} from "@/components/portal/progress-photos-gallery";

export default function PortalProgressPage() {
  const snapshotsQuery = trpc.portal.getSnapshots.useQuery({});
  // Same source as the dashboard's weight chart: completed check-in weights.
  const dashboardQuery = trpc.portal.getDashboardData.useQuery();
  const documentsQuery = trpc.portal.getDocuments.useQuery();
  const profileQuery = trpc.portal.getMyProfile.useQuery();
  const addSnapshot = trpc.portal.addSnapshot.useMutation();

  // The patient's own identifiers, used to scope photo uploads to their folder.
  const profile = profileQuery.data as { id?: string; partner?: { id?: string } | { id?: string }[] | null } | undefined;
  const clientId = profile?.id ?? null;
  const partnerRaw = profile?.partner;
  const partnerId = Array.isArray(partnerRaw) ? partnerRaw[0]?.id ?? null : partnerRaw?.id ?? null;

  const saveSnapshot = async (urls: SnapshotPhotoUrls) => {
    await addSnapshot.mutateAsync(urls);
    await snapshotsQuery.refetch();
  };

  return (
    <div className="portal-container">
      <header className="mb-6 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">I tuoi risultati</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">Progressi</h1>
        <p className="mt-1 text-sm text-muted-foreground">Composizione corporea, foto e documenti nel tempo.</p>
      </header>

      <MeasurementsView
        snapshots={snapshotsQuery.data as MeasurementSnapshot[] | undefined}
        loading={snapshotsQuery.isLoading}
        checkinWeightPoints={((dashboardQuery.data?.weightTrend ?? []) as Array<{ check_in_date: string | null; weight_kg: number | null }>)
          .filter((e) => e.weight_kg != null && e.check_in_date != null)
          .map((e) => ({ date: e.check_in_date as string, value: e.weight_kg as number }))}
      />

      {/* Progress photos — DISPLAY from getSnapshots (PR #33) + UPLOAD to the
          patient's own client-photos/<pid>/<cid>/ folder (migration 007). */}
      <ProgressPhotosGallery
        snapshots={snapshotsQuery.data as PhotoSnapshot[] | undefined}
        loading={snapshotsQuery.isLoading}
        partnerId={partnerId}
        clientId={clientId}
        saveSnapshot={saveSnapshot}
      />

      <DocumentsList
        documents={documentsQuery.data?.documents as PortalDocument[] | undefined}
        loading={documentsQuery.isLoading}
      />
    </div>
  );
}
