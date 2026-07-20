import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { throwDiscriminated } from "../db-errors";

describe("throwDiscriminated", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("throws NOT_FOUND with the site message for PGRST116", () => {
    expect(() =>
      throwDiscriminated(
        { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        "Cliente non trovato.",
        "router/client.getById"
      )
    ).toThrow(
      expect.objectContaining<Partial<TRPCError>>({
        code: "NOT_FOUND",
        message: "Cliente non trovato.",
      })
    );
  });

  test("treats null data with no database error as NOT_FOUND", () => {
    expect(() =>
      throwDiscriminated(null, "Documento non trovato.", "router/document.getById")
    ).toThrow(
      expect.objectContaining<Partial<TRPCError>>({
        code: "NOT_FOUND",
        message: "Documento non trovato.",
      })
    );
  });

  test("logs the database code and throws a generic internal error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      throwDiscriminated(
        { code: "42703", message: "column parent_plan_id does not exist" },
        "Piano non trovato.",
        "router/plan.getById"
      )
    ).toThrow(
      expect.objectContaining<Partial<TRPCError>>({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore imprevisto. Riprova tra poco.",
      })
    );
    expect(log).toHaveBeenCalledWith(
      "[router/plan.getById]",
      "42703",
      "column parent_plan_id does not exist"
    );
  });
});
