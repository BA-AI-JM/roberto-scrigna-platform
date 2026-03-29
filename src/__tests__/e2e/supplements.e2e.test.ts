/**
 * E2E: Supplement auto-selection clinical sensibility.
 *
 * Tests that the supplement protocol system selects clinically sensible
 * supplements based on client context: training frequency, body fat,
 * caloric deficit/surplus, stress, sleep, and experience level.
 */

import {
  buildSupplementContext,
  generateSupplementProtocol,
  MASTER_SUPPLEMENTS,
  type SupplementContext,
} from "../../services/supplements";
import {
  estimateBodyFat,
  type ClientSnapshot,
} from "../../engine/index";
import type { AnamnestiAllenamento, StileVita } from "../../pdf/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseSnapshot: ClientSnapshot = {
  sex: "male",
  ageYears: 30,
  weightKg: 80,
  heightCm: 180,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

const highTrainingSnapshot: ClientSnapshot = {
  ...baseSnapshot,
  weekSchedule: ["training", "training", "rest", "training", "training", "training", "rest"],
};

const highBfSnapshot: ClientSnapshot = {
  ...baseSnapshot,
  bodyFatPctOverride: 22,
};

// ── Helper ──────────────────────────────────────────────────────────────────

/**
 * Build supplement context with customizable parameters.
 */
function buildCtx(params: {
  snapshot?: ClientSnapshot;
  weeklyAverageKcal?: number;
  maintenanceKcal?: number;
  allenamento?: AnamnestiAllenamento;
  stileVita?: StileVita;
}): SupplementContext {
  const snapshot = params.snapshot ?? baseSnapshot;
  const bf = estimateBodyFat(snapshot);
  return buildSupplementContext({
    bodyComposition: bf.bodyComposition,
    snapshot,
    weeklyAverageKcal: params.weeklyAverageKcal ?? 2500,
    maintenanceKcal: params.maintenanceKcal ?? 2500,
    allenamento: params.allenamento,
    stileVita: params.stileVita,
  });
}

// ── Foundation Supplements ──────────────────────────────────────────────────

describe("Supplements — Foundation (Always Included)", () => {
  test("foundation supplements always present regardless of context", () => {
    const ctx = buildCtx({});
    const protocol = generateSupplementProtocol(ctx);
    const names = protocol.map((s) => s.name);
    expect(names).toContain("Proteine Whey Isolate");
    expect(names).toContain("Multivitaminico completo");
    expect(names).toContain("Omega-3 (EPA/DHA)");
    expect(names).toContain("Vitamina D3");
  });

  test("foundation supplements are priority 1 and appear first", () => {
    const ctx = buildCtx({});
    const protocol = generateSupplementProtocol(ctx);
    // First 4 should be foundation (priority 1, category 0)
    const first4 = protocol.slice(0, 4);
    first4.forEach((s) => {
      const master = MASTER_SUPPLEMENTS.find((m) => m.name === s.name);
      expect(master).toBeDefined();
      expect(master!.priority).toBe(1);
      expect(master!.category).toBe("foundation");
    });
  });
});

// ── Performance Supplements ─────────────────────────────────────────────────

