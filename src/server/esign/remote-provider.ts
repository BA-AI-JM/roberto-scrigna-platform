/**
 * Remote e-signature provider adapter — Requirement #29 PLACEHOLDER (v1.5).
 *
 * Provider-agnostic stub for a real eIDAS provider (DocuSign / Yousign / etc.).
 * Currently switched OFF: every method throws a clear "not configured" error.
 * Wire the real adapter at v1.5 — implement each method against the provider's
 * REST API and verify the webhook signature in parseWebhookEvent.
 *
 * Config (add when implementing — keep secrets in env, never in code):
 *   // ESIGN_API_BASE       = "https://api.<provider>.com"
 *   // ESIGN_API_KEY        = "<server-side API key>"
 *   // ESIGN_WEBHOOK_SECRET = "<HMAC secret for webhook signature verification>"
 * and select it at runtime with  SIGNATURE_PROVIDER=remote.
 */

import type {
  EsignProvider,
  CreateSignatureRequestInput,
  SignatureRequest,
  SignatureStatusResult,
  SignedDocument,
  SignatureWebhookEvent,
} from "./provider";

const NOT_CONFIGURED =
  "e-sign provider not configured — wire a real adapter at v1.5";

export class RemoteEsignProviderAdapter implements EsignProvider {
  readonly name = "remote";

  async createSignatureRequest(
    _input: CreateSignatureRequestInput
  ): Promise<SignatureRequest> {
    // v1.5: POST the generated PDF + signer to ESIGN_API_BASE, return the hosted
    // signing URL + the provider's request id.
    throw new Error(NOT_CONFIGURED);
  }

  async getStatus(_providerRequestId: string): Promise<SignatureStatusResult> {
    // v1.5: GET <ESIGN_API_BASE>/requests/{id} and map the provider status.
    throw new Error(NOT_CONFIGURED);
  }

  async downloadSignedDocument(_providerRequestId: string): Promise<SignedDocument> {
    // v1.5: GET the signed document + completion certificate from the provider.
    throw new Error(NOT_CONFIGURED);
  }

  async parseWebhookEvent(
    _headers: Headers,
    _rawBody: string
  ): Promise<SignatureWebhookEvent> {
    // v1.5: verify the HMAC signature with ESIGN_WEBHOOK_SECRET BEFORE trusting
    // the body, then normalise to a SignatureWebhookEvent.
    throw new Error(NOT_CONFIGURED);
  }
}
