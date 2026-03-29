/**
 * tRPC React client.
 *
 * Use this in client components ("use client") to call tRPC procedures
 * via React Query hooks (useQuery, useMutation, etc.).
 *
 * Usage:
 *   const { data } = trpc.portal.getActivePlan.useQuery();
 */

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

/** tRPC React hooks factory, typed to the full AppRouter */
export const trpc = createTRPCReact<AppRouter>();
