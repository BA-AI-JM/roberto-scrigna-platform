"use client";

/**
 * "Versioni" tab — coach-facing plan version chain + regenerate action.
 *
 * Presentational/props-driven (no tRPC hooks) so it renders in node tests via
 * renderToStaticMarkup. The review page wires listVersions / createVersion.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { statusLabel, formatVersionDate, type PlanVersion } from "./version-helpers";

export interface VersionsTabProps {
  versions: PlanVersion[];
  loading: boolean;
  currentPlanId: string;
  isRegenerating: boolean;
  regenerateError: string | null;
  onRegenerate: (reason: string) => void;
  onOpenVersion: (id: string) => void;
}

export function VersionsTab({
  versions,
  loading,
  currentPlanId,
  isRegenerating,
  regenerateError,
  onRegenerate,
  onOpenVersion,
}: VersionsTabProps) {
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {/* Regenerate action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rigenera come nuova versione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cv-reason" className="text-sm font-medium">
                Motivo della modifica (opzionale)
              </label>
              <Input
                id="cv-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="es. più proteine dopo il check-in"
                maxLength={2000}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Rigenera il piano sull&apos;ultima misurazione del cliente e archivia la
              versione corrente.
            </p>
            {regenerateError && (
              <p className="text-sm text-destructive">{regenerateError}</p>
            )}
            <Button
              onClick={() => onRegenerate(reason)}
              disabled={isRegenerating}
              className="w-full sm:w-auto"
            >
              {isRegenerating ? "Rigenerazione…" : "Rigenera come nuova versione"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version chain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versioni del piano</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Caricamento versioni…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna versione disponibile.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {versions.map((v) => {
                const meta = statusLabel(v.status);
                const isCurrent = v.id === currentPlanId;
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
                        {isCurrent && (
                          <span className="text-xs text-muted-foreground">In visione</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatVersionDate(v.createdAt)}
                        {v.changeReason ? ` · ${v.changeReason}` : ""}
                      </span>
                    </div>
                    {!isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenVersion(v.id)}
                      >
                        Apri
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VersionsTab;
