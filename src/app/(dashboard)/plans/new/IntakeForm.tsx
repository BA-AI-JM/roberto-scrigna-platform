"use client";

/**
 * Client Intake Form — 7-page multi-step form.
 *
 * Collects patient data across:
 *   1. Paziente (Demographics)
 *   2. Circonferenze (Circumferences)
 *   3. Pliche (Skinfolds)
 *   4. Anamnesi Medica (Medical History)
 *   5. Allenamento (Training Schedule)
 *   6. Stile di Vita (Lifestyle)
 *   7. Obiettivo (Goal)
 *
 * On submit, calls client.create then client.createSnapshot via tRPC,
 * then redirects to /plans.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { groupedSportOptions } from "@/engine/sport-taxonomy";

// ── Types ────────────────────────────────────────────────────────────────────

interface TrainingSession {
  modality: string;
  duration_min: number;
  rpe: number;
}

// Indexed 0=Mon … 6=Sun
type WeekSessions = Record<number, TrainingSession[]>;

interface FormData {
  // Page 1 – Paziente
  full_name: string;
  date_of_birth: string;
  height_cm: string;
  weight_kg: string;
  sex: "male" | "female" | "";
  email: string;
  phone: string;
  codice_fiscale: string;

  // Page 2 – Circonferenze (all optional numbers stored as strings)
  circ_chest: string;
  circ_waist: string;
  circ_abdomen: string;
  circ_hips: string;
  circ_arm_r: string;
  circ_arm_l: string;
  circ_thigh_r: string;
  circ_thigh_l: string;

  // Page 3 – Pliche
  pl_triceps: string;
  pl_chest: string;
  pl_abdomen: string;
  pl_suprailiac: string;
  pl_subscapular: string;
  pl_thigh: string;
  pl_midaxillary: string;

  // Page 4 – Anamnesi Medica
  pathologies: string;
  family_history: string;
  allergies: string;
  intolerances: string;
  medications: string;
  supplements: string;
  digestion_issues: string;
  intestine_issues: string;
  sleep: string;
  nutritional_history: string;

  // Page 5 – Allenamento
  weekSessions: WeekSessions;

  // Page 6 – Stile di Vita
  daily_steps: string;
  occupation: string;
  occupational_level: "sedentary" | "light" | "moderate" | "heavy" | "very_heavy";
  hunger_timing: string;
  meal_count: string;
  preferred_training_time: string;

  // Page 7 – Obiettivo
  goal: "fat_loss" | "muscle_gain" | "maintenance" | "performance" | "";
  target_weight_kg: string;
  target_event: string;
  target_event_date: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

// Modality picker is sourced from the canonical sport taxonomy (v4.4 spec
// Appendix D) — see src/engine/sport-taxonomy.ts. Old display names like
// "Forza" / "Cardio HIIT" / "Arti marziali" are still accepted by the engine
// via the LEGACY_DISPLAY_TO_CANONICAL map for backward-compat with existing
// snapshots.
const MODALITY_GROUPS = groupedSportOptions();

const GOAL_OPTIONS: { value: FormData["goal"]; label: string }[] = [
  { value: "fat_loss", label: "Dimagrimento (Fat Loss)" },
  { value: "muscle_gain", label: "Aumento Massa Muscolare" },
  { value: "maintenance", label: "Mantenimento" },
  { value: "performance", label: "Performance Sportiva" },
];

const TOTAL_PAGES = 7;

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseNum = (s: string): number | undefined => {
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  label: "block text-sm font-medium text-zinc-700 mb-1",
  input:
    "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900",
  textarea:
    "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 resize-none",
  select:
    "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 bg-white",
  fieldNote: "mt-1 text-xs text-zinc-400",
  grid2: "grid grid-cols-1 sm:grid-cols-2 gap-4",
  grid4: "grid grid-cols-2 sm:grid-cols-4 gap-4",
  sectionTitle: "text-base font-semibold text-zinc-800 mb-4",
  divider: "border-t border-zinc-100 my-5",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldGroup({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className={s.label}>{label}</label>
      {children}
      {note && <p className={s.fieldNote}>{note}</p>}
    </div>
  );
}

// ── Page Components ───────────────────────────────────────────────────────────

function Page1({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Dati Paziente</h2>

      <FieldGroup label="Nome e Cognome *">
        <input
          id="full_name"
          name="full_name"
          type="text"
          className={s.input}
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Mario Rossi"
          autoFocus
          autoComplete="name"
        />
      </FieldGroup>

      <div className={s.grid2}>
        <FieldGroup label="Data di Nascita *">
          <input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            className={s.input}
            value={form.date_of_birth}
            onChange={(e) => set("date_of_birth", e.target.value)}
            autoComplete="bday"
          />
        </FieldGroup>

        <FieldGroup label="Altezza (cm) *">
          <input
            id="height_cm"
            name="height_cm"
            type="number"
            className={s.input}
            value={form.height_cm}
            onChange={(e) => set("height_cm", e.target.value)}
            placeholder="175"
            min={50}
            max={280}
          />
        </FieldGroup>

        <FieldGroup label="Peso attuale (kg) *">
          <input
            id="weight_kg"
            name="weight_kg"
            type="number"
            className={s.input}
            value={form.weight_kg}
            onChange={(e) => set("weight_kg", e.target.value)}
            placeholder="75"
            min={30}
            max={300}
            step={0.1}
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Sesso *">
        <div className="flex gap-3">
          {(["male", "female"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "male" ? "Maschio" : "Femmina"}
              aria-pressed={form.sex === v}
              onClick={() => set("sex", v)}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                form.sex === v
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
              }`}
            >
              {v === "male" ? "Maschio" : "Femmina"}
            </button>
          ))}
        </div>
      </FieldGroup>

      <div className={s.grid2}>
        <FieldGroup label="Email">
          <input
            id="email"
            name="email"
            type="email"
            className={s.input}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="mario@example.com"
            autoComplete="email"
          />
        </FieldGroup>

        <FieldGroup label="Telefono">
          <input
            id="phone"
            name="phone"
            type="tel"
            className={s.input}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+39 333 1234567"
            autoComplete="tel"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Codice Fiscale">
        <input
          type="text"
          className={s.input}
          value={form.codice_fiscale}
          onChange={(e) => set("codice_fiscale", e.target.value.toUpperCase())}
          placeholder="RSSMRA80A01H501U"
          maxLength={16}
        />
      </FieldGroup>
    </div>
  );
}

function Page2({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  const fields: Array<{ key: keyof FormData; label: string; placeholder: string }> = [
    { key: "circ_chest", label: "Torace (cm)", placeholder: "100" },
    { key: "circ_waist", label: "Vita (cm)", placeholder: "85" },
    { key: "circ_abdomen", label: "Addome (cm)", placeholder: "90" },
    { key: "circ_hips", label: "Fianchi (cm)", placeholder: "100" },
    { key: "circ_arm_r", label: "Braccio dx (cm)", placeholder: "35" },
    { key: "circ_arm_l", label: "Braccio sx (cm)", placeholder: "35" },
    { key: "circ_thigh_r", label: "Coscia dx (cm)", placeholder: "58" },
    { key: "circ_thigh_l", label: "Coscia sx (cm)", placeholder: "58" },
  ];

  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Circonferenze</h2>
      <p className="text-sm text-zinc-500 -mt-2">Tutte le misure sono opzionali.</p>

      <div className={s.grid4}>
        {fields.map(({ key, label, placeholder }) => (
          <FieldGroup key={key} label={label}>
            <input
              type="number"
              className={s.input}
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              min={0}
              step={0.1}
            />
          </FieldGroup>
        ))}
      </div>
    </div>
  );
}

function Page3({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  const fields: Array<{ key: keyof FormData; label: string; site: string }> = [
    { key: "pl_triceps", label: "Tricipite (mm)", site: "Tricipite" },
    { key: "pl_chest", label: "Pettorale (mm)", site: "Petto" },
    { key: "pl_abdomen", label: "Addominale (mm)", site: "Addome" },
    { key: "pl_suprailiac", label: "Soprailiaca (mm)", site: "Soprailiaca" },
    { key: "pl_subscapular", label: "Sottoscapolare (mm)", site: "Sottoscapolare" },
    { key: "pl_thigh", label: "Coscia (mm)", site: "Coscia" },
    { key: "pl_midaxillary", label: "Ascellare media (mm)", site: "Ascellare" },
  ];

  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Pliche Cutanee</h2>
      <p className="text-sm text-zinc-500 -mt-2">Misure in millimetri. Tutte opzionali.</p>

      <div className={s.grid4}>
        {fields.map(({ key, label }) => (
          <FieldGroup key={key} label={label}>
            <input
              type="number"
              className={s.input}
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
              placeholder="0.0"
              min={0}
              step={0.1}
            />
          </FieldGroup>
        ))}
      </div>
    </div>
  );
}

function Page4({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  const rows: Array<{ key: keyof FormData; label: string; placeholder: string }> = [
    { key: "pathologies", label: "Patologie", placeholder: "Diabete, ipertensione, …" },
    { key: "family_history", label: "Anamnesi familiare", placeholder: "Patologie dei genitori, …" },
    { key: "allergies", label: "Allergie", placeholder: "Nichel, polline, …" },
    { key: "intolerances", label: "Intolleranze alimentari", placeholder: "Lattosio, glutine, …" },
    { key: "medications", label: "Farmaci assunti", placeholder: "Metformina 500mg, …" },
    { key: "supplements", label: "Integratori", placeholder: "Vitamina D, Omega-3, …" },
    { key: "digestion_issues", label: "Problemi digestivi", placeholder: "Reflusso, gonfiore, …" },
    { key: "intestine_issues", label: "Problemi intestinali", placeholder: "Stitichezza, IBS, …" },
    { key: "sleep", label: "Qualità del sonno", placeholder: "6h, risvegli notturni, …" },
    { key: "nutritional_history", label: "Anamnesi nutrizionale", placeholder: "Diete seguite in passato, …" },
  ];

  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Anamnesi Medica</h2>
      <p className="text-sm text-zinc-500 -mt-2">Tutti i campi sono opzionali.</p>

      <div className="space-y-4">
        {rows.map(({ key, label, placeholder }) => (
          <FieldGroup key={key} label={label}>
            <textarea
              className={s.textarea}
              rows={2}
              value={form[key] as string}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
            />
          </FieldGroup>
        ))}
      </div>
    </div>
  );
}

function Page5({
  form,
  setSessions,
}: {
  form: FormData;
  setSessions: (dayIndex: number, sessions: TrainingSession[]) => void;
}) {
  const addSession = (dayIndex: number) => {
    const existing = form.weekSessions[dayIndex] ?? [];
    setSessions(dayIndex, [
      ...existing,
      { modality: "Pesi — Ipertrofia", duration_min: 60, rpe: 7 },
    ]);
  };

  const removeSession = (dayIndex: number, sessionIndex: number) => {
    const existing = form.weekSessions[dayIndex] ?? [];
    setSessions(
      dayIndex,
      existing.filter((_, i) => i !== sessionIndex)
    );
  };

  const updateSession = (
    dayIndex: number,
    sessionIndex: number,
    field: keyof TrainingSession,
    value: string | number
  ) => {
    const existing = [...(form.weekSessions[dayIndex] ?? [])];
    const current = existing[sessionIndex];
    if (!current) return;
    existing[sessionIndex] = { ...current, [field]: value } as TrainingSession;
    setSessions(dayIndex, existing);
  };

  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Scheda Allenamento Settimanale</h2>
      <p className="text-sm text-zinc-500 -mt-2">
        Aggiungi sessioni per ogni giorno di allenamento. I giorni senza sessioni sono considerati riposo.
      </p>

      <div className="space-y-4">
        {DAYS_IT.map((dayName, dayIndex) => {
          const sessions = form.weekSessions[dayIndex] ?? [];
          const isTraining = sessions.length > 0;

          return (
            <div
              key={dayIndex}
              className={`rounded-xl border p-4 ${
                isTraining ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-sm text-zinc-800">{dayName}</span>
                <div className="flex items-center gap-2">
                  {isTraining ? (
                    <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">
                      Allenamento
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
                      Riposo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => addSession(dayIndex)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50"
                  >
                    + Sessione
                  </button>
                </div>
              </div>

              {sessions.map((session, si) => (
                <div
                  key={si}
                  className="mt-2 rounded-lg border border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <FieldGroup label="Modalità">
                        <select
                          className={s.select}
                          value={session.modality}
                          onChange={(e) =>
                            updateSession(dayIndex, si, "modality", e.target.value)
                          }
                        >
                          {MODALITY_GROUPS.map((g) => (
                            <optgroup key={g.group} label={g.group}>
                              {g.entries.map((entry) => (
                                <option key={entry.displayIt} value={entry.displayIt}>
                                  {entry.displayIt}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </FieldGroup>

                      <FieldGroup label="Durata (min)">
                        <input
                          type="number"
                          className={s.input}
                          value={session.duration_min}
                          onChange={(e) =>
                            updateSession(
                              dayIndex,
                              si,
                              "duration_min",
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                          min={1}
                          max={480}
                        />
                      </FieldGroup>

                      <FieldGroup label={`RPE: ${session.rpe}`}>
                        <input
                          type="range"
                          className="w-full h-2 cursor-pointer accent-zinc-900 mt-1"
                          value={session.rpe}
                          onChange={(e) =>
                            updateSession(
                              dayIndex,
                              si,
                              "rpe",
                              parseInt(e.target.value)
                            )
                          }
                          min={1}
                          max={10}
                          step={1}
                        />
                        <div className="flex justify-between text-xs text-zinc-400 mt-0.5">
                          <span>1</span>
                          <span>10</span>
                        </div>
                      </FieldGroup>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSession(dayIndex, si)}
                      className="mt-6 rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                      title="Rimuovi sessione"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Page6({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Stile di Vita</h2>

      <FieldGroup label="Passi giornalieri medi" note="Stima approssimativa">
        <input
          type="number"
          className={s.input}
          value={form.daily_steps}
          onChange={(e) => set("daily_steps", e.target.value)}
          placeholder="8000"
          min={0}
          style={{ maxWidth: "200px" }}
        />
      </FieldGroup>

      {/* Il numero di pasti/giorno si sceglie al momento della generazione del piano. */}

      <FieldGroup label="Occupazione / Lavoro">
        <input
          type="text"
          className={s.input}
          value={form.occupation}
          onChange={(e) => set("occupation", e.target.value)}
          placeholder="Impiegato, operaio, libero professionista, …"
        />
      </FieldGroup>

      <FieldGroup
        label="Livello di attività lavorativa *"
        note="Usato per calcolare il fabbisogno energetico NEAT nel piano."
      >
        <select
          className={s.select}
          value={form.occupational_level}
          onChange={(e) => set("occupational_level", e.target.value)}
        >
          <option value="sedentary">Sedentario (lavoro d'ufficio / studio)</option>
          <option value="light">Leggero (in piedi buona parte del giorno)</option>
          <option value="moderate">Moderato (lavoro fisico medio)</option>
          <option value="heavy">Pesante (lavoro fisico intenso)</option>
          <option value="very_heavy">Molto pesante (lavoro manuale estremo)</option>
        </select>
      </FieldGroup>

      <FieldGroup label="Senso di fame (quando e quanto)">
        <textarea
          className={s.textarea}
          rows={2}
          value={form.hunger_timing}
          onChange={(e) => set("hunger_timing", e.target.value)}
          placeholder="Molta fame la mattina, poca a pranzo, forte fame serale, …"
        />
      </FieldGroup>

      <FieldGroup label="Orario preferito per allenarsi">
        <input
          type="text"
          className={s.input}
          value={form.preferred_training_time}
          onChange={(e) => set("preferred_training_time", e.target.value)}
          placeholder="Mattina presto, dopo lavoro, …"
        />
      </FieldGroup>
    </div>
  );
}

