/**
 * Canonical sport / training-modality taxonomy.
 *
 * Source: v4.4 Unified Specification — Appendix D ("Sport/Activity Display
 * Name Mapping"). Each entry maps an Italian display name shown in the
 * intake / training-routine UI to:
 *  - the SCP `categoryId` + `sessionType` + sport profile
 *  - a default gross MET used when only RPE/duration are known (Priority 4
 *    "modality estimate" fallback from §Step 5 of the macro engine)
 *
 * Centralising this here ensures the intake form, the training-log session
 * picker, the engine's modality→MET mapping, and the SCP all agree on the
 * same canonical set — the dropdowns can never drift apart again.
 *
 * Important spec rule: **strength training (any STRENGTH session type) MET is
 * capped at 3 regardless of RPE.** Encoded by `rpeAdjusts: false`.
 */

import type { CategoryId, SessionType } from "./sport-correction/types";
import type { CurveKey } from "./session-met-curves";

/** Coarse grouping for `<optgroup>` rendering. */
export type SportGroup =
  | "Grappling"
  | "Striking"
  | "MMA"
  | "Forza & ipertrofia"
  | "HIIT / Funzionale"
  | "Cardio ciclico"
  | "Sport di squadra"
  | "Sport di racchetta";

export interface SportEntry {
  /** Italian label shown to the coach / client. Stable — used as a primary key. */
  displayIt: string;
  /** English label per Appendix D for reference. */
  displayEn: string;
  /** SCP category. */
  categoryId: CategoryId;
  /** SCP session type within the category. */
  sessionType: SessionType;
  /** SCP sport profile (G = isometric-heavy, L = locomotion-dominant, CYCLIC = aerobic). */
  profile: "G" | "L" | "CYCLIC";
  /** Default gross MET when only RPE+duration are available (Priority 4 modality fallback). */
  metGross: number;
  /** If false, RPE does NOT adjust MET. True for everything except strength (per spec). */
  rpeAdjusts: boolean;
  /** Display group for grouped pickers. */
  group: SportGroup;
}

/**
 * The canonical taxonomy. Order matters — kept in Appendix D order so the
 * UI dropdown stays predictable.
 */
