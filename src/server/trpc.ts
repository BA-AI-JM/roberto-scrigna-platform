/**
 * tRPC server configuration.
 * Defines context, middleware, and procedure helpers.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createSupabaseServer } from "../lib/supabase/server";
import { createSupabaseServiceRole } from "../lib/supabase/service";

/** tRPC context — available in all procedures */
export interface TrpcContext {
  /** Supabase client (always available) */
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  /** Authenticated user ID (null if not logged in) */
  userId: string | null;
  /** Partner record ID (null if not a partner) */
  partnerId: string | null;
  /** Client record ID (null if not a client portal user) */
  clientId: string | null;
}

/**
 * Create the tRPC context for each request.
 * Identifies both partner and client users from the session.
 */
export async function createTrpcContext(): Promise<TrpcContext> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let partnerId: string | null = null;
  let clientId: string | null = null;

  if (user) {
    // Check partner first (anon client + session, partner RLS allows self-read)
    const { data: partner } = await supabase
      .from("partner")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    partnerId = partner?.id ?? null;

    // If not a partner, check client table using service role (no client RLS policies)
    if (!partnerId) {
      const serviceDb = createSupabaseServiceRole();
      const { data: client } = await serviceDb
        .from("client")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      clientId = client?.id ?? null;
    }
  }

  return {
    supabase,
    userId: user?.id ?? null,
    partnerId,
    clientId,
  };
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires authenticated partner.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.partnerId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Devi effettuare il login come professionista.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      partnerId: ctx.partnerId,
    },
  });
});

/**
 * Client procedure — requires authenticated client portal user.
 */
export const clientProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.clientId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Devi effettuare il login come cliente.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      clientId: ctx.clientId,
    },
  });
});
