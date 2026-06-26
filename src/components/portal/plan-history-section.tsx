"use client";

/**
 * "Storico piani" (client-facing) — STUB.
 *
 * ⚠️ BACKEND FOLLOW-UP NEEDED: plan.listVersions is coach-only
 * (protectedProcedure); there is NO portal-scoped plan-history query yet. This
 * section renders the current active plan as the "Attivo" entry and notes that
 * full version history is coming. A `portal.getPlanHistory` clientProcedure
 * wrapper (partner-RLS-safe, scoped to ctx.clientId) is required to list prior
 * versions to the patient — NOT built here (UI lane only).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PlanHistorySectionProps {
  activePlanName: string | null | undefined;
  activePlanDate: string | null | undefined;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export function PlanHistorySection({ activePlanName, activePlanDate }: PlanHistorySectionProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Storico piani</CardTitle>
      </CardHeader>
      <CardContent>
        {activePlanName ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{activePlanName}</span>
              <span className="text-xs text-muted-foreground">
                Inizio: {formatDate(activePlanDate)}
              </span>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: "#dcfce7", color: "#15803d" }}
            >
              Attivo
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun piano attivo.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Lo storico delle versioni precedenti sarà disponibile a breve.
        </p>
      </CardContent>
    </Card>
  );
}

export default PlanHistorySection;
