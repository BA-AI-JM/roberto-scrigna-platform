import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsed.success) {
  const invalidNames = [
    ...new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((name): name is string => typeof name === "string")
    ),
  ];

  throw new Error(`Invalid public environment variables: ${invalidNames.join(", ")}`);
}

export const clientEnv = parsed.data;
