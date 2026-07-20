import { describe, expect, it } from "vitest";
import { humanizeTrpcError } from "./human-error";

describe("humanizeTrpcError", () => {
  it("translates the exact zod payload from the reproduced kcal bug", () => {
    // Captured live 2026-07-20: maintenanceKcalEstimate=0 → plan.generate
    const raw = JSON.stringify([
      {
        origin: "number",
        code: "too_small",
        minimum: 0,
        inclusive: false,
        path: ["maintenanceKcalEstimate"],
        message: "Too small: expected number to be >0",
      },
    ]);
    expect(humanizeTrpcError(raw)).toBe(
      "Valore non valido — Stima kcal mantenimento: deve essere maggiore di 0. Correggi e riprova.",
    );
  });

  it("labels nested macro-override paths by their field name", () => {
    const raw = JSON.stringify([
      {
        code: "too_big",
        maximum: 800,
        inclusive: true,
        path: ["macroOverrides", "training", "proteinG"],
      },
    ]);
    expect(humanizeTrpcError(raw)).toBe(
      "Valore non valido — Proteine (g): deve essere al massimo 800. Correggi e riprova.",
    );
  });

  it("caps at three issues and counts the rest", () => {
    const issue = { code: "invalid_type", path: ["weightKg"] };
    const raw = JSON.stringify([issue, issue, issue, issue, issue]);
    const out = humanizeTrpcError(raw);
    expect(out).toContain("Peso (kg): non è un valore valido");
    expect(out).toContain("(+2 altri)");
  });

  it("passes non-zod messages through unchanged", () => {
    expect(humanizeTrpcError("UNAUTHORIZED")).toBe("UNAUTHORIZED");
    expect(humanizeTrpcError("Errore nel caricamento del piano")).toBe(
      "Errore nel caricamento del piano",
    );
  });

  it("passes malformed JSON through unchanged", () => {
    expect(humanizeTrpcError("[not json")).toBe("[not json");
  });

  it("returns the fallback for empty input", () => {
    expect(humanizeTrpcError(undefined)).toBe("Errore imprevisto. Riprova.");
    expect(humanizeTrpcError("", "x")).toBe("x");
  });
});
