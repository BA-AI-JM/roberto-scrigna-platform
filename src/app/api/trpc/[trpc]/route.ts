/**
 * tRPC HTTP handler for Next.js App Router.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers/_app";
import { createTrpcContext } from "../../../../server/trpc";

/**
 * Handle tRPC requests via fetch adapter.
 */
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTrpcContext,
  });
}

export { handler as GET, handler as POST };
