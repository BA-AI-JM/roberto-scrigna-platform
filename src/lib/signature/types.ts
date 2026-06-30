/**
 * Shared types for the patient SES signing screen (#29).
 *
 * SignatureDocument is the EXACT shape the data seam returns — it is produced
 * today by the fetchSignatureDocument adapter and, after PR #45 lands, by the
 * typed signature.getSignatureDocument procedure (a one-line swap in the
 * adapter). The screen depends only on this shape, never on how it's fetched.
 */
export interface SignatureDocument {
  requestId: string;
  status: string;
  documentName: string;
  versionNumber: number;
  versionLabel: string;
  language: string;
  contentHash: string;
  bodyMd: string;
  practitionerName: string;
  patientName: string;
  /** Tokens with no value supplied (e.g. "{{codice_fiscale}}"). */
  missingTokens: string[];
  /** Human-readable placeholder gaps to surface (not hide) before signing. */
  pendingPlaceholders: string[];
}

/** Request-lifecycle facts (from signature.getSignatureRequest, already on #43). */
export interface SignatureRequestMeta {
  id: string;
  document_version_id: string;
  provider: string;
  status: string;
  accepted_at: string | null;
  acceptance_method: string | null;
  created_at: string;
}
