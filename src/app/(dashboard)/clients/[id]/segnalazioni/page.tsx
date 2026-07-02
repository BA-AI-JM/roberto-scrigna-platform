"use client";

/**
 * #28 — Coach urgent-feedback / injury management route. Reached from the
 * "Segnalazioni" action on the client profile header. Isolated route — does not
 * restructure the profile.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { UrgentFeedbackManager } from "@/components/coach/urgent-feedback-manager";

export default function ClientSegnalazioniPage() {
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
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Segnalazioni</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">{clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Feedback urgenti e segnalazioni di infortunio inviati dal cliente.</p>
      </header>
      <div className="max-w-3xl">
        <UrgentFeedbackManager clientId={clientId} />
      </div>
    </div>
  );
}
