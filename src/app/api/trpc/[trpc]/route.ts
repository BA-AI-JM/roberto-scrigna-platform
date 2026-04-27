/**
 * tRPC HTTP handler for Next.js App Router.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers/_app";
import { createTrpcContext } from "../../../../server/trpc";

/**
 * Handle tRPC requests via fetch adapter.
 * Passes the raw Request into createTrpcContext so procedures can
 * access headers (e.g. x-forwarded-for for rate limiting).
 */
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req: fetchReq }) => createTrpcContext({ req: fetchReq }),
  });
}

export { handler as GET, handler as POST };
