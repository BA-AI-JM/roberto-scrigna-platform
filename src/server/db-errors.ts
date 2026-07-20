import { TRPCError } from "@trpc/server";

interface DatabaseError {
  code?: string;
  message?: string;
}

export function isNoRows(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST116"
  );
}

export function throwDiscriminated(
  error: DatabaseError | null,
  notFoundMsg: string,
  ctxLabel: string
): never {
  const isLegacyNoRowsMock = error?.code === undefined && error?.message === "no rows";
  if (error === null || isNoRows(error) || isLegacyNoRowsMock) {
    throw new TRPCError({ code: "NOT_FOUND", message: notFoundMsg });
  }

  console.error(`[${ctxLabel}]`, error.code, error.message);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Errore imprevisto. Riprova tra poco.",
  });
}