export const SPORT_TAXONOMY: readonly SportEntry[] = [
  // ── Grappling ────────────────────────────────────────────────────────────
  { displayIt: "BJJ — Classe",              displayEn: "Brazilian Jiu-Jitsu — Class",      categoryId: "GRAPPLING", sessionType: "mixed",   profile: "G", metGross: 9.0, rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "BJJ — Sparring",            displayEn: "Brazilian Jiu-Jitsu — Sparring",   categoryId: "GRAPPLING", sessionType: "sparring",profile: "G", metGross: 10.0,rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "BJJ — Drill / Tecnica",     displayEn: "Brazilian Jiu-Jitsu — Drilling",   categoryId: "GRAPPLING", sessionType: "tech",    profile: "G", metGross: 6.5, rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "BJJ — Open Mat",            displayEn: "Brazilian Jiu-Jitsu — Open Mat",   categoryId: "GRAPPLING", sessionType: "open",    profile: "G", metGross: 8.0, rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "BJJ — Gara",                displayEn: "Brazilian Jiu-Jitsu — Competition",categoryId: "GRAPPLING", sessionType: "comp",    profile: "G", metGross: 10.0,rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "Wrestling / Lotta libera",  displayEn: "Wrestling",                        categoryId: "GRAPPLING", sessionType: "mixed",   profile: "G", metGross: 9.5, rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "Judo",                      displayEn: "Judo",                             categoryId: "GRAPPLING", sessionType: "mixed",   profile: "G", metGross: 9.5, rpeAdjusts: true,  group: "Grappling" },
  { displayIt: "Sambo",                     displayEn: "Sambo",                            categoryId: "GRAPPLING", sessionType: "mixed",   profile: "G", metGross: 9.5, rpeAdjusts: true,  group: "Grappling" },

  // ── Striking ─────────────────────────────────────────────────────────────
  { displayIt: "Boxe — Classe",             displayEn: "Boxing — Class",                   categoryId: "STRIKING",  sessionType: "mixed",   profile: "L", metGross: 9.0, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Boxe — Sparring",           displayEn: "Boxing — Sparring",                categoryId: "STRIKING",  sessionType: "sparring",profile: "L", metGross: 9.5, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Boxe — Sacco / Shadow",     displayEn: "Boxing — Bag / Shadow",            categoryId: "STRIKING",  sessionType: "solo",    profile: "L", metGross: 7.5, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Boxe — Colpitori (Pad)",    displayEn: "Boxing — Pad Work",                categoryId: "STRIKING",  sessionType: "pads",    profile: "L", metGross: 8.5, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Muay Thai — Classe",        displayEn: "Muay Thai — Class",                categoryId: "STRIKING",  sessionType: "mixed",   profile: "L", metGross: 9.0, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Muay Thai — Sparring",      displayEn: "Muay Thai — Sparring",             categoryId: "STRIKING",  sessionType: "sparring",profile: "L", metGross: 9.5, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Kickboxing",                displayEn: "Kickboxing",                       categoryId: "STRIKING",  sessionType: "mixed",   profile: "L", metGross: 9.0, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Karate",                    displayEn: "Karate",                           categoryId: "STRIKING",  sessionType: "mixed",   profile: "L", metGross: 8.0, rpeAdjusts: true,  group: "Striking" },
  { displayIt: "Taekwondo",                 displayEn: "Taekwondo",                        categoryId: "STRIKING",  sessionType: "mixed",   profile: "L", metGross: 8.5, rpeAdjusts: true,  group: "Striking" },

  // ── MMA ──────────────────────────────────────────────────────────────────
  { displayIt: "MMA — Classe (mista)",      displayEn: "MMA — Class (Mixed)",              categoryId: "MMA",       sessionType: "mixed",   profile: "G", metGross: 9.5, rpeAdjusts: true,  group: "MMA" },
  { displayIt: "MMA — Focus striking",      displayEn: "MMA — Striking Focus",             categoryId: "MMA",       sessionType: "striking",profile: "L", metGross: 9.0, rpeAdjusts: true,  group: "MMA" },
  { displayIt: "MMA — Focus grappling",     displayEn: "MMA — Grappling Focus",            categoryId: "MMA",       sessionType: "grappling",profile: "G", metGross: 9.5, rpeAdjusts: true,  group: "MMA" },
  { displayIt: "MMA — Sparring",            displayEn: "MMA — Sparring",                   categoryId: "MMA",       sessionType: "sparring",profile: "G", metGross: 10.0,rpeAdjusts: true,  group: "MMA" },
  { displayIt: "MMA — Gara",                displayEn: "MMA — Competition",                categoryId: "MMA",       sessionType: "comp",    profile: "G", metGross: 10.0,rpeAdjusts: true,  group: "MMA" },

  // ── Strength — spec rule: MET 3 regardless of RPE ────────────────────────
  { displayIt: "Pesi — Forza",              displayEn: "Weight Training — Strength",       categoryId: "STRENGTH",  sessionType: "strength",   profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },
  { displayIt: "Pesi — Ipertrofia",         displayEn: "Weight Training — Hypertrophy",    categoryId: "STRENGTH",  sessionType: "hypertrophy",profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },
  { displayIt: "Pesi — Potenza / Olimpica", displayEn: "Weight Training — Power / Olympic",categoryId: "STRENGTH",  sessionType: "power",      profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },
  { displayIt: "Pesi — Circuito",           displayEn: "Weight Training — Circuit",        categoryId: "STRENGTH",  sessionType: "circuit",    profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },
  { displayIt: "Calisthenics / Corpo libero",displayEn:"Calisthenics",                     categoryId: "STRENGTH",  sessionType: "hypertrophy",profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },
  { displayIt: "Macchine / Sala pesi",      displayEn: "Machines / Gym Session",           categoryId: "STRENGTH",  sessionType: "hypertrophy",profile: "G", metGross: 3.0, rpeAdjusts: false, group: "Forza & ipertrofia" },

  // ── HIIT / Functional ────────────────────────────────────────────────────
  { displayIt: "CrossFit / WOD",            displayEn: "CrossFit / WOD",                   categoryId: "HIIT",      sessionType: "metcon",     profile: "L", metGross: 8.5, rpeAdjusts: true, group: "HIIT / Funzionale" },
  { displayIt: "HIIT / Intervalli",         displayEn: "HIIT / Intervals",                 categoryId: "HIIT",      sessionType: "intervals",  profile: "L", metGross: 9.0, rpeAdjusts: true, group: "HIIT / Funzionale" },
  { displayIt: "Allenamento a circuito",    displayEn: "Circuit Training",                 categoryId: "HIIT",      sessionType: "mixed",      profile: "L", metGross: 7.5, rpeAdjusts: true, group: "HIIT / Funzionale" },
  { displayIt: "Boot Camp",                 displayEn: "Boot Camp",                        categoryId: "HIIT",      sessionType: "mixed",      profile: "L", metGross: 7.5, rpeAdjusts: true, group: "HIIT / Funzionale" },

  // ── Cyclic cardio ────────────────────────────────────────────────────────
  { displayIt: "Corsa — Facile / Recupero", displayEn: "Running — Easy / Recovery",        categoryId: "CYCLIC",    sessionType: "easy",       profile: "CYCLIC", metGross: 6.0, rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Corsa — Costante",          displayEn: "Running — Steady State",           categoryId: "CYCLIC",    sessionType: "steady",     profile: "CYCLIC", metGross: 8.0, rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Corsa — Intervalli / Tempo",displayEn: "Running — Intervals / Tempo",      categoryId: "CYCLIC",    sessionType: "intervals",  profile: "CYCLIC", metGross: 11.0,rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Corsa — Lungo",             displayEn: "Running — Long Run",               categoryId: "CYCLIC",    sessionType: "long",       profile: "CYCLIC", metGross: 8.5, rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Corsa — Gara",              displayEn: "Running — Race",                   categoryId: "CYCLIC",    sessionType: "race",       profile: "CYCLIC", metGross: 11.0,rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Ciclismo",                  displayEn: "Cycling",                          categoryId: "CYCLIC",    sessionType: "steady",     profile: "CYCLIC", metGross: 7.0, rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Vogatore",                  displayEn: "Rowing",                           categoryId: "CYCLIC",    sessionType: "steady",     profile: "CYCLIC", metGross: 8.5, rpeAdjusts: true, group: "Cardio ciclico" },
  { displayIt: "Nuoto",                     displayEn: "Swimming",                         categoryId: "CYCLIC",    sessionType: "steady",     profile: "CYCLIC", metGross: 7.5, rpeAdjusts: true, group: "Cardio ciclico" },

  // ── Team sports ──────────────────────────────────────────────────────────
  { displayIt: "Calcio — Allenamento",      displayEn: "Football — Training",              categoryId: "TEAM",      sessionType: "training",   profile: "L", metGross: 7.0, rpeAdjusts: true, group: "Sport di squadra" },
  { displayIt: "Calcio — Partita",          displayEn: "Football — Match",                 categoryId: "TEAM",      sessionType: "match_full", profile: "L", metGross: 9.0, rpeAdjusts: true, group: "Sport di squadra" },
  { displayIt: "Basket — Allenamento",      displayEn: "Basketball — Training",            categoryId: "TEAM",      sessionType: "training",   profile: "L", metGross: 7.0, rpeAdjusts: true, group: "Sport di squadra" },
  { displayIt: "Basket — Partita",          displayEn: "Basketball — Match",               categoryId: "TEAM",      sessionType: "match_full", profile: "L", metGross: 8.5, rpeAdjusts: true, group: "Sport di squadra" },
  { displayIt: "Rugby",                     displayEn: "Rugby",                            categoryId: "TEAM",      sessionType: "match_full", profile: "L", metGross: 9.0, rpeAdjusts: true, group: "Sport di squadra" },
  { displayIt: "Hockey",                    displayEn: "Hockey",                           categoryId: "TEAM",      sessionType: "match_full", profile: "L", metGross: 8.0, rpeAdjusts: true, group: "Sport di squadra" },

  // ── Racket sports ────────────────────────────────────────────────────────
  { displayIt: "Tennis — Singolo",          displayEn: "Tennis — Singles",                 categoryId: "RACKET",    sessionType: "singles",    profile: "L", metGross: 8.0, rpeAdjusts: true, group: "Sport di racchetta" },
  { displayIt: "Tennis — Doppio",           displayEn: "Tennis — Doubles",                 categoryId: "RACKET",    sessionType: "doubles",    profile: "L", metGross: 6.0, rpeAdjusts: true, group: "Sport di racchetta" },
  { displayIt: "Padel",                     displayEn: "Padel",                            categoryId: "RACKET",    sessionType: "doubles",    profile: "L", metGross: 6.5, rpeAdjusts: true, group: "Sport di racchetta" },
  { displayIt: "Squash",                    displayEn: "Squash",                           categoryId: "RACKET",    sessionType: "singles",    profile: "L", metGross: 9.5, rpeAdjusts: true, group: "Sport di racchetta" },
  { displayIt: "Badminton",                 displayEn: "Badminton",                        categoryId: "RACKET",    sessionType: "singles",    profile: "L", metGross: 7.0, rpeAdjusts: true, group: "Sport di racchetta" },
] as const;

/**
 * Look up an entry by its Italian display name.
 * Falls back to a conservative "generic non-strength" default when the name is
 * unknown so old snapshots (whose modality strings predate this taxonomy)
 * still get a reasonable estimate instead of the flat 300 kcal default.
 */
export function findSportEntry(displayIt: string | undefined | null): SportEntry | undefined {
  if (!displayIt) return undefined;
  return SPORT_TAXONOMY.find((e) => e.displayIt === displayIt);
}

/**
 * Map a taxonomy entry to its No-HR RPE-MET curve (Roberto v1.0, spec §5/§7).
 * Most categories map 1:1; GRAPPLING and STRIKING split by sport. Keyed on the
 * stable `displayIt` primary key.
 *
 * Note (spec §5.D/E): the current taxonomy files "Pesi — Circuito" under STRENGTH,
 * but Roberto's spec puts resistance circuits under HIIT/Functional. That
 * reclassification is a clinical call held for Roberto — NOT applied silently here;
 * flagged in the plan. Combat Sambo (spec: → mma) is likewise a future taxonomy
 * addition — today's "Sambo" entry is Sport Sambo → sport_sambo.
 */
const GRAPPLING_CURVE: Record<string, CurveKey> = {
  "Wrestling / Lotta libera": "wrestling",
  Judo: "judo",
  Sambo: "sport_sambo",
};
const STRIKING_CURVE: Record<string, CurveKey> = {
  "Muay Thai — Classe": "muay_thai",
  "Muay Thai — Sparring": "muay_thai",
  Kickboxing: "kickboxing",
  Karate: "karate",
  Taekwondo: "taekwondo",
};

export function curveKeyForEntry(entry: SportEntry): CurveKey {
  switch (entry.categoryId) {
    case "MMA":
      return "mma";
    case "STRENGTH":
      return "strength_hypertrophy";
    case "HIIT":
      return "hiit_functional";
    case "CYCLIC":
      return "cyclic_cardio";
    case "TEAM":
      return "team_sports";
    case "RACKET":
      return "racquet_sports";
    case "GRAPPLING":
      return GRAPPLING_CURVE[entry.displayIt] ?? "bjj"; // BJJ variants default here
    case "STRIKING":
      return STRIKING_CURVE[entry.displayIt] ?? "boxing"; // Boxe variants default here
    default:
      return "team_sports"; // neutral intermittent fallback (matches FALLBACK_MODALITY)
  }
}

/** A safe fallback MET for unknown modality strings (e.g. "Altro" or legacy free-text). */
export const FALLBACK_MODALITY: SportEntry = {
  displayIt: "Altro",
  displayEn: "Other",
  categoryId: "TEAM", // closest neutral profile
  sessionType: "conditioning",
  profile: "L",
  metGross: 5.0,
  rpeAdjusts: true,
  group: "Sport di squadra",
};

/** Display names grouped for `<optgroup>` rendering. */
export function groupedSportOptions(): Array<{ group: SportGroup; entries: SportEntry[] }> {
  const order: SportGroup[] = [
    "Grappling",
    "Striking",
    "MMA",
    "Forza & ipertrofia",
    "HIIT / Funzionale",
    "Cardio ciclico",
    "Sport di squadra",
    "Sport di racchetta",
  ];
  return order.map((g) => ({
    group: g,
    entries: SPORT_TAXONOMY.filter((e) => e.group === g),
  }));
}

// ── Collapsed picker (Ruling 1, Roberto 2026-07-22) ──────────────────────────
//
// The Classe/Sparring/Drill sub-types retire from the menu — RPE now carries the
// intra-sport intensity, so the coach picks ONE entry per sport. Everything below
// is DERIVED from SPORT_TAXONOMY so the collapsed list can never drift from it, and
// the underlying entries stay intact for the HR-path sessionType (Ruling 3).

/** The "sport" of a display name = the part before its " — subtype" suffix. */
export function sportKeyOf(displayIt: string): string {
  const idx = displayIt.indexOf(" — ");
  return idx === -1 ? displayIt : displayIt.slice(0, idx);
}

export interface CollapsedSportOption {
  /** Clean label shown in the picker (the sport, no sub-type). */
  label: string;
  /** Representative taxonomy displayIt stored on the session (resolves + curve). */
  modality: string;
  group: SportGroup;
}

/**
 * One option per sport. Entries are grouped by `sportKeyOf`, and the FIRST entry of
 * each group is the representative whose `displayIt` is stored. Within a sport every
 * sub-type shares the same No-HR curve (verified by test), so which representative
 * is chosen never changes the calorie math — it only sets the default HR sessionType.
 */
export function collapsedSportOptions(): readonly CollapsedSportOption[] {
  const seen = new Set<string>();
  const out: CollapsedSportOption[] = [];
  for (const e of SPORT_TAXONOMY) {
    const key = sportKeyOf(e.displayIt);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: key, modality: e.displayIt, group: e.group });
  }
  return out;
}

/** Grouped for `<optgroup>` rendering, mirroring `groupedSportOptions()`'s shape. */
export function groupedCollapsedSportOptions(): Array<{
  group: SportGroup;
  entries: CollapsedSportOption[];
}> {
  const order: SportGroup[] = [
    "Grappling",
    "Striking",
    "MMA",
    "Forza & ipertrofia",
    "HIIT / Funzionale",
    "Cardio ciclico",
    "Sport di squadra",
    "Sport di racchetta",
  ];
  const all = collapsedSportOptions();
  return order.map((g) => ({ group: g, entries: all.filter((e) => e.group === g) }));
}

/**
 * Map any (possibly legacy sub-type) modality to its collapsed representative, so a
 * controlled `<select>` shows the right option for an already-stored session. An
 * unrecognised string passes through unchanged (the select then shows unselected and
 * the coach re-picks).
 */
export function toCollapsedModality(modality: string | undefined | null): string {
  if (!modality) return "";
  const key = sportKeyOf(modality);
  const rep = SPORT_TAXONOMY.find((e) => sportKeyOf(e.displayIt) === key);
  return rep?.displayIt ?? modality;
}