function Page7({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <h2 className={s.sectionTitle}>Obiettivo</h2>

      <FieldGroup label="Obiettivo Principale *">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GOAL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => set("goal", value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                form.goal === value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="Peso target (kg)">
        <input
          type="number"
          className={s.input}
          value={form.target_weight_kg}
          onChange={(e) => set("target_weight_kg", e.target.value)}
          placeholder="75"
          min={30}
          max={300}
          step={0.1}
          style={{ maxWidth: "200px" }}
        />
      </FieldGroup>

      <FieldGroup
        label="Evento / Obiettivo a data fissa"
        note="Esempio: matrimonio, gara, vacanza"
      >
        <input
          type="text"
          className={s.input}
          value={form.target_event}
          onChange={(e) => set("target_event", e.target.value)}
          placeholder="Matrimonio, gara di ciclismo, …"
        />
      </FieldGroup>

      <FieldGroup label="Data dell'evento">
        <input
          type="date"
          className={s.input}
          value={form.target_event_date}
          onChange={(e) => set("target_event_date", e.target.value)}
          style={{ maxWidth: "220px" }}
        />
      </FieldGroup>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100);

  const labels = [
    "Paziente",
    "Circonferenze",
    "Pliche",
    "Anamnesi",
    "Allenamento",
    "Stile di Vita",
    "Obiettivo",
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-zinc-700">
          {labels[current - 1]}
        </span>
        <span className="text-xs text-zinc-400">
          {current} / {total}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-100">
        <div
          className="h-1.5 rounded-full bg-zinc-900 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const initialForm: FormData = {
  full_name: "",
  date_of_birth: "",
  height_cm: "",
  weight_kg: "",
  sex: "",
  email: "",
  phone: "",
  codice_fiscale: "",

  circ_chest: "",
  circ_waist: "",
  circ_abdomen: "",
  circ_hips: "",
  circ_arm_r: "",
  circ_arm_l: "",
  circ_thigh_r: "",
  circ_thigh_l: "",

  pl_triceps: "",
  pl_chest: "",
  pl_abdomen: "",
  pl_suprailiac: "",
  pl_subscapular: "",
  pl_thigh: "",
  pl_midaxillary: "",

  pathologies: "",
  family_history: "",
  allergies: "",
  intolerances: "",
  medications: "",
  supplements: "",
  digestion_issues: "",
  intestine_issues: "",
  sleep: "",
  nutritional_history: "",

  weekSessions: {},

  daily_steps: "",
  occupation: "",
  occupational_level: "sedentary",
  hunger_timing: "",
  meal_count: "4",
  preferred_training_time: "",

  goal: "",
  target_weight_kg: "",
  target_event: "",
  target_event_date: "",
};

export default function IntakeForm() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createClient = trpc.client.create.useMutation();
  const createSnapshot = trpc.client.createSnapshot.useMutation();

  const isSubmitting = createClient.isPending || createSnapshot.isPending;

  /** Generic single-field setter */
  const setField = useCallback(
    (key: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  /** Training sessions setter */
  const setSessions = useCallback(
    (dayIndex: number, sessions: TrainingSession[]) => {
      setForm((prev) => ({
        ...prev,
        weekSessions: { ...prev.weekSessions, [dayIndex]: sessions },
      }));
    },
    []
  );

  /** Page 1 validation */
  const page1Valid =
    form.full_name.trim().length >= 2 &&
    form.date_of_birth !== "" &&
    form.height_cm !== "" &&
    form.weight_kg !== "" &&
    form.sex !== "";

  const canProceed = page === 1 ? page1Valid : true;

  const handleNext = () => {
    if (page < TOTAL_PAGES) setPage((p) => p + 1);
  };

  const handleBack = () => {
    if (page > 1) setPage((p) => p - 1);
  };

  const handleSubmit = async () => {
    if (!page1Valid) {
      setSubmitError("Compila i campi obbligatori (Nome, Data di nascita, Altezza, Peso, Sesso).");
      setPage(1);
      return;
    }

    setSubmitError(null);

    try {
      // Step 1: Create client
      const client = await createClient.mutateAsync({
        fullName: form.full_name.trim(),
        dateOfBirth: form.date_of_birth || undefined,
        sex: form.sex || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        codiceFiscale: form.codice_fiscale.trim() || undefined,
        heightCm: parseNum(form.height_cm),
      });

      // Step 2: Build circumferences object (only defined fields)
      const circumferences = {
        chest: parseNum(form.circ_chest),
        waist: parseNum(form.circ_waist),
        abdomen: parseNum(form.circ_abdomen),
        hips: parseNum(form.circ_hips),
        arm_r: parseNum(form.circ_arm_r),
        arm_l: parseNum(form.circ_arm_l),
        thigh_r: parseNum(form.circ_thigh_r),
        thigh_l: parseNum(form.circ_thigh_l),
      };
      const hasCircumferences = Object.values(circumferences).some((v) => v !== undefined);

      // Step 3: Build skinfolds object
      const skinfolds = {
        triceps: parseNum(form.pl_triceps),
        chest: parseNum(form.pl_chest),
        abdomen: parseNum(form.pl_abdomen),
        suprailiac: parseNum(form.pl_suprailiac),
        subscapular: parseNum(form.pl_subscapular),
        thigh: parseNum(form.pl_thigh),
        midaxillary: parseNum(form.pl_midaxillary),
      };
      const hasSkinfolds = Object.values(skinfolds).some((v) => v !== undefined);

      // Step 4: Medical history
      const medHistory = {
        pathologies: form.pathologies || undefined,
        family_history: form.family_history || undefined,
        allergies: form.allergies || undefined,
        intolerances: form.intolerances || undefined,
        medications: form.medications || undefined,
        supplements: form.supplements || undefined,
        digestion_issues: form.digestion_issues || undefined,
        intestine_issues: form.intestine_issues || undefined,
        sleep: form.sleep || undefined,
        nutritional_history: form.nutritional_history || undefined,
      };
      const hasMedHistory = Object.values(medHistory).some((v) => v !== undefined);

      // Step 5: Training sessions — convert numeric keys to string keys for schema
      const trainingSessions: Record<string, Array<{ modality: string; duration_min: number; rpe: number }>> = {};
      for (const [k, v] of Object.entries(form.weekSessions)) {
        if (v && v.length > 0) {
          trainingSessions[k] = v;
        }
      }

      // Step 6: Create snapshot
      await createSnapshot.mutateAsync({
        clientId: client.id,
        weightKg: parseNum(form.weight_kg),
        heightCm: parseNum(form.height_cm),
        circumferences: hasCircumferences ? circumferences : undefined,
        skinfolds: hasSkinfolds ? skinfolds : undefined,
        medicalHistory: hasMedHistory ? medHistory : undefined,
        trainingSessions:
          Object.keys(trainingSessions).length > 0 ? trainingSessions : undefined,
        // occupationalLevel drives NEAT calculation in the plan engine
        occupationalLevel: form.occupational_level,
        lifestyle: {
          daily_steps: parseNum(form.daily_steps),
          occupation: form.occupation || undefined,
          hunger_timing: form.hunger_timing || undefined,
          preferred_training_time: form.preferred_training_time || undefined,
        },
        goal: form.goal
          ? {
              goal: form.goal,
              target_weight_kg: parseNum(form.target_weight_kg),
              target_event: form.target_event || undefined,
              target_event_date: form.target_event_date || undefined,
            }
          : undefined,
      });

      // Success — redirect to clients/plans list
      router.push("/plans");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Errore durante il salvataggio. Riprova."
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <a
          href="/plans"
          className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          ← Torna ai Piani
        </a>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900">Nuovo Cliente</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Compila la scheda di ingresso per creare il profilo del paziente.
        </p>
      </div>

      {/* Progress */}
      <ProgressBar current={page} total={TOTAL_PAGES} />

      {/* Form card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {page === 1 && <Page1 form={form} set={setField} />}
        {page === 2 && <Page2 form={form} set={setField} />}
        {page === 3 && <Page3 form={form} set={setField} />}
        {page === 4 && <Page4 form={form} set={setField} />}
        {page === 5 && <Page5 form={form} setSessions={setSessions} />}
        {page === 6 && <Page6 form={form} set={setField} />}
        {page === 7 && <Page7 form={form} set={setField} />}

        {/* Error banner */}
        {submitError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-zinc-100 pt-5">
          <button
            type="button"
            onClick={handleBack}
            disabled={page === 1}
            className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Indietro
          </button>

          {page < TOTAL_PAGES ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed}
              className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Avanti
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !page1Valid}
              className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Salvataggio…" : "Salva Cliente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
