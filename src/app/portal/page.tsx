/**
 * Portal index — redirects to the dashboard.
 */

import { redirect } from "next/navigation";

/** Redirect /portal to /portal/dashboard */
export default function PortalIndexPage() {
  redirect("/portal/dashboard");
}
