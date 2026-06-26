"use client";

/**
 * #16b source-swap card for the generate wizard. One shadcn Select per pinnable
 * category (Proteine/Carboidrati/Grassi/Verdura/Frutta); each is populated from
 * `plan.foodCatalogue()` (queried by the parent and passed in as `catalogue`,
 * mirroring how MacroOverridesCard receives `weekPreview`). "Automatico" = no pin.
 *
 * Presentational only: the parent owns the selection state + payload threading.
 */

import type { CSSProperties } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { PinnableCategory } from "../../engine/meal-plan/types";
import {
  PINNABLE_CATEGORIES,
  AUTO_VALUE,
  type SourceSwapSelections,
} from "./source-swap-helpers";

export interface FoodOption {
  foodId: string;
  name: string;
}

/** Catalogue shape returned by `trpc.plan.foodCatalogue`. */
export type FoodCatalogue = Record<PinnableCategory, FoodOption[]>;

interface SourceSwapCardProps {
  catalogue: FoodCatalogue | undefined;
  selections: SourceSwapSelections;
  onChange: (category: PinnableCategory, foodId: string) => void;
  sectionStyle: CSSProperties;
}

export function SourceSwapCard({
  catalogue,
  selections,
  onChange,
  sectionStyle,
}: SourceSwapCardProps) {
  return (
    <div style={sectionStyle}>
      <h2
        style={{
          fontSize: "15px",
          fontWeight: 600,
          marginBottom: "4px",
          marginTop: 0,
          color: "#18181b",
        }}
      >
        Scegli la fonte per categoria (opzionale)
      </h2>
      <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
        Fissa la fonte alimentare di una categoria su tutti i tipi di giorno (es. pollo
        per le proteine). «Automatico» lascia scegliere al motore — comportamento
        predefinito, nessun cambiamento se non imposti nulla.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {PINNABLE_CATEGORIES.map(({ key, label }) => {
          const options = catalogue?.[key] ?? [];
          const value = selections[key] || AUTO_VALUE;
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#18181b" }}>
                {label}
              </span>
              <Select
                value={value}
                onValueChange={(v) => onChange(key, v === AUTO_VALUE ? "" : v)}
              >
                <SelectTrigger className="w-full" aria-label={label}>
                  <SelectValue placeholder="Automatico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_VALUE}>Automatico</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.foodId} value={o.foodId}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
