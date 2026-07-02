"use client";

/**
 * #2 Stage-2 — energy-breakdown panel for the consolidated dashboard. Shows the
 * coach the energy composition (BMR / NEAT / TEF / EAT / total TDEE) per distinct
 * day-type WITHOUT generating a plan, from trpc.client.estimateTdee({ clientId }).
 *
 * Presentational: the page owns the query + flags. estimateTdee throws
 * PRECONDITION_FAILED when the client has no snapshot yet, so the page passes
 * `isError` and this renders a clean empty state. Inline-styled to match the
 * surrounding dashboard cards.
 */

export interface TdeeDay {
  dayType: string;
  bmr: number;
  neat: { stepsKcal: number; occupationalKcal: number; totalNeatKcal: number };
  tef: number;
  exercise: { exerciseKcal: number; methodUsed: string };
  totalTdeeKcal: number;
}

export interface EnergyEstimate {
  weekSchedule: string[];
  byDayType: TdeeDay[];
}

const DAY_TYPE_LABELS: Record<string, string> = {
  training: "Allenamento",
  rest: "Riposo",
  refeed: "Refeed",
  deload: "Deload",
  training_light: "All. Leggero",
  training_medium: "All. Medio",
  training_intense: "All. Intenso",
  training_double: "Doppia Seduta",
};

const SHELL: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  overflow: "hidden",
};

function Header() {
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
        Energia (BMR / NEAT / EAT)
      </h3>
    </div>
  );
}

function cell(label: string, value: string, strong = false) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#6b7280", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: strong ? "15px" : "13px", fontWeight: strong ? 700 : 600, color: strong ? "#1a1a2e" : "#3f3f46" }}>
        {value}
      </div>
    </div>
  );
}

export function EnergyPanel({
  data,
  isLoading,
  isError,
}: {
  data: EnergyEstimate | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div style={SHELL}>
      <Header />
      {isLoading ? (
        <div style={{ padding: "20px 24px", color: "#6b7280", fontSize: "14px" }}>
          Calcolo del dispendio energetico…
        </div>
      ) : isError || !data || data.byDayType.length === 0 ? (
        <div style={{ margin: "20px 24px", padding: "20px 24px", textAlign: "center", color: "#6b7280", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #e2e8f0", fontSize: "13px" }}>
          Dispendio non disponibile — completa il modulo di intake (serve una misurazione) per stimarlo.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px 24px" }}>
          {data.byDayType.map((d) => (
            <div
              key={d.dayType}
              style={{
                border: "1px solid #f1f5f9",
                borderRadius: "8px",
                padding: "14px 16px",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a2e", marginBottom: "10px" }}>
                {DAY_TYPE_LABELS[d.dayType] ?? d.dayType}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                  gap: "10px",
                }}
              >
                {cell("BMR", `${d.bmr} kcal`)}
                {cell("NEAT", `${d.neat.totalNeatKcal} kcal`)}
                {cell("TEF", `${d.tef} kcal`)}
                {cell("EAT", `${d.exercise.exerciseKcal} kcal`)}
                {cell("TDEE", `${d.totalTdeeKcal} kcal`, true)}
              </div>
              <div style={{ fontSize: "10px", color: "#a1a1aa", marginTop: "8px" }}>
                NEAT = passi {d.neat.stepsKcal} + lavoro {d.neat.occupationalKcal} kcal
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
