"use client";

/**
 * "Storico piani" (client-facing) — real version history via portal.getPlanHistory.
 *
 * PlanHistorySection fetches; PlanHistoryList is props-driven so it renders in
 * node tests via renderToStaticMarkup.
 */

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel, formatVersionDate } from "@/components/plan/version-helpers";

export interface PlanHistoryVersion {
  id: string;
  versionLabel: string;
  status: string;
  isActive: boolean;
  createdAt: string;
}

export function PlanHistoryList({
  versions,
  loading,
  error,
}: {
  versions: PlanHistoryVersion[];
  loading: boolean;
  error: boolean;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Storico piani</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento dello storico…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Errore nel caricamento dello storico piani.
          </p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun piano ancora disponibile.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {versions.map((v) => {
              const meta = statusLabel(v.status);
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{v.versionLabel}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      {v.isActive && (
                        <span className="text-xs font-medium text-green-700">
                          Piano attuale
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatVersionDate(v.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PlanHistorySection() {
  const q = trpc.portal.getPlanHistory.useQuery();
  return (
    <PlanHistoryList
      versions={q.data?.versions ?? []}
      loading={q.isLoading}
      error={q.isError}
    />
  );
}

export default PlanHistorySection;
