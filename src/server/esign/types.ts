/**
 * Shared types for the e-signature seam (Requirement #29).
 */

import type { createSupabaseServiceRole } from "../../lib/supabase/service";

/** The service-role Supabase client the signature providers operate through. */
export type SignatureDb = ReturnType<typeof createSupabaseServiceRole>;

/** Dependencies injected into a signature provider by the factory. */
export interface SignatureProviderDeps {
  db: SignatureDb;
  /**
   * Regenerate the signed letter PDF for a (signed) request on demand — used by
   * the internal SES provider (no blob storage). External providers ignore it.
   */
  renderSignedLetterPdf: (requestId: string) => Promise<Uint8Array>;
}
