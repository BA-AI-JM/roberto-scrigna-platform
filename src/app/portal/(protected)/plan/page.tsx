"use client";

/**
 * #27 Stage 1 — "Piano" tab: the patient's full active plan (meals, supplements,
 * coach notes — no coach math). Reuses ActivePlanView over the existing
 * getActivePlan query. Mobile-first single column.
 */

import { trpc } from "@/lib/trpc/client";
import { ActivePlanView, type ActivePlan } from "@/components/portal/active-plan-view";

export default function PortalPlanPage() {
  const planQuery = trpc.portal.getActivePlan.useQuery();

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 16px" }}>
        Il mio piano
      </h1>
      <ActivePlanView
        plan={planQuery.data as ActivePlan | null | undefined}
        loading={planQuery.isLoading}
      />
    </div>
  );
}