describe("Supplements — Performance (Training-Dependent)", () => {
  test("creatine included at ≥3 training days/week", () => {
    const ctx = buildCtx({}); // 3 training days
    const protocol = generateSupplementProtocol(ctx);
    const names = protocol.map((s) => s.name);
    expect(names).toContain("Creatina monoidrato");
  });

  test("caffeine included at ≥3 training days/week", () => {
    const ctx = buildCtx({}); // 3 training days
    const protocol = generateSupplementProtocol(ctx);
    const names = protocol.map((s) => s.name);
    expect(names).toContain("Caffeina");
  });

  test("citrulline included at ≥4 training days/week", () => {
    const ctx = buildCtx({ snapshot: highTrainingSnapshot }); // 5 training days
    const protocol = generateSupplementProtocol(ctx);
    const names = protocol.map((s) => s.name);
    expect(names).toContain("Citrullina malato");
  });

  test("citrulline NOT included at 3 training days/week", () => {
    const ctx = buildCtx({}); // 3 training days
    const protocol = generateSupplementProtocol(ctx);
    const names = protocol.map((s) => s.name);
    expect(names).not.toContain("Citrullina malato");
  });

  test("beta-alanine requires ≥4 training days AND ≥2 years experience", () => {
    // 5 training days, 3 years experience → included
    const ctxWith = buildCtx({
      snapshot: highTrainingSnapshot,
      allenamento: {
        frequencyPerWeek: 5,
        modalities: ["resistance"],
        experienceYears: 3,
      },
    });
    expect(generateSupplementProtocol(ctxWith).map((s) => s.name)).toContain(
      "Beta-alanina"
    );

    // 5 training days, 1 year experience → excluded
    const ctxWithout = buildCtx({
      snapshot: highTrainingSnapshot,
      allenamento: {
        frequencyPerWeek: 5,
        modalities: ["resistance"],
        experienceYears: 1,
      },
    });
    expect(generateSupplementProtocol(ctxWithout).map((s) => s.name)).not.toContain(
      "Beta-alanina"
    );
  });
});

// ── Recovery Supplements ────────────────────────────────────────────────────

describe("Supplements — Recovery", () => {
  test("magnesium included at ≥3 training days", () => {
    const ctx = buildCtx({});
    const protocol = generateSupplementProtocol(ctx);
    expect(protocol.map((s) => s.name)).toContain("Magnesio (bisglicinato)");
  });

  test("zinc included for males regardless of training frequency", () => {
    const ctx = buildCtx({});
    const protocol = generateSupplementProtocol(ctx);
    expect(protocol.map((s) => s.name)).toContain("Zinco");
  });

  test("glutamine requires deficit AND ≥4 training days", () => {
    // In deficit + 5 training days → included
    const ctxDeficit = buildCtx({
      snapshot: highTrainingSnapshot,
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
    });
    expect(generateSupplementProtocol(ctxDeficit).map((s) => s.name)).toContain(
      "L-Glutammina"
    );

    // Not in deficit → excluded
    const ctxMaint = buildCtx({
      snapshot: highTrainingSnapshot,
      weeklyAverageKcal: 2500,
      maintenanceKcal: 2500,
    });
    expect(generateSupplementProtocol(ctxMaint).map((s) => s.name)).not.toContain(
      "L-Glutammina"
    );
  });
});

// ── Body Composition Supplements ────────────────────────────────────────────

describe("Supplements — Body Composition (Deficit-Focused)", () => {
  test("fiber supplement included in deficit", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
    });
    const protocol = generateSupplementProtocol(ctx);
    expect(protocol.map((s) => s.name)).toContain("Integratore di fibre (psyllium)");
  });

  test("fiber supplement NOT included at maintenance", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2500,
      maintenanceKcal: 2500,
    });
    const protocol = generateSupplementProtocol(ctx);
    expect(protocol.map((s) => s.name)).not.toContain(
      "Integratore di fibre (psyllium)"
    );
  });

  test("carnitine requires deficit AND BF% > 15", () => {
    // Deficit + 16% BF → included
    const ctx = buildCtx({
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).toContain(
      "L-Carnitina"
    );

    // No deficit → excluded
    const ctxMaint = buildCtx({});
    expect(generateSupplementProtocol(ctxMaint).map((s) => s.name)).not.toContain(
      "L-Carnitina"
    );
  });

  test("CLA requires deficit AND BF% > 18", () => {
    // Deficit + 22% BF → included
    const ctx = buildCtx({
      snapshot: highBfSnapshot,
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).toContain(
      "CLA (Acido Linoleico Coniugato)"
    );

    // Deficit + 16% BF → excluded
    const ctxLowBf = buildCtx({
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
    });
    expect(generateSupplementProtocol(ctxLowBf).map((s) => s.name)).not.toContain(
      "CLA (Acido Linoleico Coniugato)"
    );
  });
});

// ── Sleep & Stress Supplements ──────────────────────────────────────────────

