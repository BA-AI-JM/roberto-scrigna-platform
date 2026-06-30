/**
 * Engagement-letter fill service (Req #29, Stage 1) — pure, no I/O.
 */

import { describe, test, expect } from "vitest";
import { fillEngagementLetter, extractPendingPlaceholders } from "../legal-letter";

const BODY =
  "**{{professional_name}}** e **{{client_full_name}}**, C.F. {{client_codice_fiscale}}, " +
  "residente in {{client_residence}}. Data: {{generated_date}}. Albo n. [PLACEHOLDER: numero iscrizione], " +
  "P.IVA [PLACEHOLDER: partita IVA].";

describe("fillEngagementLetter", () => {
  test("replaces provided tokens and reports unfilled ones as gaps", () => {
    const { filledMd, missingTokens, pendingPlaceholders } = fillEngagementLetter(BODY, {
      client_full_name: "Mario Rossi",
      professional_name: "Roberto Scrigna",
      generated_date: "30/06/2026",
    });

    expect(filledMd).toContain("Mario Rossi");
    expect(filledMd).toContain("Roberto Scrigna");
    expect(filledMd).toContain("30/06/2026");
    expect(filledMd).not.toContain("{{client_full_name}}");

    // not held → still tokens (will render as visible gaps)
    expect(filledMd).toContain("{{client_codice_fiscale}}");
    expect(missingTokens).toEqual(
      expect.arrayContaining(["client_codice_fiscale", "client_residence"])
    );
    expect(missingTokens).not.toContain("client_full_name");

    expect(pendingPlaceholders).toEqual([
      "[PLACEHOLDER: numero iscrizione]",
      "[PLACEHOLDER: partita IVA]",
    ]);
  });

  test("treats empty/whitespace values as not provided", () => {
    const { missingTokens } = fillEngagementLetter("{{client_full_name}}", {
      client_full_name: "   ",
    });
    expect(missingTokens).toContain("client_full_name");
  });

  test("extractPendingPlaceholders dedupes", () => {
    const out = extractPendingPlaceholders("[PLACEHOLDER: a] x [PLACEHOLDER: a] y [PLACEHOLDER: b]");
    expect(out).toEqual(["[PLACEHOLDER: a]", "[PLACEHOLDER: b]"]);
  });
});
