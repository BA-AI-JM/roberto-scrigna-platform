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

import { MERGE_TOKENS, MERGE_TOKEN_LABELS, type MergeToken } from "./legal-templates";

export type MergeValues = Partial<Record<MergeToken, string | null | undefined>>;

export interface FilledLetter {
  filledMd: string;
  /** Merge tokens present in the body with no value — shown as gaps in preview. */
  missingTokens: MergeToken[];
  /** Distinct `[PLACEHOLDER: ...]` labels still present (legacy/unmigrated bodies). */
  pendingPlaceholders: string[];
}

/**
 * Fill the merge tokens we have values for; render every UNfilled slot as a clear
 * "[DA COMPLETARE: <label>]" gap (never blank or a raw `{{token}}`) and report it in
 * missingTokens so the UI can prompt the coach to complete his practice profile.
 * A token that doesn't appear in this body is neither filled nor reported.
 */
export function fillEngagementLetter(bodyMd: string, values: MergeValues): FilledLetter {
  let filledMd = bodyMd;
  const missingTokens: MergeToken[] = [];

  for (const token of MERGE_TOKENS) {
    const slot = `{{${token}}}`;
    if (!filledMd.includes(slot)) continue; // token not used by this template body
    const value = values[token];
    if (typeof value === "string" && value.trim() !== "") {
      filledMd = filledMd.split(slot).join(value.trim());
    } else {
      missingTokens.push(token);
      filledMd = filledMd.split(slot).join(`[DA COMPLETARE: ${MERGE_TOKEN_LABELS[token]}]`);
    }
  }

  const pendingPlaceholders = extractPendingPlaceholders(filledMd);

  return { filledMd, missingTokens, pendingPlaceholders };
}

/** Distinct `[PLACEHOLDER: ...]` markers remaining in a body, in document order. */
export function extractPendingPlaceholders(md: string): string[] {
  const matches = md.match(/\[PLACEHOLDER:[^\]]*\]/g) ?? [];
  return [...new Set(matches)];
}
