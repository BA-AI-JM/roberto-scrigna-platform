/**
 * Root tRPC router.
 * Aggregates all sub-routers into the app router.
 */

import { router } from "../trpc";
import { authRouter } from "./auth";
import { clientRouter } from "./client";
import { invoiceRouter } from "./invoice";
import { documentRouter } from "./document";
import { taskRouter } from "./task";
import { guidanceRouter } from "./guidance";
import { checkinRouter } from "./checkin";
import { trainingLogRouter } from "./training-log";
import { notificationRouter } from "./notification";
import { dashboardRouter } from "./dashboard";
import { portalRouter } from "./portal";
import { planRouter } from "./plan";
import { legalRouter } from "./legal";
import { signatureRouter } from "./signature";
import { feedbackRouter } from "./feedback";
import { practiceProfileRouter } from "./practice-profile";
import { gdprRouter } from "./gdpr";

export const appRouter = router({
  auth: authRouter,
  client: clientRouter,
  invoice: invoiceRouter,
  document: documentRouter,
  task: taskRouter,
  guidance: guidanceRouter,
  checkin: checkinRouter,
  trainingLog: trainingLogRouter,
  notification: notificationRouter,
  dashboard: dashboardRouter,
  portal: portalRouter,
  plan: planRouter,
  legal: legalRouter,
  signature: signatureRouter,
  feedback: feedbackRouter,
  practiceProfile: practiceProfileRouter,
  gdpr: gdprRouter,
});

/** Type-safe router type for client-side usage */
export type AppRouter = typeof appRouter;
