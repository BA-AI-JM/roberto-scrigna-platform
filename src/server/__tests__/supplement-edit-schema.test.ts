import { describe, test, expect } from "vitest";
import { supplementEditItemSchema } from "../schemas/supplement-edit-schema";

describe("supplementEditItemSchema — saveEdits supplement round-trip (#23)", () => {
  test("preserves the extended fields (notes/frequency/libraryId/isCustom) — not stripped", () => {
    const input = {
      name: "Creatine monohydrate",
      dosage: "5 g",
      timing: "post-workout",
      rationale: "power & recovery",
      notes: "morning fasted",
      frequency: "daily",
      libraryId: "creatine-monohydrate",
      isCustom: false,
    };
    const parsed = supplementEditItemSchema.parse(input);
    expect(parsed).toEqual(input);
    expect(parsed.notes).toBe("morning fasted");
    expect(parsed.libraryId).toBe("creatine-monohydrate");
    expect(parsed.isCustom).toBe(false);
    expect(parsed.frequency).toBe("daily");
  });

  test("custom item: isCustom true, libraryId absent", () => {
    const parsed = supplementEditItemSchema.parse({
      name: "Tisana personalizzata",
      dosage: "1 tazza",
      timing: "sera",
      isCustom: true,
    });
    expect(parsed.isCustom).toBe(true);
    expect(parsed.libraryId).toBeUndefined();
  });

  test("legacy {name,dosage,timing,rationale} still valid (back-compat)", () => {
    const parsed = supplementEditItemSchema.parse({
      name: "Whey",
      dosage: "30 g",
      timing: "mattina",
      rationale: "proteine",
    });
    expect(parsed.name).toBe("Whey");
    expect("notes" in parsed).toBe(false);
  });

  test("still strips genuinely-unknown keys", () => {
    const parsed = supplementEditItemSchema.parse({
      name: "X",
      dosage: "",
      timing: "",
      bogus: "drop me",
    } as Record<string, unknown>);
    expect("bogus" in parsed).toBe(false);
  });

  test("rejects wrong types (isCustom must be boolean)", () => {
    expect(() =>
      supplementEditItemSchema.parse({
        name: "X",
        dosage: "",
        timing: "",
        isCustom: "yes",
      } as Record<string, unknown>)
    ).toThrow();
  });
});
