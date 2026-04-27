/**
 * Plan Generation Page.
 *
 * Allows Roberto to select a client and configure plan parameters,
 * then calls trpc.plan.generate. On success it navigates to the review page.
 *
 * The client must already exist with at least one snapshot (from the intake
 * form at /plans/new). This page is separate from the intake form.
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "../../../../lib/trpc/client";
import type { Allergen, MealTag } from "../../../../engine/meal-plan/types";

// ── Form State ───────────────────────────────────────────────────────────────

interface GeneratePlanFormState {
  clientId: string;
  mealCount: number;
  excludeAllergens: Allergen[];
  preferTags: MealTag[];
  maintenanceKcalEstimate: string;
  notes: string;
}

// ── Options ──────────────────────────────────────────────────────────────────

const ALLERGEN_OPTIONS: readonly Allergen[] = [
  "gluten",
  "dairy",
  "eggs",
  "nuts",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;

const TAG_OPTIONS: readonly MealTag[] = [
  "high_protein",
  "low_fat",
  "low_carb",
  "high_carb",
  "vegetarian",
  "vegan",
  "quick_prep",
  "meal_prep_friendly",
  "italian",
] as const;

const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Glutine",
  dairy: "Latticini",
  eggs: "Uova",
  nuts: "Frutta a guscio",
  soy: "Soia",
  fish: "Pesce",
  shellfish: "Crostacei",
  sesame: "Sesamo",
} as const;

const TAG_LABELS: Record<MealTag, string> = {
  high_protein: "Alto Proteine",
  low_fat: "Basso Grassi",
  low_carb: "Basso Carboidrati",
  high_carb: "Alto Carboidrati",
  vegetarian: "Vegetariano",
  vegan: "Vegano",
  quick_prep: "Preparazione Rapida",
  meal_prep_friendly: "Meal Prep",
  italian: "Cucina Italiana",
  post_workout: "Post Allenamento",
  pre_workout: "Pre Allenamento",
} as const;

// ── Page Component ───────────────────────────────────────────────────────────

export default function GeneratePlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [form, setForm] = useState<GeneratePlanFormState>({
    clientId: preselectedClientId,
    mealCount: 4,
    excludeAllergens: [],
    preferTags: [],
    maintenanceKcalEstimate: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Load active clients for the selector
  const { data: clientsData, isLoading: clientsLoading } =
    trpc.client.list.useQuery({ status: "active", limit: 100 });

  // Generate mutation
  const generateMutation = trpc.plan.generate.useMutation({
    onSuccess: (result) => {
      router.push(`/plans/${result.planId}/review`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const toggleAllergen = useCallback((allergen: Allergen) => {
    setForm((prev) => ({
      ...prev,
      excludeAllergens: prev.excludeAllergens.includes(allergen)
        ? prev.excludeAllergens.filter((a) => a !== allergen)
        : [...prev.excludeAllergens, allergen],
    }));
  }, []);

  const toggleTag = useCallback((tag: MealTag) => {
    setForm((prev) => ({
      ...prev,
      preferTags: prev.preferTags.includes(tag)
        ? prev.preferTags.filter((t) => t !== tag)
        : [...prev.preferTags, tag],
    }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (!form.clientId) {
      setError("Seleziona un cliente.");
      return;
    }
    setError(null);
    generateMutation.mutate({
      clientId: form.clientId,
      mealCount: form.mealCount,
      excludeAllergens: form.excludeAllergens,
      preferTags: form.preferTags,
      maintenanceKcalEstimate: form.maintenanceKcalEstimate
        ? Number(form.maintenanceKcalEstimate)
        : undefined,
      notes: form.notes || undefined,
    });
  }, [form, generateMutation]);

  const isGenerating = generateMutation.isPending;

  // ── Styles ────────────────────────────────────────────────────────────────

  const sectionStyle: React.CSSProperties = {
    marginBottom: "20px",
    padding: "20px",
    border: "1px solid #e4e4e7",
    borderRadius: "12px",
    backgroundColor: "#ffffff",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#3f3f46",
    marginBottom: "6px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    color: "#18181b",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "32px", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <a
          href="/plans"
          style={{ fontSize: "13px", color: "#71717a", textDecoration: "none" }}
        >
          ← Torna ai Piani
        </a>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginTop: "8px",
            marginBottom: 0,
            color: "#18181b",
          }}
        >
          Genera Piano Nutrizionale
        </h1>
        <p style={{ fontSize: "13px", color: "#71717a", marginTop: "4px" }}>
          Seleziona un cliente con misurazione di partenza e configura le preferenze.
          Il piano viene calcolato e salvato automaticamente.
        </p>
      </div>

      {/* Client Selection */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Cliente *</label>
        {clientsLoading ? (
          <p style={{ fontSize: "13px", color: "#71717a", margin: 0 }}>
            Caricamento clienti...
          </p>
        ) : (
          <select
            value={form.clientId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, clientId: e.target.value }))
            }
            style={inputStyle}
          >
            <option value="">Seleziona cliente...</option>
            {(clientsData?.clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.email ? ` — ${c.email}` : ""}
              </option>
            ))}
          </select>
        )}
        {!clientsLoading && (clientsData?.clients ?? []).length === 0 && (
          <p
            style={{
              fontSize: "12px",
              color: "#d97706",
              margin: "6px 0 0 0",
            }}
          >
            Nessun cliente attivo trovato.{" "}
            <a
              href="/plans/new"
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              Aggiungi un cliente
            </a>{" "}
            prima di generare un piano.
          </p>
        )}
      </div>

      {/* Meal Configuration */}
      <div style={sectionStyle}>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
            color: "#18181b",
          }}
        >
          Configurazione Pasti
        </h2>

        <label style={labelStyle}>Numero Pasti/Giorno</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setForm((prev) => ({ ...prev, mealCount: n }))}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border:
                  form.mealCount === n
                    ? "2px solid #18181b"
                    : "1px solid #d4d4d8",
                backgroundColor: form.mealCount === n ? "#18181b" : "#ffffff",
                color: form.mealCount === n ? "#ffffff" : "#3f3f46",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Escludi Allergeni</label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "20px",
          }}
        >
          {ALLERGEN_OPTIONS.map((allergen) => {
            const selected = form.excludeAllergens.includes(allergen);
            return (
              <button
                key={allergen}
                onClick={() => toggleAllergen(allergen)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: selected
                    ? "2px solid #dc2626"
                    : "1px solid #d4d4d8",
                  backgroundColor: selected ? "#fef2f2" : "#ffffff",
                  color: selected ? "#dc2626" : "#71717a",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {selected ? "× " : ""}
                {ALLERGEN_LABELS[allergen]}
              </button>
            );
          })}
        </div>

        <label style={labelStyle}>Preferenze Alimentari</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TAG_OPTIONS.map((tag) => {
            const selected = form.preferTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: selected
                    ? "2px solid #16a34a"
                    : "1px solid #d4d4d8",
                  backgroundColor: selected ? "#f0fdf4" : "#ffffff",
                  color: selected ? "#16a34a" : "#71717a",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {TAG_LABELS[tag]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings */}
      <div style={sectionStyle}>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
            color: "#18181b",
          }}
        >
          Impostazioni Avanzate
        </h2>

        <label style={labelStyle}>
          Stima Kcal Mantenimento{" "}
          <span style={{ fontWeight: 400, color: "#a1a1aa" }}>(opzionale)</span>
        </label>
        <input
          type="number"
          min={0}
          value={form.maintenanceKcalEstimate}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              maintenanceKcalEstimate: e.target.value,
            }))
          }
          placeholder="Es: 2500"
          style={{
            ...inputStyle,
            maxWidth: "200px",
            marginBottom: "16px",
            display: "block",
          }}
        />

        <label style={labelStyle}>Note Aggiuntive</label>
        <textarea
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          placeholder="Note per la generazione del piano..."
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !form.clientId}
        style={{
          width: "100%",
          padding: "14px",
          backgroundColor:
            isGenerating || !form.clientId ? "#a1a1aa" : "#18181b",
          color: "#ffffff",
          border: "none",
          borderRadius: "10px",
          fontSize: "16px",
          fontWeight: 700,
          cursor: isGenerating || !form.clientId ? "not-allowed" : "pointer",
        }}
      >
        {isGenerating ? "Generazione in corso..." : "Genera Piano Nutrizionale"}
      </button>
    </div>
  );
}
