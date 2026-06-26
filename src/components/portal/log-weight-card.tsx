"use client";

/**
 * "Registra peso" widget — the portal's first shadcn/ui feature.
 *
 * Lets a portal (patient) client log a weight (+ optional body-fat % and note)
 * straight from the dashboard. Calls trpc.portal.addSnapshot (writes
 * client_snapshot) and invalidates the snapshot + dashboard queries so the new
 * point appears in the weight TrendChart without a full reload.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateWeightInput } from "./log-weight-form";

export function LogWeightCard() {
  // NB: trpc.useUtils() is unusable here — the backend `client` router collides
  // with the utils proxy's built-in `.client`, so we invalidate via queryClient.
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addSnapshot = trpc.portal.addSnapshot.useMutation({
    onSuccess: () => {
      toast.success("Peso registrato");
      setWeight("");
      setBodyFat("");
      setNote("");
      setError(null);
      // Refetch so the new point lands in the weight TrendChart without a reload.
      void queryClient.invalidateQueries({
        queryKey: getQueryKey(trpc.portal.getSnapshots),
      });
      void queryClient.invalidateQueries({
        queryKey: getQueryKey(trpc.portal.getDashboardData),
      });
    },
    onError: (e) => {
      toast.error(e.message || "Errore nel salvataggio. Riprova.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateWeightInput(weight, bodyFat, note);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    addSnapshot.mutate(result.payload);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registra peso</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lw-weight">
              Peso (kg) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lw-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={30}
              max={300}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="es. 78.5"
              aria-invalid={error != null}
              aria-describedby={error != null ? "lw-error" : undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lw-bodyfat">Grasso corporeo % (opzionale)</Label>
            <Input
              id="lw-bodyfat"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={3}
              max={60}
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="es. 18"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lw-note">Nota (opzionale)</Label>
            <Input
              id="lw-note"
              type="text"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. al mattino, a digiuno"
            />
          </div>

          {error != null && (
            <p id="lw-error" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={addSnapshot.isPending}>
            {addSnapshot.isPending ? "Salvataggio…" : "Registra"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default LogWeightCard;
