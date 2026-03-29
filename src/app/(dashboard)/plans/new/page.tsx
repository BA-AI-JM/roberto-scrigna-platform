/**
 * New Client Intake Page.
 *
 * Entry point for the 7-page client intake form. Delegates all rendering
 * to IntakeForm (client component) which handles multi-step state,
 * tRPC mutations, and redirect on success.
 */

import IntakeForm from "./IntakeForm";

export default function NewPlanPage() {
  return <IntakeForm />;
}
