/**
 * Guardrail for #1: portal auth-user provisioning is shared, idempotent, and
 * resolves pre-existing auth users.
 *
 * The send-path callers (plan.shareWithClient, Inngest onPlanDelivered) and the
 * invite path (client.sendPortalInvite) all funnel through ensurePortalAuthUser
 * BEFORE emailing a portal link, so any client who receives a plan email has a
 * usable account. Fully mocking the tRPC/Inngest boundaries (ctx.supabase,
 * Resend, the auth admin) is impractical, so per the agreed fallback we unit-
 * test the shared helper directly: idempotency (no re-provision when already
 * linked) + provisioning + existing-user resolution. The admin client is
 * dependency-injected, so no Supabase/server-only runtime is needed.
 */

import { describe, test, expect } from "vitest";
import { ensurePortalAuthUser } from "../portal-auth";

type AdminOpts = {
  existingAuthUserId?: string | null;
  createUserResult?: {
    data: { user: { id: string } | null } | null;
    error: { message?: string; status?: number } | null;
  };
  generateLinkResult?: {
    data: { user: { id: string } | null } | null;
    error: unknown;
  };
};

/** Minimal fake of the service-role client surface the helper touches. */
function makeAdmin(opts: AdminOpts) {
  const calls = { createUser: 0, generateLink: 0, update: 0 };
  let updatedTo: string | null = null;

  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: { auth_user_id: opts.existingAuthUserId ?? null },
                  error: null,
                }),
              };
            },
          };
        },
        update(values: { auth_user_id: string }) {
          calls.update++;
          updatedTo = values.auth_user_id;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    auth: {
      admin: {
        createUser: async () => {
          calls.createUser++;
          return (
            opts.createUserResult ?? { data: { user: { id: "new-user" } }, error: null }
          );
        },
        generateLink: async () => {
          calls.generateLink++;
          return opts.generateLinkResult ?? { data: { user: null }, error: null };
        },
      },
    },
  };

  // The real signature is SupabaseClient; the helper only uses this subset.
  return { admin: admin as unknown as Parameters<typeof ensurePortalAuthUser>[0], calls, updatedTo: () => updatedTo };
}

describe("ensurePortalAuthUser (#1)", () => {
  test("returns null and provisions nothing when no email", async () => {
    const { admin, calls } = makeAdmin({});
    const result = await ensurePortalAuthUser(admin, { clientId: "c1", email: null });
    expect(result).toBeNull();
    expect(calls.createUser).toBe(0);
    expect(calls.update).toBe(0);
  });

  test("idempotent no-op when client is already linked", async () => {
    const { admin, calls } = makeAdmin({ existingAuthUserId: "u-existing" });
    const result = await ensurePortalAuthUser(admin, { clientId: "c1", email: "a@b.it" });
    expect(result).toBe("u-existing");
    expect(calls.createUser).toBe(0); // never touches the auth admin API
    expect(calls.update).toBe(0);
  });

  test("provisions a new auth user and links it when absent", async () => {
    const { admin, calls, updatedTo } = makeAdmin({
      existingAuthUserId: null,
      createUserResult: { data: { user: { id: "fresh-id" } }, error: null },
    });
    const result = await ensurePortalAuthUser(admin, { clientId: "c1", email: "a@b.it" });
    expect(result).toBe("fresh-id");
    expect(calls.createUser).toBe(1);
    expect(calls.update).toBe(1);
    expect(updatedTo()).toBe("fresh-id");
  });

  test("resolves and links a pre-existing auth user (createUser 422)", async () => {
    const { admin, calls, updatedTo } = makeAdmin({
      existingAuthUserId: null,
      createUserResult: { data: null, error: { status: 422, message: "already registered" } },
      generateLinkResult: { data: { user: { id: "resolved-id" } }, error: null },
    });
    const result = await ensurePortalAuthUser(admin, { clientId: "c1", email: "a@b.it" });
    expect(result).toBe("resolved-id");
    expect(calls.createUser).toBe(1);
    expect(calls.generateLink).toBe(1);
    expect(calls.update).toBe(1);
    expect(updatedTo()).toBe("resolved-id");
  });

  test("throws on an unexpected createUser error (no silent email of dead link)", async () => {
    const { admin } = makeAdmin({
      existingAuthUserId: null,
      createUserResult: { data: null, error: { status: 500, message: "boom" } },
    });
    await expect(
      ensurePortalAuthUser(admin, { clientId: "c1", email: "a@b.it" })
    ).rejects.toThrow();
  });
});
