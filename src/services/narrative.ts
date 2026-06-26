/**
 * AI Narrative Generation Service
 *
 * Generates structured narratives for the nutrition plan report:
 * - Body composition summary
 * - Plan rationale
 * - Monitoring instructions
 * - Assumption disclosures
 *
 * All narratives are generated in Italian (Roberto's client language).
 * Uses template-based generation with data interpolation — no external AI API calls.
 */

import type {
  BodyComposition,
  ClientSnapshot,
  DayType,
  MacroTargets,
  TdeeResult,
  WeeklyPlan,
} from "../engine/types";
import type {
  GuidanceSection,
  Obiettivo,
  StileVita,
  AnamnestiAllenamento,
  MonitoringConfig,
} from "../pdf/types";

// ── Narrative Context ───────────────────────────────────────────────────────

/** All data needed to generate narratives */
export interface NarrativeContext {
  /** Client snapshot */
  snapshot: ClientSnapshot;
  /** Body composition results */
  bodyComposition: BodyComposition;
  /** Weekly plan with all day types */
  weeklyPlan: WeeklyPlan;
  /** Training info */
  allenamento?: AnamnestiAllenamento;
  /** Lifestyle info */
  stileVita?: StileVita;
  /** Client objective */
  obiettivo?: Obiettivo;
  /** Whether plan is deficit, surplus, or maintenance */
  energyBalance: "deficit" | "surplus" | "maintenance";
  /** Assumptions made during calculation */
  assumptions: string[];
}

// ── Body Composition Analysis ───────────────────────────────────────────────

/** Body fat classification thresholds (male / female) */
const BF_CLASSIFICATIONS = {
  male: [
    { max: 8, label: "essenziale", note: "livello molto basso — monitorare attentamente" },
    { max: 12, label: "atletico", note: "ottimo per performance e estetica" },
    { max: 18, label: "fitness", note: "buon equilibrio tra salute e composizione" },
    { max: 25, label: "medio", note: "margine di miglioramento nella composizione corporea" },
    { max: 100, label: "sopra la media", note: "priorità alla riduzione del grasso corporeo" },
  ],
  female: [
    { max: 14, label: "essenziale", note: "livello molto basso — monitorare attentamente" },
    { max: 20, label: "atletico", note: "ottimo per performance e estetica" },
    { max: 25, label: "fitness", note: "buon equilibrio tra salute e composizione" },
    { max: 32, label: "medio", note: "margine di miglioramento nella composizione corporea" },
    { max: 100, label: "sopra la media", note: "priorità alla riduzione del grasso corporeo" },
  ],
} as const;

/**
 * Classify body fat percentage by sex.
 */
function classifyBodyFat(
  bfPct: number,
  sex: "male" | "female"
): { label: string; note: string } {
  const thresholds = BF_CLASSIFICATIONS[sex];
  for (const t of thresholds) {
    if (bfPct <= t.max) return { label: t.label, note: t.note };
  }
  return { label: "non classificato", note: "" };
}

/**
 * Generate body composition analysis narrative.
 */
function generateBodyCompAnalysis(ctx: NarrativeContext): string {
  const { bodyComposition: bc, snapshot } = ctx;
  const classification = classifyBodyFat(bc.bodyFatPct, snapshot.sex);

  const lines: string[] = [];

  lines.push(
    `**Composizione Corporea Attuale**: Con un peso di ${snapshot.weightKg.toFixed(1)} kg ` +
      `e una percentuale di grasso corporeo del ${bc.bodyFatPct.toFixed(1)}%, ` +
      `la massa magra risulta di ${bc.leanMassKg.toFixed(1)} kg ` +
      `e la massa grassa di ${bc.fatMassKg.toFixed(1)} kg.`
  );

  lines.push(
    `\n**Classificazione**: Livello ${classification.label} — ${classification.note}.`
  );

  // Training day TDEE
  const trainingDay = ctx.weeklyPlan.days.find(
    (d) => d.dayType === "training"
  );
  const restDay = ctx.weeklyPlan.days.find((d) => d.dayType === "rest");

  if (trainingDay && restDay) {
    lines.push(
      `\n**Fabbisogno Energetico**: Il TDEE stimato è di ${Math.round(trainingDay.tdee.totalTdeeKcal)} kcal ` +
        `nei giorni di allenamento e ${Math.round(restDay.tdee.totalTdeeKcal)} kcal nei giorni di riposo. ` +
        `La media settimanale è di ${ctx.weeklyPlan.weeklyAverageKcal} kcal/giorno.`
    );
  }

  if (ctx.obiettivo) {
    const goalText =
      ctx.energyBalance === "deficit"
        ? "Il piano è impostato in deficit calorico per supportare la perdita di grasso preservando la massa magra."
        : ctx.energyBalance === "surplus"
          ? "Il piano è impostato in surplus calorico controllato per supportare la crescita muscolare."
          : "Il piano è impostato al mantenimento per ottimizzare la composizione corporea.";
    lines.push(`\n**Strategia Energetica**: ${goalText}`);
  }

  return lines.join("");
}

