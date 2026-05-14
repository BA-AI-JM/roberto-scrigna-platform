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
