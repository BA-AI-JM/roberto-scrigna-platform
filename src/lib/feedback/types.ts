/**
 * Shared types for the patient urgent-feedback + injury-report flow (#28).
 *
 * These shapes are produced/consumed today by the urgent-feedback adapter and,
 * after the parallel backend lands feedback.submitUrgent / getMyUrgentSubmissions,
 * by those typed procedures (a one-line swap in the adapter).
 */
export type UrgentKind = "feedback" | "infortunio";

/** Structured injury detail, present only when kind === "infortunio". */
export interface InjuryDetails {
  area: string; // zona / area
  severity: string; // gravità: lieve | moderata | grave
  onsetDate: string; // data di insorgenza (YYYY-MM-DD)
  limitations?: string; // limitazioni (optional)
}

export interface UrgentSubmissionInput {
  kind: UrgentKind;
  message: string;
  injury?: InjuryDetails;
}

export interface UrgentSubmission {
  id: string;
  kind: UrgentKind;
  message: string;
  /** Lifecycle: "aperto" | "gestito" (tolerant of other server values). */
  status: string;
  createdAt: string;
  injury?: InjuryDetails | null;
}
