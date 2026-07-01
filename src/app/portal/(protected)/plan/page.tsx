"use client";

/**
 * #27 Stage 1 — "Piano" tab: the patient's full active plan (meals, supplements,
 * coach notes — no coach math). Reuses ActivePlanView over the existing
 * getActivePlan query. Responsive: a warm reading column on mobile that widens
 * gracefully on desktop (portal-container); branded header.
 */

import { trpc } from "@/lib/trpc/client";
import { ActivePlanView, type ActivePlan } from "@/components/portal/active-plan-view";

export default function PortalPlanPage() {
  const planQuery = trpc.portal.getActivePlan.useQuery();

  return (
    <div className="portal-container">
      <header className="mb-6 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Il tuo percorso</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">Il mio piano</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pasti, integratori e note del tuo nutrizionista.</p>
      </header>
      <ActivePlanView
        plan={planQuery.data as ActivePlan | null | undefined}
        loading={planQuery.isLoading}
      />
    </div>
  );
}
