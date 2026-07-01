/**
 * Internal SES (Simple Electronic Signature) provider — Requirement #29.
 *
 * The DEFAULT signing implementation for in-house testing + the Roberto demo.
 * The patient accepts the generated letter IN-APP; we record who/when/which
 * version and regenerate a stamped signed PDF on demand (no blob storage).
 * Minimal — NOT a forensic audit system.
 *
 * The actual accept (pending -> signed) is performed by the signature router
 * (it is internal-specific and client-scoped); external providers sign on their
 * own hosted page and signal completion via webhook, so the EsignProvider
 * contract has no accept() method.
 */

import type {
  EsignProvider,
  CreateSignatureRequestInput,
  SignatureRequest,
  SignatureStatusResult,
  SignedDocument,
  SignatureWebhookEvent,
  SignatureStatus,
} from "./provider";
import type { SignatureProviderDeps } from "./types";

export class InternalSignatureProvider implements EsignProvider {
  readonly name = "internal";

  constructor(private readonly deps: SignatureProviderDeps) {}

  /** Create a pending request; the signing target is an IN-APP portal route. */
  async createSignatureRequest(
    input: CreateSignatureRequestInput
  ): Promise<SignatureRequest> {
    const { data, error } = await this.deps.db
      .from("signature_request")
      .insert({
        client_id: input.clientId,
        partner_id: input.partnerId,
        document_version_id: input.documentVersionId,
        provider: "internal",
        status: "pending",
      })
      .select("id, created_at")
      .single();
    if (error || !data) {
      throw new Error(`internal createSignatureRequest failed: ${error?.message}`);
    }
    return {
      providerRequestId: data.id as string,
      status: "pending",
      signingUrl: `/portal/firma/${data.id}`, // in-app, NOT an external URL
      createdAt: data.created_at as string,
    };
  }

  async getStatus(requestId: string): Promise<SignatureStatusResult> {
    const { data, error } = await this.deps.db
      .from("signature_request")
      .select("status, accepted_at")
      .eq("id", requestId)
      .single();
    if (error || !data) throw new Error("signature request not found");
    const status = data.status as SignatureStatus;
    return {
      providerRequestId: requestId,
      status,
      signedAt: (data.accepted_at as string | null) ?? undefined,
      signedDocumentAvailable: status === "signed",
    };
  }

  /** Regenerate the stamped signed PDF on demand (no stored blob). */
  async downloadSignedDocument(requestId: string): Promise<SignedDocument> {
    const { data, error } = await this.deps.db
      .from("signature_request")
      .select("status")
      .eq("id", requestId)
      .single();
    if (error || !data) throw new Error("signature request not found");
    if (data.status !== "signed") throw new Error("document not signed yet");

    const bytes = await this.deps.renderSignedLetterPdf(requestId);
    return { bytes, contentType: "application/pdf", providerRequestId: requestId };
  }

  /** Inert: internal SES has no external webhook. */
  async parseWebhookEvent(): Promise<SignatureWebhookEvent> {
    return {
      providerRequestId: "",
      status: "error",
      raw: {
        applicable: false,
        provider: "internal",
        message: "Internal SES signing has no external webhook.",
      },
    };
  }
}
