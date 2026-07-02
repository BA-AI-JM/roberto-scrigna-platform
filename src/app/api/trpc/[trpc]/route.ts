/**
 * tRPC HTTP handler for Next.js App Router.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers/_app";
import { createTrpcContext } from "../../../../server/trpc";

// Puppeteer/Chromium mutations (legal.generateEngagementLetter) run through this
// tRPC handler. They need the Node.js runtime and more than the short default
// serverless timeout — a Chromium cold-start + render can exceed it and surface
// as an HTTP 500. nodejs is the default, set explicitly; maxDuration lifts the ceiling.
export const runtime = "nodejs";
export const maxDuration = 60;

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
