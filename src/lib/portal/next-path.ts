/**
 * A4 (#14) — validate a post-login deep-link target for the client portal.
 *
 * The delivery email links to /portal/login?next=/portal/plan; login stashes
 * the target in a short-lived cookie; the auth callback redirects to it after
 * the PKCE exchange. This validator is the open-redirect guard on both sides:
 * only same-origin portal paths pass — no scheme, no host, no protocol-relative
 * ("//evil.com"), no traversal outside /portal/.
 */
export function isSafePortalPath(next: unknown): next is string {
  if (typeof next !== "string") return false;
  if (!next.startsWith("/portal/")) return false;
  if (next.startsWith("//")) return false;
  if (next.includes("\\") || next.includes("://")) return false;
  if (next.includes("..")) return false;
  return /^\/portal\/[A-Za-z0-9\-_/]*$/.test(next);
}

export const PORTAL_NEXT_COOKIE = "portal_next";
