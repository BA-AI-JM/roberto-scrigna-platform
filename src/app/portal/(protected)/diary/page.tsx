"use client";

/**
 * #27 Stage 2 — "Diario" tab: native food diary (manual entry). Lists the day's
 * entries via portal.getDiaryEntries and adds via portal.addDiaryEntry. No 3rd-
 * party food-DB sync (per scope) — the patient enters the macros. Mobile-first.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DiaryEntryList } from "@/components/portal/diary-entry-list";
import {
  MEAL_SLOT_LABELS,
  todayISO,
  shiftDateISO,
  formatDayLabel,
  type DiaryEntry,
} from "@/components/portal/diary-helpers";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  color: "#111827",
  background: "#ffffff",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" };

const EMPTY_ITEM = { name: "", grams: "", kcal: "", protein: "", carbs: "", fat: "" };

export default function PortalDiaryPage() {
  const [date, setDate] = useState<string>(todayISO());
  const [mealSlot, setMealSlot] = useState<string>("");
  const [item, setItem] = useState({ ...EMPTY_ITEM });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const diaryQuery = trpc.portal.getDiaryEntries.useQuery({ date });
  const addMutation = trpc.portal.addDiaryEntry.useMutation({
    onSuccess: () => {
      setItem({ ...EMPTY_ITEM });
      setNotes("");
      setError(null);
      diaryQuery.refetch();
    },
    onError: (e) => setError(e.message),
  });

  const num = (v: string) => Number(v);
  const canSubmit =
    item.name.trim() !== "" &&
    Number.isFinite(num(item.grams)) &&
    num(item.grams) > 0 &&
    Number.isFinite(num(item.kcal)) &&
    num(item.kcal) >= 0 &&
    !addMutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    addMutation.mutate({
      entryDate: date,
      mealSlot: mealSlot || undefined,
      foodItems: [
        {
          name: item.name.trim(),
          grams: num(item.grams),
          kcal: num(item.kcal),
          protein: Number.isFinite(num(item.protein)) ? num(item.protein) : 0,
          carbs: Number.isFinite(num(item.carbs)) ? num(item.carbs) : 0,
          fat: Number.isFinite(num(item.fat)) ? num(item.fat) : 0,
        },
      ],
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="portal-container">
      <header className="mb-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Alimentazione</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink">Diario alimentare</h1>
      </header>

      {/* Date navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "8px 12px" }}>
        <button type="button" onClick={() => setDate((d) => shiftDateISO(d, -1))} aria-label="Giorno precedente" style={{ border: "none", background: "#f8fafc", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "16px" }}>←</button>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e", textTransform: "capitalize" }}>{formatDayLabel(date)}</span>
        <button type="button" onClick={() => setDate((d) => shiftDateISO(d, 1))} disabled={date >= todayISO()} aria-label="Giorno successivo" style={{ border: "none", background: "#f8fafc", borderRadius: "8px", padding: "8px 14px", cursor: date >= todayISO() ? "not-allowed" : "pointer", fontSize: "16px", opacity: date >= todayISO() ? 0.4 : 1 }}>→</button>
      </div>

      <DiaryEntryList entries={diaryQuery.data as DiaryEntry[] | undefined} loading={diaryQuery.isLoading} />

      {/* Add form */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "16px", marginTop: "12px" }}>
        <p style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>Aggiungi un pasto</p>

        <div style={{ marginBottom: "10px" }}>
          <label style={labelStyle}>Pasto</label>
          <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value)} style={inputStyle}>
            <option value="">— seleziona —</option>
            {Object.entries(MEAL_SLOT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={labelStyle}>Alimento</label>
          <input value={item.name} onChange={(e) => setItem((s) => ({ ...s, name: e.target.value }))} placeholder="es. Petto di pollo" style={inputStyle} />
        </div>

        <div className="mb-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {([
            { k: "grams", label: "Grammi" },
            { k: "kcal", label: "Kcal" },
            { k: "protein", label: "P (g)" },
            { k: "carbs", label: "C (g)" },
            { k: "fat", label: "G (g)" },
          ] as const).map(({ k, label }) => (
            <div key={k}>
              <label style={labelStyle}>{label}</label>
              <input type="number" min={0} value={item[k]} onChange={(e) => setItem((s) => ({ ...s, [k]: e.target.value }))} className="tnum" style={inputStyle} />
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Note (facoltativo)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
        </div>

        {error && <p style={{ fontSize: "13px", color: "#dc2626", margin: "0 0 10px" }}>{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "12px",
            background: canSubmit ? "#1a1a2e" : "#6b7280",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {addMutation.isPending ? "Aggiunta…" : "Aggiungi al diario"}
        </button>
      </div>
    </div>
  );
}
