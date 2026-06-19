/**
 * Portal auth-user provisioning (#1).
 *
 * A client can only sign into the portal if a Supabase auth user exists for
 * their email AND `client.auth_user_id` is linked — the login page uses
 * passwordless OTP with `shouldCreateUser: false`, so it never creates the
 * account itself. Previously only `client.sendPortalInvite` provisioned this;
 * the plan-send paths (`plan.shareWithClient`, Inngest `onPlanDelivered`) just
 * emailed a link, so a client who was sent a plan but never separately invited
 * had no account and the access link dead-ended at the login page.
 *
 * This helper centralises the provisioning so every path that emails a portal
 * link provisions first. It is idempotent: if the client is already linked it
 * returns immediately without touching the auth admin API.
 *
 * The admin client is injected (service-role, RLS-bypassing) so this module is
 * unit-testable without the Supabase/`server-only` runtime — callers pass
 * `createSupabaseServiceRole()`.
 */

// Type-only import: erased at runtime, so this module pulls in neither
// `server-only` nor live Supabase credentials (keeps it test-friendly).
type AdminClient = ReturnType<
  typeof import("../lib/supabase/service").createSupabaseServiceRole
>;

export interface EnsurePortalAuthUserParams {
  clientId: string;
  email: string | null | undefined;
}

/**
 * Ensure a Supabase auth user exists for the client and that
 * `client.auth_user_id` is linked. Returns the auth user id, or null when no
 * email is available (nothing can be provisioned). Throws on hard failures
 * (auth-admin or DB errors) so callers can surface/retry.
 *
 * Idempotent — safe to call on every plan send / invite.
 */
export async function ensurePortalAuthUser(
  admin: AdminClient,
  params: EnsurePortalAuthUserParams
): Promise<string | null> {
  const email = params.email?.trim().toLowerCase();
  if (!email) return null;

  // 1. Short-circuit if already provisioned + linked (idempotency).
  const { data: existing } = await admin
    .from("client")
    .select("auth_user_id")
    .eq("id", params.clientId)
    .single();
  let authUserId = (existing?.auth_user_id as string | null) ?? null;
  if (authUserId) return authUserId;

  // 2. Create the auth user; tolerate "already exists" and resolve its id.
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.data?.user?.id) {
    authUserId = created.data.user.id;
  } else if (created.error) {
    const msg = created.error.message ?? "";
    const alreadyExists =
      /already|registered|exists/i.test(msg) || created.error.status === 422;
    if (!alreadyExists) {
      console.error("[ensurePortalAuthUser] createUser:", created.error);
      throw new Error("Errore nella creazione dell'accesso cliente.");
    }
    const linkRes = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    authUserId = linkRes.data?.user?.id ?? null;
    if (!authUserId) {
      console.error(
        "[ensurePortalAuthUser] could not resolve existing user id:",
        linkRes.error
      );
      throw new Error("Errore nel collegamento dell'account cliente.");
    }
  }

  // 3. Link the client row (service role bypasses RLS).
  if (authUserId) {
    const { error: linkErr } = await admin
      .from("client")
      .update({ auth_user_id: authUserId })
      .eq("id", params.clientId);
    if (linkErr) {
      console.error("[ensurePortalAuthUser] link auth_user_id:", linkErr);
      throw new Error("Errore nel collegamento dell'account cliente.");
    }
  }

  return authUserId;
}
