/**
 * Document Router
 *
 * tRPC procedures for document management:
 * - list: paginated list of documents for a client or plan
 * - getById: single document detail
 * - create: register a new document (after upload to Supabase Storage)
 * - delete: soft-delete
 * - getUploadUrl: generate a signed upload URL for Supabase Storage
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Allowed document types */
const docTypeSchema = z.enum([
  "meal_plan",
  "supplement_plan",
  "check_in_report",
  "progress_report",
  "invoice",
  "other",
]);

/** Schema for registering a new document record */
const createDocumentSchema = z.object({
  title: z.string().min(1).max(300),
  docType: docTypeSchema,
  fileUrl: z.string().url(),
  fileSizeBytes: z.number().int().min(0).optional(),
  mimeType: z.string().max(100).default("application/pdf"),
  clientId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
});

// ── Router ───────────────────────────────────────────────────────────────────

/** Document management tRPC router */
export const documentRouter = router({
  /**
   * List documents with optional filtering by client, plan, or type.
   */
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid().optional(),
        planId: z.string().uuid().optional(),
        docType: docTypeSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("document")
        .select(
          `id, title, doc_type, file_url, file_size_bytes, mime_type,
           created_at, updated_at, client_id, plan_id,
           client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.clientId) query = query.eq("client_id", input.clientId);
      if (input.planId) query = query.eq("plan_id", input.planId);
      if (input.docType) query = query.eq("doc_type", input.docType);

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data ?? [];
    }),

  /**
   * Get a single document by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("document")
        .select(
          `id, title, doc_type, file_url, file_size_bytes, mime_type,
           created_at, updated_at, client_id, plan_id,
           client:client_id (id, full_name, email)`
        )
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento non trovato." });
      }

      return data;
    }),

  /**
   * Register a document record after the file has been uploaded.
   * File upload itself is handled client-side via Supabase Storage SDK.
   */
  create: protectedProcedure
    .input(createDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      // If clientId is provided, verify it belongs to this partner
      if (input.clientId) {
        const { data: client } = await ctx.supabase
          .from("client")
          .select("id")
          .eq("id", input.clientId)
          .eq("partner_id", ctx.partnerId)
          .is("deleted_at", null)
          .single();

        if (!client) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
        }
      }

      const { data, error } = await ctx.supabase
        .from("document")
        .insert({
          partner_id: ctx.partnerId,
          client_id: input.clientId ?? null,
          plan_id: input.planId ?? null,
          title: input.title,
          doc_type: input.docType,
          file_url: input.fileUrl,
          file_size_bytes: input.fileSizeBytes ?? null,
          mime_type: input.mimeType,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione del documento.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Soft-delete a document record.
   * Does not delete the file from Supabase Storage.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("document")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  /**
   * Generate a signed upload URL for Supabase Storage.
   * Returns a URL that the client can use to PUT the file directly.
   *
   * Bucket name: "documents" — must exist in Supabase Storage.
   * Path pattern: {partnerId}/{clientId?}/{timestamp}-{filename}
   */
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(300),
        contentType: z.string().max(100).default("application/pdf"),
        clientId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const timestamp = Date.now();
      const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = input.clientId
        ? `${ctx.partnerId}/${input.clientId}/${timestamp}-${safeFilename}`
        : `${ctx.partnerId}/${timestamp}-${safeFilename}`;

      const { data, error } = await ctx.supabase.storage
        .from("documents")
        .createSignedUploadUrl(path);

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella generazione dell'URL di upload.",
        });
      }

      const publicUrl = ctx.supabase.storage
        .from("documents")
        .getPublicUrl(path).data.publicUrl;

      return {
        uploadUrl: data.signedUrl,
        path,
        publicUrl,
      };
    }),
});
