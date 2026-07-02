"use client";

/**
 * #27 Stage 2 — presentational list of a day's food-diary entries + the day
 * total. The page owns the getDiaryEntries query and add mutation.
 */

import { type DiaryEntry, mealSlotLabel, sumDayTotals } from "./diary-helpers";

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "12px",
};

export function DiaryEntryList({ entries, loading }: { entries: DiaryEntry[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ ...cardStyle, color: "#6b7280", fontSize: "14px" }}>Caricamento diario…</div>
    );
  }

  const total = sumDayTotals(entries);

  if (!entries || entries.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>📓</div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Nessun pasto registrato</p>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Aggiungi il tuo primo pasto qui sotto.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Day total */}
      <div style={{ ...cardStyle, background: "#1a1a2e", color: "#ffffff", display: "flex", flexWrap: "wrap" }}>
        {[
          { label: "Kcal", value: `${total.kcal}` },
          { label: "Proteine", value: `${total.protein}g` },
          { label: "Carboidrati", value: `${total.carbs}g` },
          { label: "Grassi", value: `${total.fat}g` },
        ].map((c) => (
          <div key={c.label} style={{ flex: "1 1 80px", minWidth: "70px", textAlign: "center", padding: "4px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: "11px", opacity: 0.6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Entries */}
      {entries.map((e) => (
        <div key={e.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{mealSlotLabel(e.meal_slot)}</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>{Math.round(e.total_kcal ?? 0)} kcal</span>
          </div>
          {(e.food_items ?? []).map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < (e.food_items?.length ?? 0) - 1 ? "1px solid #f1f5f9" : "none" }}>
              <span style={{ fontSize: "13px", color: "#374151" }}>{f.name}</span>
              <span style={{ fontSize: "13px", color: "#1a1a2e", fontWeight: 600, whiteSpace: "nowrap" }}>{f.grams} g · {Math.round(f.kcal)} kcal</span>
            </div>
          ))}
          {e.notes && <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>{e.notes}</div>}
        </div>
      ))}
    </div>
  );
}
