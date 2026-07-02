/**
 * Auth surface role-gating (fix/auth-role-gating).
 *
 * Verifies the deterministic, partner-first role routing added to close the
 * surface-gating gap (a logged-in client could render the coach shell):
 *  - (dashboard)/layout now REQUIRES a partner row; a client-only session is
 *    redirected to /portal/dashboard (the security-relevant assertion), neither
 *    role → /login, dual-identity → coach-side (partner-first).
 *  - app/page routes each role to its own surface.
 *  - auth/callback only creates a partner row on ?intent=signup (no silent
 *    client→coach promotion).
 *
 * The Supabase clients + next/navigation are mocked; each test drives role state.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

// redirect() throws a sentinel carrying the destination so we can assert it.
class RedirectSignal extends Error {
  constructor(public to: string) {
    super("REDIRECT:" + to);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

// Stub the heavy client shell so the coach branch returns without rendering it.
vi.mock("../(dashboard)/dashboard-shell", () => ({
  DashboardShell: (props: Record<string, unknown>) => props,
}));

const S = vi.hoisted(() => ({
  user: null as { id: string; email: string; user_metadata?: Record<string, unknown> } | null,
  partner: null as { id: string; full_name?: string } | null,
  client: null as { id: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  exchangeError: null as unknown,
}));

// A chainable Supabase-query fake: select/eq/is → maybeSingle(data); insert captures.
const chain = vi.hoisted(() => (data: unknown, sink: Array<Record<string, unknown>>) => {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    is: () => c,
    maybeSingle: async () => ({ data }),
    insert: (payload: Record<string, unknown>) => {
      sink.push(payload);
      return { error: null };
    },
  };
  return c;
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: S.user } }),
      exchangeCodeForSession: async () => ({ error: S.exchangeError }),
    },
    // Server (session) client only ever reads `partner` in these code paths.
    from: (t: string) => chain(t === "partner" ? S.partner : null, S.inserts),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  // Service role only ever reads `client` in these code paths.
  createSupabaseServiceRole: () => ({
    from: (t: string) => chain(t === "client" ? S.client : null, S.inserts),
  }),
}));

import DashboardLayout from "../(dashboard)/layout";
import HomePage from "../page";
import { GET as authCallback } from "../auth/callback/route";

const USER = { id: "u1", email: "x@y.z", user_metadata: {} };

beforeEach(() => {
  S.user = null;
  S.partner = null;
  S.client = null;
  S.inserts = [];
  S.exchangeError = null;
});

/** Run fn; return the redirect target if it redirected, else null. */
async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
}

// ── (dashboard)/layout — the role gate ────────────────────────────────────────
describe("DashboardLayout role gate", () => {
  test("coach (partner row) renders the dashboard — unchanged", async () => {
    S.user = USER;
    S.partner = { id: "p1", full_name: "Roberto" };
    const res = (await DashboardLayout({ children: null })) as { props?: { partnerName?: string } };
    // Did NOT redirect; rendered the shell with the coach's name.
    expect((res as { props?: { partnerName?: string } }).props?.partnerName ?? (res as { partnerName?: string }).partnerName).toBe("Roberto");
  });

  test("SECURITY: client-only session → redirect /portal/dashboard (cannot render coach shell)", async () => {
    S.user = USER;
    S.partner = null; // NOT a coach
    S.client = { id: "c1" }; // active client
    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/portal/dashboard");
  });

  test("no role at all → /login", async () => {
    S.user = USER;
    S.partner = null;
    S.client = null;
    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/login");
  });

  test("no session → /login", async () => {
    S.user = null;
    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/login");
  });

  test("dual-identity (partner + client) → coach-side, partner-first (no redirect)", async () => {
    S.user = USER;
    S.partner = { id: "p1", full_name: "Roberto" };
    S.client = { id: "c1" };
    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBeNull();
  });
});

// ── app/page — role-aware root ────────────────────────────────────────────────
describe("HomePage root routing", () => {
  test("partner → /dashboard", async () => {
    S.user = USER;
    S.partner = { id: "p1" };
    expect(await redirectOf(() => HomePage())).toBe("/dashboard");
  });
  test("client-only → /portal/dashboard", async () => {
    S.user = USER;
    S.client = { id: "c1" };
    expect(await redirectOf(() => HomePage())).toBe("/portal/dashboard");
  });
  test("no role → /login", async () => {
    S.user = USER;
    expect(await redirectOf(() => HomePage())).toBe("/login");
  });
  test("no session → /login", async () => {
    S.user = null;
    expect(await redirectOf(() => HomePage())).toBe("/login");
  });
  test("dual-identity → /dashboard (partner-first)", async () => {
    S.user = USER;
    S.partner = { id: "p1" };
    S.client = { id: "c1" };
    expect(await redirectOf(() => HomePage())).toBe("/dashboard");
  });
});

// ── auth/callback — partner-creation gated to signup ──────────────────────────
describe("auth/callback partner-creation hardening", () => {
  test("intent=signup + no existing partner → creates the partner row", async () => {
    S.user = USER;
    S.partner = null;
    await authCallback(new Request("https://app.example/auth/callback?code=abc&intent=signup"));
    expect(S.inserts).toHaveLength(1);
    expect(S.inserts[0]?.auth_user_id).toBe("u1");
  });

  test("SECURITY: NO intent → does NOT create a partner row (no silent promotion)", async () => {
    S.user = USER;
    S.partner = null; // would-be-new user, but not a signup
    await authCallback(new Request("https://app.example/auth/callback?code=abc&next=/settings"));
    expect(S.inserts).toHaveLength(0);
  });

  test("intent=signup but partner already exists → no duplicate insert", async () => {
    S.user = USER;
    S.partner = { id: "p1" };
    await authCallback(new Request("https://app.example/auth/callback?code=abc&intent=signup"));
    expect(S.inserts).toHaveLength(0);
  });
});
