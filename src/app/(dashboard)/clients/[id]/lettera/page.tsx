"use client";

/**
 * Coach engagement-letter surface (#29) — per-client "Lettera di incarico".
 * A dedicated route (keeps the client-profile IA untouched) that hosts the
 * generate → preview → send-for-signing → status/download flow. Brand system,
 * responsive.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { EngagementLetterPanel } from "@/components/legal/engagement-letter-panel";

export default function ClientLetterPage() {
  const params = useParams();
  const clientId = params.id as string;
  const clientQuery = trpc.client.getById.useQuery({ id: clientId });
  const clientName = clientQuery.data?.client?.full_name ?? "Cliente";

  return (
    <div className="coach-container">
      <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground">
        ← Torna al profilo
      </Link>
      <header className="mb-6 mt-5 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Lettera di incarico</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">{clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Genera l&apos;anteprima, invia al cliente per la firma e scarica il documento firmato.</p>
      </header>
      <div className="max-w-3xl">
        <EngagementLetterPanel clientId={clientId} clientName={clientName} />
      </div>
    </div>
  );
}