describe("Supplements — Sleep & Stress", () => {
  test("melatonin included with poor sleep (<7h)", () => {
    const ctx = buildCtx({
      stileVita: {
        occupation: "Impiegato",
        sleepHours: 6,
        stressLevel: 3,
      },
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).toContain(
      "Melatonina"
    );
  });

  test("melatonin included with high stress (≥7)", () => {
    const ctx = buildCtx({
      stileVita: {
        occupation: "Impiegato",
        sleepHours: 8,
        stressLevel: 8,
      },
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).toContain(
      "Melatonina"
    );
  });

  test("melatonin NOT included with good sleep and low stress", () => {
    const ctx = buildCtx({
      stileVita: {
        occupation: "Impiegato",
        sleepHours: 8,
        stressLevel: 3,
      },
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).not.toContain(
      "Melatonina"
    );
  });

  test("ashwagandha requires stress≥6 AND ≥3 training days", () => {
    const ctx = buildCtx({
      stileVita: {
        occupation: "Impiegato",
        sleepHours: 7,
        stressLevel: 7,
      },
    });
    expect(generateSupplementProtocol(ctx).map((s) => s.name)).toContain(
      "Ashwagandha (KSM-66)"
    );

    // Low stress → excluded
    const ctxLowStress = buildCtx({
      stileVita: {
        occupation: "Impiegato",
        sleepHours: 7,
        stressLevel: 4,
      },
    });
    expect(
      generateSupplementProtocol(ctxLowStress).map((s) => s.name)
    ).not.toContain("Ashwagandha (KSM-66)");
  });
});

// ── Deficit/Surplus Detection ───────────────────────────────────────────────

describe("Supplements — Deficit/Surplus Context", () => {
  test("deficit detected when weekly avg < 95% maintenance", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2300,
      maintenanceKcal: 2500,
    });
    expect(ctx.isDeficit).toBe(true);
    expect(ctx.isSurplus).toBe(false);
  });

  test("surplus detected when weekly avg > 105% maintenance", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2700,
      maintenanceKcal: 2500,
    });
    expect(ctx.isDeficit).toBe(false);
    expect(ctx.isSurplus).toBe(true);
  });

  test("maintenance: neither deficit nor surplus within ±5%", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2500,
      maintenanceKcal: 2500,
    });
    expect(ctx.isDeficit).toBe(false);
    expect(ctx.isSurplus).toBe(false);
  });

  test("at 95% exactly: not deficit (threshold is <)", () => {
    const ctx = buildCtx({
      weeklyAverageKcal: 2375,
      maintenanceKcal: 2500,
    });
    // 2375 / 2500 = 0.95, so 2375 < 2375 is false
    expect(ctx.isDeficit).toBe(false);
  });
});

// ── Protocol Sort Order ─────────────────────────────────────────────────────

describe("Supplements — Sort Order", () => {
  test("protocol is sorted by priority first, then category", () => {
    const ctx = buildCtx({
      snapshot: highTrainingSnapshot,
      weeklyAverageKcal: 2000,
      maintenanceKcal: 2500,
      stileVita: {
        occupation: "Manager",
        sleepHours: 6,
        stressLevel: 8,
      },
      allenamento: {
        frequencyPerWeek: 5,
        modalities: ["resistance", "cardio"],
        experienceYears: 4,
      },
    });
    const protocol = generateSupplementProtocol(ctx);

    // Check that priority never decreases
    let lastPriority = 0;
    for (const entry of protocol) {
      const master = MASTER_SUPPLEMENTS.find((m) => m.name === entry.name);
      expect(master).toBeDefined();
      expect(master!.priority).toBeGreaterThanOrEqual(lastPriority);
      lastPriority = master!.priority;
    }
  });

  test("all entries have name, dosage, timing, and rationale", () => {
    const ctx = buildCtx({});
    const protocol = generateSupplementProtocol(ctx);
    protocol.forEach((entry) => {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.dosage.length).toBeGreaterThan(0);
      expect(entry.timing.length).toBeGreaterThan(0);
      expect(entry.rationale).toBeDefined();
      expect(entry.rationale!.length).toBeGreaterThan(0);
    });
  });
});
