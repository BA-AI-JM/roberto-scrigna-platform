/**
 * Signature provider factory (Requirement #29).
 *
 * Picks the active implementation behind the EsignProvider seam from the
 * `SIGNATURE_PROVIDER` env flag (default 'internal'). The router NEVER hardcodes
 * a provider — it always resolves through this factory and calls the interface.
 */

import type { EsignProvider } from "./provider";
import type { SignatureProviderDeps } from "./types";
import { InternalSignatureProvider } from "./internal-provider";
import { RemoteEsignProviderAdapter } from "./remote-provider";

/** The active provider id: 'internal' (default, in-app SES) or 'remote' (v1.5). */
export function activeSignatureProviderName(): string {
  return process.env.SIGNATURE_PROVIDER ?? "internal";
}

export function getSignatureProvider(deps: SignatureProviderDeps): EsignProvider {
  if (activeSignatureProviderName() === "remote") {
    return new RemoteEsignProviderAdapter();
  }
  return new InternalSignatureProvider(deps);
}
