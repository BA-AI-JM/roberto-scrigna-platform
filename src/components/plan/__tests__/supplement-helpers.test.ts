import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  libraryItemToEntry,
  coreSetEntries,
  customEntry,
  filterLibrary,
  groupByMacro,
} from "../supplement-helpers";
import { SupplementsEditor } from "../supplements-editor";
import { SUPPLEMENT_LIBRARY, getSupplement, CORE_SET } from "@/data/supplements/library";
import type { SupplementEntry } from "@/pdf/types";

describe("supplement-helpers", () => {
  test("libraryItemToEntry copies dose/timing as editable + sets libraryId, isCustom=false", () => {
    const creatine = getSupplement("creatine-monohydrate")!;
    const e = libraryItemToEntry(creatine);
    expect(e.libraryId).toBe("creatine-monohydrate");
    expect(e.name).toBe(creatine.name);
    expect(e.dosage).toBe(creatine.dose);
    expect(e.timing).toBe(creatine.timing);
    expect(e.isCustom).toBe(false);
  });

  test("coreSetEntries appends 4 in CORE_SET order when none present", () => {
    const entries = coreSetEntries([]);
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.libraryId)).toEqual([...CORE_SET]);
  });

  test("coreSetEntries skips items already present (by libraryId)", () => {
    const existing: SupplementEntry[] = [libraryItemToEntry(getSupplement("creatine-monohydrate")!)];
    const entries = coreSetEntries(existing);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.libraryId)).not.toContain("creatine-monohydrate");
  });

  test("customEntry is flagged isCustom with no libraryId", () => {
    const c = customEntry();
    expect(c.isCustom).toBe(true);
    expect(c.libraryId).toBeUndefined();
  });

  test("filterLibrary matches by name (case-insensitive); empty → full library", () => {
    expect(filterLibrary("")).toHaveLength(SUPPLEMENT_LIBRARY.length);
    expect(filterLibrary("CREATINE").some((s) => s.id === "creatine-monohydrate")).toBe(true);
    expect(filterLibrary("zzz-nope")).toHaveLength(0);
  });

  test("groupByMacro partitions the library by macroCategory", () => {
    const groups = groupByMacro([...SUPPLEMENT_LIBRARY]);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(SUPPLEMENT_LIBRARY.length);
  });
});

describe("SupplementsEditor render (node)", () => {
  const noop = () => {};

  test("empty supplements → default-zero empty state + toolbar", () => {
    const html = renderToStaticMarkup(
      createElement(SupplementsEditor, {
        supplements: [],
        onUpdate: noop,
        onRemove: noop,
        onAddEntries: noop,
      })
    );
    expect(html).toContain("Nessun integratore");
    expect(html).toContain("Aggiungi dalla libreria");
    expect(html).toContain("Set di base");
  });

  test("with items → renders Rimuovi + library/custom badges", () => {
    const supplements: SupplementEntry[] = [
      libraryItemToEntry(getSupplement("vitamin-d")!),
      customEntry(),
    ];
    const html = renderToStaticMarkup(
      createElement(SupplementsEditor, {
        supplements,
        onUpdate: noop,
        onRemove: noop,
        onAddEntries: noop,
      })
    );
    expect(html).toContain("Rimuovi");
    expect(html).toContain("Libreria");
    expect(html).toContain("Personalizzato");
  });
});
