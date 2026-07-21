"use client";

/**
 * #20 — coach item-level food swap UI for the plan-review Meals tab.
 *
 * Each primary-meal ingredient row becomes swappable: alternatives are computed
 * CLIENT-SIDE from the already-exposed plan.foodCatalogue (the same solver
 * category, minus the ingredient itself). FIXED foods (water/spices) are not in
 * the catalogue → no alternatives → the row is plain (not clickable). Picking an
 * alternative calls plan.swapMealItem; the parent shows the recalced grams + a
 * tolerance badge from the response.
 *
 * Presentational: the parent owns the catalogue query + the swap mutation.
 */

import { useState } from "react";
import { isFoodAllowedInSlot } from "@/engine/meal-plan/slot-permissions";
import { formatIngredientQuantity } from "../../lib/ingredient-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { FoodCatalogue, FoodOption } from "./source-swap-card";

export interface SwapIngredient {
  foodId?: string;
  name: string;
  grams: number;
}

/**
 * Same-category alternatives for an ingredient, computed from the food catalogue
 * (minus the ingredient itself). Returns [] when the food isn't in the catalogue
 * (FIXED / zero foods) — i.e. not swappable.
 */
export function getIngredientAlternatives(
  foodId: string | undefined,
  catalogue: FoodCatalogue | undefined,
  slot?: string | null
): FoodOption[] {
  if (!foodId || !catalogue) return [];
  for (const cat of Object.keys(catalogue) as (keyof FoodCatalogue)[]) {
    const list = catalogue[cat];
    if (list.some((f) => f.foodId === foodId)) {
      // B1 (#10): slot-class coherence per Model 1 (no seafood at colazione).
      return list.filter(
        (f) => f.foodId !== foodId && isFoodAllowedInSlot(f.foodId, cat, slot)
      );
    }
  }
  return [];
}

export interface SwapArgs {
  planId: string;
  dayType: string;
  slot: string;
  ingredientIndex: number;
  newFoodId: string;
}

/** The exact swapMealItem mutation payload for a chosen alternative. */
export function buildSwapArgs(
  planId: string,
  dayType: string,
  slot: string,
  ingredientIndex: number,
  newFoodId: string
): SwapArgs {
  return { planId, dayType, slot, ingredientIndex, newFoodId };
}

interface IngredientSwapListProps {
  ingredients: SwapIngredient[];
  catalogue: FoodCatalogue | undefined;
  /** Meal slot ("breakfast" | "snack" | "lunch" | "dinner") for class coherence. */
  slot?: string | null;
  /** Index of the ingredient whose swap is currently in flight (or null). */
  pendingIndex: number | null;
  onSwap: (ingredientIndex: number, newFoodId: string) => void;
}

export function IngredientSwapList({
  ingredients,
  catalogue,
  slot,
  pendingIndex,
  onSwap,
}: IngredientSwapListProps) {
  if (ingredients.length === 0) return null;
  return (
    <ul style={{ margin: "0 0 6px 0", padding: 0, listStyle: "none" }}>
      {ingredients.map((ing, idx) => {
        const alternatives = getIngredientAlternatives(ing.foodId, catalogue, slot);
        const swappable = alternatives.length > 0;
        const pending = pendingIndex === idx;
        return (
          <li
            key={idx}
            style={{
              fontSize: "13px",
              color: "#52525b",
              padding: "2px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
              borderBottom: idx < ingredients.length - 1 ? "1px solid #f4f4f5" : "none",
            }}
          >
            <span>{ing.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 600, color: "#18181b" }}>
                {formatIngredientQuantity(ing.foodId, ing.grams)}
              </span>
              {swappable && (
                <SwapSelect
                  pending={pending}
                  alternatives={alternatives}
                  onPick={(newFoodId) => onSwap(idx, newFoodId)}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SwapSelect({
  pending,
  alternatives,
  onPick,
}: {
  pending: boolean;
  alternatives: FoodOption[];
  onPick: (newFoodId: string) => void;
}) {
  // Held empty so the trigger always shows the "Sostituisci" placeholder.
  const [value, setValue] = useState("");
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => {
        if (v) onPick(v);
        setValue("");
      }}
    >
      <SelectTrigger
        aria-label="Sostituisci alimento"
        className="h-6 w-auto gap-1 rounded-md border border-zinc-200 px-2 text-xs text-blue-700"
      >
        <SelectValue placeholder={pending ? "Sostituendo…" : "Sostituisci"} />
      </SelectTrigger>
      <SelectContent>
        {alternatives.map((alt) => (
          <SelectItem key={alt.foodId} value={alt.foodId}>
            {alt.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
