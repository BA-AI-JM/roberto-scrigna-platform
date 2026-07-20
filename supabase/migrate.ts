/**
 * Migration governance runner (SQL bundle generator).
 *
 * This repository has no `pg`/`postgres` dependency and `psql` is not available
 * on the supported workstation. A Supabase service-role key cannot execute DDL
 * through PostgREST, so this runner uses it only to read the migration ledger and
 * emits one ledger-guarded `apply-pending.sql` bundle for the SQL Editor.
 *
 * SUPABASE_DB_URL is intentionally not consumed in generator mode. When a direct
 * client becomes available, use:
 *   local: postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   prod:  operator-supplied dashboard connection string (never commit it)
 *
 * Usage:
 *   bun run supabase/migrate.ts --dry-run
 *   bun run supabase/migrate.ts --verify
 *   bun run supabase/migrate.ts [--output /safe/path/apply-pending.sql]
 *   bun run supabase/migrate.ts --assume-applied=017_checkin_token_rpc.sql
 *     (existing-DB delta path: files ≤ the watermark are ledger-STAMPED, not executed)
 */

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const DEFAULT_OUTPUT = join(dirname(MIGRATIONS_DIR), "apply-pending.sql");

export interface MigrationFile {
  filename: string;
  checksum: string;
  sql: string;
}

export interface LedgerEntry {
  filename: string;
  checksum: string | null;
}

export type MigrationDrift =
  | {
      filename: string;
      kind: "checksum-mismatch";
      expected: string;
      actual: string;
    }
  | { filename: string; kind: "missing-file" };

interface MigrationFs {
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

export async function loadMigrations(
  migrationsDir: string,
  fs: MigrationFs = { readdir, readFile },
): Promise<MigrationFile[]> {
  const filenames = (await fs.readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await fs.readFile(join(migrationsDir, filename), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export function diffMigrations(
  migrations: MigrationFile[],
  ledger: LedgerEntry[],
): { pending: MigrationFile[]; drift: MigrationDrift[] } {
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.filename, migration]),
  );
  const ledgerByName = new Map(ledger.map((entry) => [entry.filename, entry]));
  const drift: MigrationDrift[] = [];

  for (const entry of ledger) {
    const migration = migrationsByName.get(entry.filename);
    if (!migration) {
      drift.push({ filename: entry.filename, kind: "missing-file" });
    } else if (entry.checksum !== null && entry.checksum !== migration.checksum) {
      drift.push({
        filename: entry.filename,
        kind: "checksum-mismatch",
        expected: migration.checksum,
        actual: entry.checksum,
      });
    }
  }

  return {
    pending: migrations.filter(({ filename }) => !ledgerByName.has(filename)),
    drift,
  };
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let state: "normal" | "single" | "double" | "line-comment" | "block-comment" =
    "normal";
  let blockDepth = 0;
  let dollarTag: string | null = null;

  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        current += char;
        index += 1;
      }
      continue;
    }

    if (state === "line-comment") {
      current += char;
      index += 1;
      if (char === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      current += char;
      if (char === "/" && next === "*") {
        current += next;
        blockDepth += 1;
        index += 2;
      } else if (char === "*" && next === "/") {
        current += next;
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = "normal";
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single") {
      current += char;
      index += 1;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "double") {
      current += char;
      index += 1;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        state = "normal";
      }
      continue;
    }

    if (char === "-" && next === "-") {
      current += "--";
      state = "line-comment";
      index += 2;
    } else if (char === "/" && next === "*") {
      current += "/*";
      state = "block-comment";
      blockDepth = 1;
      index += 2;
    } else if (char === "'") {
      current += char;
      state = "single";
      index += 1;
    } else if (char === '"') {
      current += char;
      state = "double";
      index += 1;
    } else if (char === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
      } else {
        current += char;
        index += 1;
      }
    } else if (char === ";") {
      current += char;
      if (hasExecutableSql(current)) statements.push(current.trim());
      current = "";
      index += 1;
    } else {
      current += char;
      index += 1;
    }
  }

  if (hasExecutableSql(current)) statements.push(current.trim());
  return statements;
}

