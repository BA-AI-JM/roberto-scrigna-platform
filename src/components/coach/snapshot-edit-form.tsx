"use client";

/**
 * #5 — Retroactive snapshot EDIT. Surfaces the built-but-unwired
 * client.editSnapshot procedure. Corrects an existing measurement (not a new
 * one): weight / height / occupational level / skinfolds. editSnapshot MERGES —
 * fields left blank keep their stored value — and re-derives body composition
 * (grasso % / massa magra / massa grassa / BMR), shown on save. Matches the
 * createSnapshot form UX; clearly an EDIT.
 */

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc/client";
import { SkinfoldsEditor, EMPTY_SKINFOLDS, skinfoldStatus, type SkinfoldsValue } from "@/components/skinfolds-editor";

export interface SnapshotEditRow {
  id: string;
  taken_at: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  daily_steps: number | null;
  body_fat_pct: number | null;
  body_fat_method: string | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  bmr_kcal: number | null;
}

const OCC_OPTIONS = [
  { v: "", l: "— invariato —" },
  { v: "sedentary", l: "Sedentario" },
  { v: "light", l: "Leggero" },
  { v: "moderate", l: "Moderato" },
  { v: "heavy", l: "Pesante" },
  { v: "very_heavy", l: "Molto pesante" },
] as const;

const field = "w-full rounded-md border-[0.5px] border-input px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const label = "mb-1 block text-sm font-medium text-ink";
const num1 = (v: number | null) => (v != null ? v.toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—");

function parseOpt(s: string): number | undefined {
  const n = parseFloat(s.replace(",", "."));
  return s.trim() !== "" && !isNaN(n) ? n : undefined;
}

export function SnapshotEditForm({ clientId, snap }: { clientId: string; snap: SnapshotEditRow }) {
  // NB: trpc.useUtils() is unusable — the backend `client` router collides with a
  // built-in on the utils proxy; invalidate via getQueryKey instead.
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState(snap.weight_kg != null ? String(snap.weight_kg) : "");
  const [height, setHeight] = useState(snap.height_cm != null ? String(snap.height_cm) : "");
  const [occ, setOcc] = useState<string>("");
  const [skin, setSkin] = useState<SkinfoldsValue>(EMPTY_SKINFOLDS);

  const edit = trpc.client.editSnapshot.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.client.listSnapshots) });
      void queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.client.getById) });
    },
  });

  const sk = skinfoldStatus(skin);
  const result = edit.data?.snapshot as Record<string, unknown> | undefined;
  const changed = edit.data?.changedFields ?? [];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields: Record<string, unknown> = {};
    const w = parseOpt(weight);
    if (w !== undefined) fields.weightKg = w;
    const h = parseOpt(height);
    if (h !== undefined) fields.heightCm = h;
    if (occ) fields.occupationalLevel = occ;
    if (sk.filledCount > 0) {
      const s: Record<string, number> = {};
      (Object.keys(skin) as (keyof SkinfoldsValue)[]).forEach((k) => {
        const v = parseOpt(skin[k]);
        if (v !== undefined) s[k] = v;
      });
      fields.skinfolds = s;
    }
    edit.mutate({ snapshotId: snap.id, fields });
  }

  // ── Saved: show the recomputed body composition ──
  if (edit.isSuccess && result) {
    const bf = result.body_fat_pct as number | null;
    const lean = result.lean_mass_kg as number | null;
    const fat = result.fat_mass_kg as number | null;
    const bmr = result.bmr_kcal as number | null;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-[0.5px] border-brand-soft bg-brand-wash p-5" role="status" aria-live="polite">
          <p className="text-sm font-medium text-brand-deep">Rilevazione aggiornata</p>
          <p className="mt-0.5 text-sm text-brand-deep">
            Composizione corporea ricalcolata{changed.length ? ` · campi modificati: ${changed.join(", ")}` : ""}.
          </p>
        </div>
        <div className="rounded-xl border-[0.5px] border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-deep">Nuova composizione</p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><p className="text-xl font-medium text-ink tnum">{num1(bf)}<span className="text-sm text-muted-foreground">%</span></p><p className="text-xs text-muted-foreground">Grasso</p></div>
            <div><p className="text-xl font-medium text-ink tnum">{num1(lean)}<span className="text-sm text-muted-foreground"> kg</span></p><p className="text-xs text-muted-foreground">Massa magra</p></div>
            <div><p className="text-xl font-medium text-ink tnum">{num1(fat)}<span className="text-sm text-muted-foreground"> kg</span></p><p className="text-xs text-muted-foreground">Massa grassa</p></div>
            <div><p className="text-xl font-medium text-ink tnum">{bmr != null ? Math.round(bmr).toLocaleString("it-IT") : "—"}<span className="text-sm text-muted-foreground"> kcal</span></p><p className="text-xs text-muted-foreground">BMR</p></div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${clientId}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white no-underline hover:bg-brand-deep">Torna al profilo</Link>
          <button type="button" onClick={() => edit.reset()} className="rounded-full border-[0.5px] border-border bg-card px-5 py-2.5 text-sm font-medium text-ink hover:bg-muted">Modifica ancora</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl border-[0.5px] border-border bg-card p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-deep">Valori attuali</p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><p className="text-sm text-ink tnum">{num1(snap.body_fat_pct)}%</p><p className="text-xs text-muted-foreground">Grasso</p></div>
          <div><p className="text-sm text-ink tnum">{num1(snap.lean_mass_kg)} kg</p><p className="text-xs text-muted-foreground">Massa magra</p></div>
          <div><p className="text-sm text-ink tnum">{num1(snap.fat_mass_kg)} kg</p><p className="text-xs text-muted-foreground">Massa grassa</p></div>
          <div><p className="text-sm text-ink tnum">{snap.bmr_kcal != null ? Math.round(snap.bmr_kcal).toLocaleString("it-IT") : "—"} kcal</p><p className="text-xs text-muted-foreground">BMR</p></div>
        </div>
      </div>

      <div className="rounded-xl border-[0.5px] border-border bg-card p-5 sm:p-6">
        <p className="text-base font-medium text-ink">Correggi i valori</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Peso e altezza sono precompilati. Lascia vuote le pliche per mantenerle invariate. La composizione corporea
          viene ricalcolata al salvataggio.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="w">Peso (kg)</label>
            <input id="w" inputMode="decimal" className={field} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="es. 61,8" />
          </div>
          <div>
            <label className={label} htmlFor="h">Altezza (cm)</label>
            <input id="h" inputMode="decimal" className={field} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="es. 168" />
          </div>
          <div>
            <label className={label} htmlFor="occ">Livello occupazionale</label>
            <select id="occ" className={field} value={occ} onChange={(e) => setOcc(e.target.value)}>
              {OCC_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5">
          <p className={label}>Pliche (mm)</p>
          <SkinfoldsEditor value={skin} onChange={setSkin} hint={`Lascia vuoto per mantenere le pliche attuali. Compila per sostituirle — ${sk.methodLabel.toLowerCase()}.`} />
        </div>
      </div>

      {edit.isError && (
        <p role="alert" className="text-sm text-[#9f3a2f]">{edit.error?.message ?? "Errore nel salvataggio. Riprova."}</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={edit.isPending} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-deep disabled:opacity-50">
          {edit.isPending ? "Salvataggio…" : "Salva e ricalcola"}
        </button>
        <Link href={`/clients/${clientId}`} className="rounded-full border-[0.5px] border-border bg-card px-5 py-2.5 text-sm font-medium text-ink no-underline hover:bg-muted">Annulla</Link>
      </div>
    </form>
  );
}
