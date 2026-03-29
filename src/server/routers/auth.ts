/**
 * Auth router — practitioner authentication.
 * Single-user auth for Roberto as the sole practitioner.
 */

import { z } from "zod/v4";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
  /**
   * Get current session info.
   */
  getSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;

    const { data: partner } = await ctx.supabase
      .from("partner")
      .select("id, full_name, email, role, avatar_url")
      .eq("auth_user_id", ctx.userId)
      .single();

    return partner;
  }),

  /**
   * Login with email and password.
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.email(),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Email o password non validi.",
        });
      }

      // Verify they are a partner
      const { data: partner } = await ctx.supabase
        .from("partner")
        .select("id, full_name, email, role")
        .eq("auth_user_id", data.user.id)
        .single();

      if (!partner) {
        await ctx.supabase.auth.signOut();
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Account non autorizzato come professionista.",
        });
      }

      return { user: data.user, partner };
    }),

  /**
   * Logout current session.
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.supabase.auth.signOut();
    return { success: true };
  }),
});
