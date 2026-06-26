/**
 * Pure helpers for the Integratori (supplements) tab — dependency-free (no React)
 * so they are unit-testable in the repo's node-only vitest.
 *
 * NOTE: notes / libraryId / isCustom live on SupplementEntry and flow through the
 * UI, but plan.saveEdits currently only persists name/dosage/timing/rationale —
 * extending its input is a flagged backend follow-up.
 */

import {
  SUPPLEMENT_LIBRARY,
  coreSetItems,
  type SupplementLibraryItem,
} from "@/data/supplements/library";
import type { SupplementEntry } from "@/pdf/types";

/** Build an editable plan supplement from a library item (dose/timing copied). */
export function libraryItemToEntry(item: SupplementLibraryItem): SupplementEntry {
  return {
    name: item.name,
    dosage: item.dose, // empty string when the source said "Dosage to be specified"
    timing: item.timing,
    rationale: item.purpose,
    notes: "",
    libraryId: item.id,
    isCustom: false,
  };
}

/** A blank custom (non-library) supplement. */
export function customEntry(): SupplementEntry {
  return { name: "", dosage: "", timing: "", rationale: "", notes: "", isCustom: true };
}

/** Core-set entries to append, skipping any already present (matched by libraryId). */
export function coreSetEntries(existing: SupplementEntry[]): SupplementEntry[] {
  const present = new Set(
    existing.map((s) => s.libraryId).filter((id): id is string => Boolean(id))
  );
  return coreSetItems()
    .filter((item) => !present.has(item.id))
    .map(libraryItemToEntry);
}

/** Case-insensitive filter of the library by name or Italian name. */
export function filterLibrary(query: string): SupplementLibraryItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...SUPPLEMENT_LIBRARY];
  return SUPPLEMENT_LIBRARY.filter(
    (s) =>
      s.name.toLowerCase().includes(q) || s.italianNotes.toLowerCase().includes(q)
  );
}

/** Group library items by macroCategory, in first-appearance order. */
export function groupByMacro(
  items: SupplementLibraryItem[]
): { macro: string; items: SupplementLibraryItem[] }[] {
  const map = new Map<string, SupplementLibraryItem[]>();
  for (const it of items) {
    const list = map.get(it.macroCategory);
    if (list) list.push(it);
    else map.set(it.macroCategory, [it]);
  }
  return [...map.entries()].map(([macro, items]) => ({ macro, items }));
}
