/**
 * Engagement-letter fill service (Requirement #29, Stage 1) — PURE, no I/O.
 *
 * Merges a client's + professional's details into a published template body by
 * replacing `{{merge_token}}` slots. Reports which tokens could not be filled
 * (e.g. codice fiscale / residenza we don't hold) and which `[PLACEHOLDER: ...]`
 * fields Roberto still owes — both surface as gaps in the rendered preview.
 *
 * The Puppeteer step lives in legal-letter-pdf.ts so this stays trivially testable.
 */

import { MERGE_TOKENS, type MergeToken } from "./legal-templates";

export type MergeValues = Partial<Record<MergeToken, string | null | undefined>>;

export interface FilledLetter {
  filledMd: string;
  /** Merge tokens still present (no value supplied) — shown as gaps in preview. */
  missingTokens: MergeToken[];
  /** Distinct `[PLACEHOLDER: ...]` labels Roberto still has to provide. */
  pendingPlaceholders: string[];
}

/** Replace the merge tokens we have values for; leave the rest as visible gaps. */
export function fillEngagementLetter(bodyMd: string, values: MergeValues): FilledLetter {
  let filledMd = bodyMd;

  for (const token of MERGE_TOKENS) {
    const value = values[token];
    if (typeof value === "string" && value.trim() !== "") {
      filledMd = filledMd.split(`{{${token}}}`).join(value.trim());
    }
  }

  const missingTokens = MERGE_TOKENS.filter((t) => filledMd.includes(`{{${t}}}`));
  const pendingPlaceholders = extractPendingPlaceholders(filledMd);

  return { filledMd, missingTokens, pendingPlaceholders };
}

/** Distinct `[PLACEHOLDER: ...]` markers remaining in a body, in document order. */
export function extractPendingPlaceholders(md: string): string[] {
  const matches = md.match(/\[PLACEHOLDER:[^\]]*\]/g) ?? [];
  return [...new Set(matches)];
}
