/**
 * Guardrail for #1 email-wiring: the Resend send wrapper must surface failures
 * instead of swallowing them.
 *
 * The Resend SDK resolves `{ data, error }` and never throws on API errors, so
 * the previous call sites (which discarded the result) reported false success.
 * `sendEmail` must THROW when the SDK returns an `error` or null `data`, and
 * resolve normally on success. We inject a fake Resend client via vi.mock on
 * the lazy `getResend()` factory (mirrors the DI pattern in portal-auth.test).
 *
 * Env note: the wrapper also throws when RESEND_API_KEY is unset or the
 * from-address is the placeholder; these tests set valid env so they exercise
 * the SDK-result handling specifically.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

// Mutable holder for what the fake emails.send() resolves to.
const sendResult: { value: { data: unknown; error: unknown } } = {
  value: { data: { id: "email_123" }, error: null },
};

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async () => sendResult.value,
    };
  },
}));

// Import AFTER the mock is registered.
import { sendEmail } from "../client";

const VALID = { to: "client@example.it", subject: "Test", html: "<p>hi</p>", from: "coach@verified.it" };

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "coach@verified.it";
  sendResult.value = { data: { id: "email_123" }, error: null };
});

describe("sendEmail wrapper (#1)", () => {
  test("resolves normally when Resend returns data and no error", async () => {
    sendResult.value = { data: { id: "email_ok" }, error: null };
    await expect(sendEmail(VALID)).resolves.toBeUndefined();
  });

  test("THROWS when Resend resolves with an error (the silent-failure bug)", async () => {
    sendResult.value = { data: null, error: { message: "The from address domain is not verified", name: "validation_error" } };
    await expect(sendEmail(VALID)).rejects.toThrow(/Resend send failed.*not verified/);
  });

  test("THROWS when Resend returns null data and null error", async () => {
    sendResult.value = { data: null, error: null };
    await expect(sendEmail(VALID)).rejects.toThrow(/no data returned/);
  });

  test("THROWS (does not attempt send) when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail(VALID)).rejects.toThrow(/RESEND_API_KEY is not set/);
  });

  test("THROWS when the from-address is the unconfigured placeholder", async () => {
    await expect(
      sendEmail({ ...VALID, from: "noreply@example.com" })
    ).rejects.toThrow(/RESEND_FROM_EMAIL is unset/);
  });
});
