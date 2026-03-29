import {
  parseFoodCsv,
  parseItalianNumber,
  InMemoryCsvDataSource,
} from "../parser";

// ── Italian Number Parsing ────────────────────────────────────────────────────

describe("parseItalianNumber", () => {
  test("integer", () => {
    expect(parseItalianNumber("100")).toBe(100);
  });

  test("Italian decimal (comma)", () => {
    expect(parseItalianNumber("12,5")).toBe(12.5);
  });

  test("standard decimal (dot)", () => {
    expect(parseItalianNumber("12.5")).toBe(12.5);
  });

  test("leading/trailing whitespace", () => {
    expect(parseItalianNumber("  42,3  ")).toBe(42.3);
  });

  test("empty string → NaN", () => {
    expect(parseItalianNumber("")).toBeNaN();
  });

  test("TBD → NaN", () => {
    expect(parseItalianNumber("TBD")).toBeNaN();
    expect(parseItalianNumber("tbd")).toBeNaN();
  });

  test("dash → NaN", () => {
    expect(parseItalianNumber("-")).toBeNaN();
  });

  test("n/a → NaN", () => {
    expect(parseItalianNumber("n/a")).toBeNaN();
  });

  test("zero", () => {
    expect(parseItalianNumber("0")).toBe(0);
    expect(parseItalianNumber("0,0")).toBe(0);
  });
});

// ── CSV Parsing ───────────────────────────────────────────────────────────────

const SAMPLE_CSV = `Nome;Kcal;Proteine;Carboidrati;Grassi;Categoria
Petto di Pollo;165;31;0;3,6;proteine
Riso Basmati;350;7,5;77;0,9;cereali
Avocado;160;2;8,5;14,7;grassi
Olio Extra Vergine;884;0;0;100;condimenti
Banana;89;1,1;22,8;0,3;frutta`;

describe("parseFoodCsv", () => {
  test("parses valid CSV with Italian decimals", () => {
    const result = parseFoodCsv(SAMPLE_CSV);
    expect(result.items.length).toBeGreaterThanOrEqual(5);
    expect(result.warnings).toHaveLength(0);
    expect(result.totalRowsProcessed).toBe(5);
  });

  test("first item is Petto di Pollo", () => {
    const result = parseFoodCsv(SAMPLE_CSV);
    const chicken = result.items.find((i) => i.id === "petto-di-pollo");
    expect(chicken).toBeDefined();
    expect(chicken!.kcalPer100g).toBe(165);
    expect(chicken!.proteinPer100g).toBe(31);
    expect(chicken!.carbsPer100g).toBe(0);
    expect(chicken!.fatPer100g).toBe(3.6);
    expect(chicken!.category).toBe("proteine");
  });

  test("handles Italian decimal in macros", () => {
    const result = parseFoodCsv(SAMPLE_CSV);
    const rice = result.items.find((i) => i.id === "riso-basmati");
    expect(rice).toBeDefined();
    expect(rice!.proteinPer100g).toBe(7.5);
    expect(rice!.fatPer100g).toBe(0.9);
  });

  test("adds rice cakes entry when missing", () => {
    const result = parseFoodCsv(SAMPLE_CSV);
    const riceCakes = result.items.find((i) => i.id === "gallette-di-riso");
    expect(riceCakes).toBeDefined();
    expect(riceCakes!.kcalPer100g).toBe(387);
    expect(riceCakes!.proteinPer100g).toBe(8);
    expect(riceCakes!.carbsPer100g).toBe(82);
    expect(riceCakes!.fatPer100g).toBe(2.8);
  });

  test("does not duplicate rice cakes if present in CSV", () => {
    const csvWithRiceCakes = SAMPLE_CSV + "\nGallette di Riso;387;8;82;2,8;cereali";
    const result = parseFoodCsv(csvWithRiceCakes);
    const riceCakes = result.items.filter(
      (i) => i.name.toLowerCase().includes("gallette")
    );
    expect(riceCakes).toHaveLength(1);
  });

  test("respects addRiceCakes=false", () => {
    const result = parseFoodCsv(SAMPLE_CSV, { addRiceCakes: false });
    const riceCakes = result.items.find((i) => i.id === "gallette-di-riso");
    expect(riceCakes).toBeUndefined();
  });
});

// ── Skipping Invalid Rows ─────────────────────────────────────────────────────

describe("Invalid row handling", () => {
  test("skips rows with TBD values", () => {
    const csv = `Nome;Kcal;Proteine;Carboidrati;Grassi
Valid Food;100;10;20;5
TBD Food;TBD;TBD;TBD;TBD
Another Valid;200;20;30;10`;
    const result = parseFoodCsv(csv);
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain("Invalid numeric data");
  });

  test("skips empty name rows", () => {
    const csv = `Nome;Kcal;Proteine;Carboidrati;Grassi
Valid;100;10;20;5
;100;10;20;5
-;100;10;20;5`;
    const result = parseFoodCsv(csv);
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });

  test("skips rows with insufficient columns", () => {
    const csv = `Nome;Kcal;Proteine;Carboidrati;Grassi
Valid;100;10;20;5
Short;100;10`;
    const result = parseFoodCsv(csv);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain("Insufficient columns");
  });

  test("handles mixed valid and invalid rows", () => {
    const csv = `Nome;Kcal;Proteine;Carboidrati;Grassi
Pollo;165;31;0;3,6
;TBD;TBD;TBD;TBD
Riso;350;7,5;77;0,9
Bad Row
TBD;100;10;20;5
Avocado;160;2;8,5;14,7`;
    const result = parseFoodCsv(csv);
    // 3 valid items + rice cakes
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(3);
    // 3 warnings: empty name, insufficient columns, TBD name
    expect(result.warnings).toHaveLength(3);
  });
});

// ── Data Source Interface ─────────────────────────────────────────────────────

describe("InMemoryCsvDataSource", () => {
  test("loads data via interface", async () => {
    const source = new InMemoryCsvDataSource(SAMPLE_CSV);
    expect(source.name).toBe("In-Memory CSV");
    const result = await source.load();
    expect(result.items.length).toBeGreaterThan(0);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("handles Windows line endings", () => {
    const csv = "Nome;Kcal;Proteine;Carboidrati;Grassi\r\nPollo;165;31;0;3,6\r\n";
    const result = parseFoodCsv(csv);
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(1);
  });

  test("handles no header option", () => {
    const csv = "Pollo;165;31;0;3,6";
    const result = parseFoodCsv(csv, { hasHeader: false });
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(1);
  });

  test("custom delimiter", () => {
    const csv = "Nome,Kcal,Proteine,Carboidrati,Grassi\nPollo,165,31,0,3.6";
    const result = parseFoodCsv(csv, { delimiter: "," });
    expect(result.items.filter((i) => i.id !== "gallette-di-riso")).toHaveLength(1);
  });

  test("generates stable IDs", () => {
    const csv = `Nome;Kcal;Proteine;Carboidrati;Grassi
Petto di Pollo;165;31;0;3,6`;
    const result1 = parseFoodCsv(csv);
    const result2 = parseFoodCsv(csv);
    expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    expect(result1.items[0]!.id).toBe("petto-di-pollo");
  });

  test("empty CSV returns no items with no errors", () => {
    const result = parseFoodCsv("Nome;Kcal;Proteine;Carboidrati;Grassi");
    // Just rice cakes auto-added
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("gallette-di-riso");
  });
});
