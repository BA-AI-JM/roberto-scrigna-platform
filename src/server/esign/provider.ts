/**
 * E-signature provider contract (Requirement #29 — DESIGN-AHEAD ONLY).
 *
 * #29 is Tier 2: the app generates + versions the engagement letter (Stage 1,
 * shipped), and the binding SIGNATURE is delegated to a third-party EU eIDAS
 * e-signature provider in Stage 2. This file is the typed seam so that work
 * plugs in cleanly — it defines the contract ONLY.
 *
 * NOT IMPLEMENTED HERE. No adapter, no HTTP, no webhook handler, no signing
 * flow. Stage 2 will:
 *   1. implement a MockEsignProvider against this interface (test-first),
 *   2. then a real adapter — provider TBD (candidates: Yousign, e-Signature.eu,
 *      Namirial) — selected for eIDAS QES/AES support, EU data residency and
 *      Italian-market fit,
 *   3. add the persistence (a signature_request table) + webhook route + the
 *      portal signing flow.
 *
 * Design intent captured now so Stage 2 has a stable boundary:
 *   - The provider is handed a generated letter PDF + signer identity and returns
 *     a hosted signing URL; it never sees our DB.
 *   - Status is pulled (getStatus) AND pushed (parseWebhookEvent) — the app must
 *     tolerate both and treat the signed artifact as the source of truth.
 *   - The signed document (with its audit trail / certificate) is downloaded and
 *     retained as the legally binding copy.
 */

/** Lifecycle of a signature request, normalised across providers. */
export type SignatureStatus =
  | "created" // request created, signer not yet notified/started
  | "pending" // sent to signer, awaiting signature
  | "signed" // completed — signed document available
  | "declined" // signer refused
  | "expired" // request lapsed
  | "error"; // provider-side failure

export interface Signer {
  fullName: string;
  email: string;
  /** E.164 phone, when the provider uses SMS OTP as the signature factor. */
  phone?: string;
}

export interface CreateSignatureRequestInput {
  /** Our legal_document_version.id — round-tripped so webhooks can be correlated. */
  documentVersionId: string;
  /** Our client.id the letter was generated for. */
  clientId: string;
  /** The generated, filled engagement-letter PDF to be signed. */
  pdf: Uint8Array;
  /** Human-facing title shown in the signing UI. */
  title: string;
  /** ISO language for the signing UI (e.g. "it"). */
  language: string;
  signer: Signer;
  /** Where to send the signer after completion, if the provider supports it. */
  redirectUrl?: string;
}

export interface SignatureRequest {
  /** The provider's opaque request id (persisted by the app). */
  providerRequestId: string;
  status: SignatureStatus;
  /** Hosted URL the signer is sent to (when status is created/pending). */
  signingUrl?: string;
  /** ISO timestamp from the provider. */
  createdAt: string;
}

export interface SignatureStatusResult {
  providerRequestId: string;
  status: SignatureStatus;
  /** ISO timestamp when signed, if completed. */
  signedAt?: string;
  /** Whether downloadSignedDocument() will yield the signed artifact. */
  signedDocumentAvailable: boolean;
}

export interface SignedDocument {
  bytes: Uint8Array;
  contentType: string; // typically "application/pdf"
  providerRequestId: string;
  /** Provider audit-trail / completion-certificate URL, when available. */
  certificateUrl?: string;
}

/** A provider webhook payload normalised to the minimum the app needs to act. */
export interface SignatureWebhookEvent {
  providerRequestId: string;
  status: SignatureStatus;
  signedAt?: string;
  /** The raw, verified payload for audit/debugging. */
  raw: unknown;
}

/**
 * The Stage-2 boundary. A concrete adapter (mock first, then a real eIDAS
 * provider) implements this; the app depends only on this interface.
 */
export interface EsignProvider {
  /** Stable identifier for the active provider (e.g. "mock", "yousign"). */
  readonly name: string;

  /** Create a signature request for a generated letter; returns the signing URL. */
  createSignatureRequest(input: CreateSignatureRequestInput): Promise<SignatureRequest>;

  /** Poll the current status of a previously-created request. */
  getStatus(providerRequestId: string): Promise<SignatureStatusResult>;

  /** Download the signed document (the binding copy) once completed. */
  downloadSignedDocument(providerRequestId: string): Promise<SignedDocument>;

  /**
   * Verify + normalise an inbound webhook into a SignatureWebhookEvent.
   * Implementations MUST validate the provider signature before trusting the body.
   */
  parseWebhookEvent(headers: Headers, rawBody: string): Promise<SignatureWebhookEvent>;
}
