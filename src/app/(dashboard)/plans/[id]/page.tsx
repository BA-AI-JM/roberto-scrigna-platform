/**
 * /plans/[id] — bare plan route.
 *
 * The plan UI lives at /plans/[id]/review. Older links (e.g. from the client
 * profile's "Piani" tab) point at /plans/[id]; redirect them so they don't
 * fall through to the 404 page.
 */

import { redirect } from "next/navigation";

export default async function PlanIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/plans/${id}/review`);
}
