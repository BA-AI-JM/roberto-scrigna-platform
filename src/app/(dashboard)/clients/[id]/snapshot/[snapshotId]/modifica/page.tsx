"use client";

/**
 * #5 — Retroactive snapshot edit route. Reached from the "Modifica" action on
 * each row of the snapshot-history table. Pre-fills from listSnapshots and calls
 * client.editSnapshot. Isolated route — does not restructure the client profile.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SnapshotEditForm, type SnapshotEditRow } from "@/components/coach/snapshot-edit-form";

export default function SnapshotEditPage() {
  const params = useParams();
  const clientId = params.id as string;
  const snapshotId = params.snapshotId as string;

  const { data: snapshots = [], isLoading } = trpc.client.listSnapshots.useQuery({ clientId });
  const clientQuery = trpc.client.getById.useQuery({ id: clientId });
  const clientName = clientQuery.data?.client?.full_name ?? "Cliente";
  const snap = (snapshots as SnapshotEditRow[]).find((s) => s.id === snapshotId) ?? null;

  const measuredOn = snap?.taken_at ? new Date(snap.taken_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : null;

  return (
    <div className="coach-container">
      <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground">
        ← Torna al profilo
      </Link>
      <header className="mb-6 mt-5 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Modifica rilevazione</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">{clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {measuredOn ? `Correzione della rilevazione del ${measuredOn}.` : "Correzione di una rilevazione esistente."}
        </p>
      </header>
      <div className="max-w-3xl">
        {isLoading ? (
          <div className="rounded-xl border-[0.5px] border-border bg-card p-6">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : snap ? (
          <SnapshotEditForm clientId={clientId} snap={snap} />
        ) : (
          <div className="rounded-xl border-[0.5px] border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Rilevazione non trovata.</p>
          </div>
        )}
      </div>
    </div>
  );
}