// ── Nutrition Strategy ──────────────────────────────────────────────────────

/**
 * Generate nutrition strategy explanation.
 */
function generateNutritionStrategy(ctx: NarrativeContext): string {
  const { weeklyPlan, snapshot } = ctx;
  const lines: string[] = [];

  // Unique day types in the plan
  const uniqueDayTypes = [
    ...new Set(weeklyPlan.days.map((d) => d.dayType)),
  ] as DayType[];

  const dayTypeLabels: Record<DayType, string> = {
    training: "Allenamento",
    rest: "Riposo",
    refeed: "Refeed",
    deload: "Deload",
    // #17 periodization intensity tiers (modes 3-4)
    training_light: "Allenamento Leggero",
    training_medium: "Allenamento Medio",
    training_intense: "Allenamento Intenso",
    training_double: "Doppia Seduta",
  };

  lines.push("**Struttura del Piano Nutrizionale**:");
  lines.push(
    `\nIl piano prevede ${uniqueDayTypes.length} tipologie di giornate: ` +
      uniqueDayTypes.map((dt) => dayTypeLabels[dt]).join(", ") +
      "."
  );

  // Macro summary per day type
  for (const dayType of uniqueDayTypes) {
    const day = weeklyPlan.days.find((d) => d.dayType === dayType);
    if (!day) continue;

    const m = day.macros;
    lines.push(
      `\n- **${dayTypeLabels[dayType]}**: ${Math.round(m.totalKcal)} kcal — ` +
        `P ${Math.round(m.proteinG)}g, C ${Math.round(m.carbG)}g, F ${Math.round(m.fatG)}g`
    );
  }

  // Protein rationale
  const trainingDay = weeklyPlan.days.find((d) => d.dayType === "training");
  if (trainingDay) {
    const pPerKgLbm =
      trainingDay.macros.proteinG /
      (snapshot.weightKg *
        (1 - ctx.bodyComposition.bodyFatPct / 100));
    lines.push(
      `\n**Proteine**: ${pPerKgLbm.toFixed(1)} g/kg di massa magra nei giorni di allenamento — ` +
        `ottimale per la sintesi proteica muscolare e il recupero.`
    );
  }

  // Hydration
  const firstDay = weeklyPlan.days[0];
  if (firstDay) {
    lines.push(
      `\n**Idratazione**: Target di ${firstDay.hydration.waterMl} ml di acqua ` +
        `e ${firstDay.hydration.saltG.toFixed(1)}g di sale al giorno.`
    );
  }

  return lines.join("");
}

// ── Training Notes ──────────────────────────────────────────────────────────

/**
 * Generate training-related notes.
 */
function generateTrainingNotes(ctx: NarrativeContext): string | undefined {
  if (!ctx.allenamento) return undefined;

  const { allenamento: a } = ctx;
  const lines: string[] = [];

  lines.push(
    `**Profilo Allenamento**: ${a.frequencyPerWeek} sessioni/settimana, ` +
      `${a.experienceYears} anni di esperienza.`
  );

  if (a.modalities.length > 0) {
    lines.push(
      `\nModalità principali: ${a.modalities.join(", ")}.`
    );
  }

  if (a.currentProgramme) {
    lines.push(`\nProgramma attuale: ${a.currentProgramme}.`);
  }

  if (a.limitations && a.limitations.length > 0) {
    lines.push(
      `\n**Limitazioni**: ${a.limitations.join(", ")}. ` +
        `Il piano nutrizionale tiene conto di queste limitazioni nell'allocazione energetica.`
    );
  }

  const trainingDays = ctx.snapshot.weekSchedule.filter(
    (d) => d === "training"
  ).length;
  lines.push(
    `\nI macronutrienti sono calibrati su ${trainingDays} giorni di allenamento e ` +
      `${7 - trainingDays} giorni di riposo/recupero nella settimana.`
  );

  return lines.join("");
}

// ── Assumption Disclosures ──────────────────────────────────────────────────

