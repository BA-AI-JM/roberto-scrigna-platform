import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { createSupabaseServiceRole } from "../../lib/supabase/service";
import { protectedProcedure, router } from "../trpc";

const clientInput = z.object({ clientId: z.string().uuid() });

type EraseRpcRow = {
  erased: boolean;
  tables_touched: number;
  invalid_reason: string | null;
};

type StorageOutcome = {
  success: boolean;
  removedObjects: number;
  error: string | null;
};

/* COUNSEL-REVIEW */
const EXPORT_FAILED = "Esportazione dei dati non completata.";
/* COUNSEL-REVIEW */
const ERASE_FAILED = "Cancellazione dei dati non completata.";
/* COUNSEL-REVIEW */
const DATABASE_ERASURE_SKIPPED =
  "Operazione non eseguita perché la cancellazione nel database non è stata completata.";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

async function removeClientMedia(
  service: ReturnType<typeof createSupabaseServiceRole>,
  partnerId: string,
  clientId: string
): Promise<StorageOutcome> {
  const bucket = service.storage.from("client-media");
  const prefixes = [
    `client-photos/${partnerId}/${clientId}`,
    `training-screenshots/${partnerId}/${clientId}`,
  ];
  const paths: string[] = [];
  const errors: string[] = [];

  for (const prefix of prefixes) {
    let offset = 0;
    while (true) {
      let result: Awaited<ReturnType<typeof bucket.list>>;
      try {
        result = await bucket.list(prefix, { limit: 1000, offset });
      } catch (error) {
        errors.push(errorMessage(error));
        break;
      }
      const { data, error } = result;
      if (error) {
        errors.push(error.message);
        break;
      }

      const objects = data ?? [];
      paths.push(...objects.map((object) => `${prefix}/${object.name}`));
      if (objects.length < 1000) break;
      offset += objects.length;
    }
  }

  if (paths.length > 0) {
    try {
      const { error } = await bucket.remove(paths);
      if (error) errors.push(error.message);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }

  return {
    success: errors.length === 0,
    removedObjects: errors.length === 0 ? paths.length : 0,
    error: errors.length > 0 ? errors.join("; ") : null,
  };
}

export const gdprRouter = router({
  exportClient: protectedProcedure
    .input(clientInput)
    .query(async ({ ctx, input }) => {
      const service = createSupabaseServiceRole();
      const { data, error } = await service.rpc("gdpr_export_client", {
        p_partner_id: ctx.partnerId,
        p_client_id: input.clientId,
      });

      if (error || data === null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: EXPORT_FAILED,
          cause: error ?? undefined,
        });
      }

      return data;
    }),

  eraseClient: protectedProcedure
    .input(clientInput.extend({ confirm: z.literal("ERASE") }))
    .mutation(async ({ ctx, input }) => {
      const service = createSupabaseServiceRole();
      const clientLookup = await service
        .from("client")
        .select("auth_user_id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .maybeSingle();

      const { data, error } = await service.rpc("gdpr_erase_client", {
        p_partner_id: ctx.partnerId,
        p_client_id: input.clientId,
        p_confirm: input.confirm,
      });
      const row = (Array.isArray(data) ? data[0] : data) as EraseRpcRow | null;

      if (error || !row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ERASE_FAILED,
          cause: error ?? undefined,
        });
      }

      const database = {
        erased: row.erased,
        tablesTouched: row.tables_touched,
        invalidReason: row.invalid_reason,
      };

      if (!row.erased) {
        return {
          database,
          storage: {
            success: false,
            removedObjects: 0,
            error: DATABASE_ERASURE_SKIPPED,
          },
          auth: {
            attempted: false,
            success: false,
            error: DATABASE_ERASURE_SKIPPED,
          },
        };
      }

      const storage = await removeClientMedia(service, ctx.partnerId, input.clientId);

      let auth: { attempted: boolean; success: boolean; error: string | null };
      if (clientLookup.error) {
        auth = {
          attempted: false,
          success: false,
          error: errorMessage(clientLookup.error),
        };
      } else if (!clientLookup.data?.auth_user_id) {
        auth = { attempted: false, success: true, error: null };
      } else {
        try {
          const authResult = await service.auth.admin.deleteUser(
            clientLookup.data.auth_user_id
          );
          auth = {
            attempted: true,
            success: !authResult.error,
            error: authResult.error?.message ?? null,
          };
        } catch (error) {
          auth = {
            attempted: true,
            success: false,
            error: errorMessage(error),
          };
        }
      }

      return { database, storage, auth };
    }),
});