function hasExecutableSql(sql: string): boolean {
  return sql
    .replace(/--[^\n]*(?:\n|$)/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim().length > 0;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function uniqueDollarTag(prefix: string, sql: string): string {
  let suffix = 0;
  let tag = `$${prefix}$`;
  while (sql.includes(tag)) {
    suffix += 1;
    tag = `$${prefix}_${suffix}$`;
  }
  return tag;
}

export function generateGuardBundle(
  migrations: MigrationFile[],
  options: { stampOnlyThrough?: string } = {},
): string {
  const generatedAt = new Date().toISOString();
  // Existing-DB delta path (DEPLOYMENT-GUIDE §2.2): a database that predates the
  // ledger has real objects but zero ledger rows — EXECUTE-ing its own history
  // aborts on the first CREATE TABLE (proven locally 2026-07-20). The operator
  // declares the known-applied watermark; those files are STAMPED, not run.
  const stampCutoff = options.stampOnlyThrough ?? null;
  const isStampOnly = (filename: string) =>
    stampCutoff !== null && filename.localeCompare(stampCutoff) <= 0;
  const ledgerBootstrap = `-- Bootstrap only: migration 018 remains the source of record and performs backfill.
CREATE TABLE IF NOT EXISTS schema_migrations_applied (
  filename TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);
ALTER TABLE schema_migrations_applied ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON schema_migrations_applied;
CREATE POLICY schema_migrations_applied_service_role_only
  ON schema_migrations_applied FOR ALL TO service_role
  USING (true) WITH CHECK (true);`;
  const blocks = migrations.map((migration, migrationIndex) => {
    if (isStampOnly(migration.filename)) {
      return `-- ${migration.filename} (assumed applied — stamped, NOT executed)\nINSERT INTO schema_migrations_applied (filename, checksum, applied_by)\nVALUES (${sqlLiteral(migration.filename)}, ${sqlLiteral(migration.checksum)}, 'assume-applied')\nON CONFLICT (filename) DO NOTHING;`;
    }
    const statements = splitSqlStatements(migration.sql);
    const guardTag = uniqueDollarTag(`migration_guard_${migrationIndex}`, migration.sql);
    const executions = statements
      .map((statement, statementIndex) => {
        const statementTag = uniqueDollarTag(
          `migration_statement_${migrationIndex}_${statementIndex}`,
          statement,
        );
        return `    EXECUTE ${statementTag}\n${statement}\n${statementTag};`;
      })
      .join("\n");

    return `-- ${migration.filename}\nDO ${guardTag}\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM schema_migrations_applied\n    WHERE filename = ${sqlLiteral(migration.filename)}\n  ) THEN\n${executions}\n    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)\n    VALUES (${sqlLiteral(migration.filename)}, ${sqlLiteral(migration.checksum)}, 'migration-runner');\n  END IF;\nEND\n${guardTag};`;
  });

  return [
    "-- apply-pending.sql",
    `-- Generated ${generatedAt}; paste the entire bundle into Supabase SQL Editor.`,
    "-- Each migration is atomic and skipped when its filename is already ledgered.",
    "",
    ledgerBootstrap,
    "",
    ...blocks.flatMap((block) => [block, ""]),
  ].join("\n");
}

async function readLedger(): Promise<LedgerEntry[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "Ledger unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; treating every migration as pending.",
    );
    return [];
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("schema_migrations_applied")
    .select("filename, checksum")
    .order("filename");

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`Could not read migration ledger: ${error.message}`);
  }
  return (data ?? []) as LedgerEntry[];
}

function printPending(pending: MigrationFile[]): void {
  console.log(`Pending migrations (${pending.length}):`);
  if (pending.length === 0) console.log("  (none)");
  for (const migration of pending) console.log(`  ${migration.filename}`);
}

function printDrift(drift: MigrationDrift[]): void {
  if (drift.length === 0) return;
  console.error(`Ledger drift (${drift.length}):`);
  for (const item of drift) {
    console.error(`  ${item.filename}: ${item.kind}`);
  }
}

export function canContinueWithoutLedger(args: string[]): boolean {
  return args.includes("--dry-run") || args.includes("--verify");
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const migrations = await loadMigrations(MIGRATIONS_DIR);
  let ledger: LedgerEntry[];
  try {
    ledger = await readLedger();
  } catch (error) {
    if (!canContinueWithoutLedger(args)) throw error;
    console.warn(
      `${error instanceof Error ? error.message : error} Treating every migration as pending for this read-only command.`,
    );
    ledger = [];
  }
  const { pending, drift } = diffMigrations(migrations, ledger);
  printPending(pending);
  printDrift(drift);

  if (args.includes("--verify")) {
    if (pending.length > 0 || drift.length > 0) process.exitCode = 1;
    return;
  }
  if (args.includes("--dry-run")) return;
  if (drift.length > 0) {
    throw new Error("Refusing to generate a bundle while ledger drift exists.");
  }
  if (pending.length === 0) return;

  const outputIndex = args.indexOf("--output");
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : DEFAULT_OUTPUT;
  if (!outputPath) throw new Error("--output requires a path.");
  const assumeArg = args.find((a) => a.startsWith("--assume-applied="));
  const stampOnlyThrough = assumeArg ? assumeArg.split("=")[1] : undefined;
  if (assumeArg && !stampOnlyThrough) throw new Error("--assume-applied requires =<filename>.");
  await writeFile(outputPath, generateGuardBundle(pending, { stampOnlyThrough }), "utf8");
  console.log(
    `Generated ${outputPath}${stampOnlyThrough ? ` (stamp-only through ${stampOnlyThrough})` : ""}`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