/** Standard assumptions that apply to all plans (excludes the dynamic BF% method line) */
const STANDARD_ASSUMPTIONS: readonly string[] = [
  "I valori dei pasti sono calcolati sui dati nutrizionali medi degli alimenti — possono variare in base alla marca e al metodo di preparazione.",
  "Il piano presuppone un'aderenza costante. Variazioni significative nell'attività fisica o nelle abitudini alimentari richiedono una rivalutazione.",
  "Gli integratori suggeriti non sostituiscono una dieta equilibrata e variata. Consultare il medico in caso di patologie o assunzione di farmaci.",
] as const;

/**
 * Generate coach notes including assumption disclosures.
 */
function generateCoachNotes(ctx: NarrativeContext): string {
  const lines: string[] = [];

  // Determine BF% method label from the assumptions already collected
  const bfMethodLabel = ctx.assumptions.some(a => a.includes("Jackson & Pollock 7"))
    ? "Jackson & Pollock 7 pliche per BF%"
    : ctx.assumptions.some(a => a.includes("Jackson & Pollock 3"))
    ? "Jackson & Pollock 3 pliche per BF%"
    : "formula euristica basata su BMI per BF%";

  const dynamicFormulaNote = `Le stime del fabbisogno energetico sono basate su formule validate (Katch-McArdle per BMR, ${bfMethodLabel}) e potrebbero richiedere aggiustamenti in base alla risposta individuale.`;

  // Assumption disclosures
  lines.push("**Premesse e Assunzioni del Piano**:\n");
  const allAssumptions = [dynamicFormulaNote, ...STANDARD_ASSUMPTIONS, ...ctx.assumptions];
  for (const assumption of allAssumptions) {
    lines.push(`- ${assumption}`);
  }

  // Monitoring instructions
  lines.push("\n\n**Istruzioni per il Monitoraggio**:\n");
  lines.push(
    "- Pesarsi ogni mattina a digiuno e calcolare la media settimanale."
  );
  lines.push(
    "- Compilare il check-in settimanale con peso, energia, sonno, fame, digestione e aderenza."
  );

  if (ctx.energyBalance === "deficit") {
    lines.push(
      "- Obiettivo: perdita di 0.5-1% del peso corporeo a settimana. Se il peso è stabile per 2+ settimane, contattare per un aggiustamento."
    );
  } else if (ctx.energyBalance === "surplus") {
    lines.push(
      "- Obiettivo: aumento di 0.25-0.5% del peso corporeo a settimana. Monitorare la circonferenza vita per controllare l'accumulo di grasso."
    );
  } else {
    lines.push(
      "- Monitorare la stabilità del peso e le variazioni di composizione corporea ogni 4 settimane."
    );
  }

  lines.push(
    "- Rivalutazione completa consigliata ogni 8-12 settimane o al raggiungimento dell'obiettivo intermedio."
  );

  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate the complete guidance section for a nutrition plan.
 *
 * Produces body composition analysis, nutrition strategy explanation,
 * training notes, and coach notes (with assumption disclosures and monitoring instructions).
 */
export function generateNarratives(ctx: NarrativeContext): GuidanceSection {
  return {
    bodyCompAnalysis: generateBodyCompAnalysis(ctx),
    nutritionStrategy: generateNutritionStrategy(ctx),
    trainingNotes: generateTrainingNotes(ctx),
    coachNotes: generateCoachNotes(ctx),
  };
}

/**
 * Generate default monitoring configuration based on energy balance.
 */
export function generateMonitoringConfig(
  energyBalance: "deficit" | "surplus" | "maintenance"
): MonitoringConfig {
  const baseMetrics = [
    "peso_corporeo",
    "energia",
    "sonno",
    "fame",
    "digestione",
    "aderenza_percentuale",
  ];

  switch (energyBalance) {
    case "deficit":
      return {
        checkInFrequencyDays: 7,
        metrics: [...baseMetrics, "circonferenza_vita", "foto_progresso"],
        reassessmentNotes:
          "Rivalutazione se il peso medio settimanale è stabile per 2+ settimane consecutive o se l'aderenza scende sotto l'80%.",
      };
    case "surplus":
      return {
        checkInFrequencyDays: 7,
        metrics: [...baseMetrics, "circonferenza_vita", "forza_esercizi_principali"],
        reassessmentNotes:
          "Rivalutazione se la circonferenza vita aumenta più di 1cm/mese o se il peso aumenta più dello 0.5%/settimana.",
      };
    case "maintenance":
      return {
        checkInFrequencyDays: 14,
        metrics: baseMetrics,
        reassessmentNotes:
          "Rivalutazione ogni 8-12 settimane o al cambiamento degli obiettivi.",
      };
  }
}
