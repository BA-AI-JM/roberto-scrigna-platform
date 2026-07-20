import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validRequiredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a-valid-anon-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "a-valid-service-role-key-value",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
} as const;

async function importEnv(overrides: Record<string, string> = {}) {
  vi.resetModules();

  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    RESEND_API_KEY: "",
    RESEND_FROM_EMAIL: "",
    INNGEST_EVENT_KEY: "",
    INNGEST_SIGNING_KEY: "",
    ANTHROPIC_API_KEY: "",
    CHROMIUM_PATH: "",
    CHROMIUM_PACK_URL: "",
    ...validRequiredEnv,
    ...overrides,
  })) {
    vi.stubEnv(name, value);
  }

  return import("@/env");
}

describe("environment schema", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws at import and names a missing always-required variable", async () => {
    await expect(
      importEnv({ SUPABASE_SERVICE_ROLE_KEY: "" })
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("lists every missing production-required variable", async () => {
    await expect(importEnv({ NODE_ENV: "production" })).rejects.toThrow(
      /RESEND_API_KEY.*RESEND_FROM_EMAIL.*INNGEST_EVENT_KEY.*INNGEST_SIGNING_KEY/
    );
  });

  it("does not throw when optional integrations are absent and disables their capabilities", async () => {
    const { capabilities } = await importEnv();

    expect(capabilities).toMatchObject({
      ocr: false,
      pdfLocal: false,
      pdfRemote: false,
    });
  });
});
