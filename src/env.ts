import "server-only";

import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

const productionRequiredNames = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
    RESEND_API_KEY: optionalString,
    RESEND_FROM_EMAIL: optionalString,
    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    CHROMIUM_PATH: optionalString,
    CHROMIUM_PACK_URL: optionalString,
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV !== "production") return;
    // Vercel runs ALL builds (incl. Preview) with NODE_ENV=production. A Preview
    // build shouldn't need the live Resend/Inngest keys just to compile, so only
    // enforce these on a TRUE production build. Real production is unchanged
    // (VERCEL_ENV="production", or unset on a self-hosted prod server).
    if (process.env.VERCEL_ENV === "preview") return;

    for (const name of productionRequiredNames) {
      if (!values[name]) {
        context.addIssue({
          code: "custom",
          message: "Required in production",
          path: [name],
        });
      }
    }
  });

const testDefaults =
  process.env.NODE_ENV === "test"
    ? {
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key-placeholder",
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key-placeholder",
        NEXT_PUBLIC_APP_URL:
          process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000",
      }
    : {};

const parsed = envSchema.safeParse({ ...process.env, ...testDefaults });

if (!parsed.success) {
  const invalidNames = [
    ...new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((name): name is string => typeof name === "string")
    ),
  ];

  throw new Error(`Invalid environment variables: ${invalidNames.join(", ")}`);
}

export const env = parsed.data;

const unavailableOutsideProduction = productionRequiredNames.filter(
  (name) => !env[name]
);

if (env.NODE_ENV !== "production" && unavailableOutsideProduction.length > 0) {
  console.warn(
    `[env] Integrations unavailable outside production: ${unavailableOutsideProduction.join(", ")}`
  );
}

export const capabilities = Object.freeze({
  email: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL),
  inngest: Boolean(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY),
  ocr: Boolean(env.ANTHROPIC_API_KEY),
  pdfLocal: Boolean(env.CHROMIUM_PATH),
  pdfRemote: Boolean(env.CHROMIUM_PACK_URL),
});
