import { Resend } from "resend";

let _resend: Resend | null = null;
export function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY ?? "");
  }
  return _resend;
}

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";

/** Placeholder from-address used when RESEND_FROM_EMAIL is unset. */
const UNCONFIGURED_FROM = "noreply@example.com";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Defaults to FROM_EMAIL. */
  from?: string;
}

/**
 * Hardened Resend send (#1 email-wiring).
 *
 * The Resend SDK resolves `{ data, error }` and does NOT throw on API errors
 * (invalid key, unverified from-domain). Call sites used to discard the result,
 * so failures were silent and callers were told "sent". This wrapper:
 *   1. fails loudly when Resend is misconfigured (empty key, or the placeholder
 *      from-address), instead of attempting a doomed send;
 *   2. inspects the returned `error`/`data` and throws a descriptive Error so
 *      the caller (tRPC mutation or Inngest step) surfaces a real failure.
 *
 * It does NOT change the real key/from values — it only detects and surfaces
 * the misconfigured/failed state. Happy path is unchanged.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const from = params.from ?? FROM_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "Resend not configured: RESEND_API_KEY is not set — email not sent."
    );
  }
  if (from === UNCONFIGURED_FROM) {
    throw new Error(
      "Resend not configured: RESEND_FROM_EMAIL is unset (placeholder noreply@example.com) — email not sent. Set a verified sender domain."
    );
  }

  const { data, error } = await getResend().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? error.name ?? "unknown error"}`);
  }
  if (!data) {
    throw new Error("Resend send failed: no data returned from Resend API.");
  }
}
