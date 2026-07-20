import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canContinueWithoutLedger,
  diffMigrations,
  generateGuardBundle,
  loadMigrations,
  type MigrationFile,
} from "../../supabase/migrate";

describe("migration runner logic", () => {
  it("allows an unavailable ledger only for read-only commands", () => {
    expect(canContinueWithoutLedger(["--dry-run"])).toBe(true);
    expect(canContinueWithoutLedger(["--verify"])).toBe(true);
    expect(canContinueWithoutLedger([])).toBe(false);
  });

  it("loads SQL migrations in filename order and hashes their contents", async () => {
    const files = new Map([
      ["/migrations/002_second.sql", "SELECT 2;\n"],
      ["/migrations/001_first.sql", "SELECT 1;\n"],
      ["/migrations/README.md", "ignored"],
    ]);
    const fs = {
      readdir: async () => ["002_second.sql", "README.md", "001_first.sql"],
      readFile: async (path: string) => files.get(path)!,
    };

    const migrations = await loadMigrations("/migrations", fs);

    expect(migrations.map(({ filename }) => filename)).toEqual([
      "001_first.sql",
      "002_second.sql",
    ]);
    expect(migrations[0]?.checksum).toBe(
      createHash("sha256").update("SELECT 1;\n").digest("hex"),
    );
  });

  it("treats nullable backfill checksums as applied while reporting real drift", () => {
    const migrations: MigrationFile[] = [
      { filename: "001.sql", checksum: "one", sql: "SELECT 1;" },
      { filename: "002.sql", checksum: "two", sql: "SELECT 2;" },
      { filename: "003.sql", checksum: "three", sql: "SELECT 3;" },
    ];

    const result = diffMigrations(migrations, [
      { filename: "001.sql", checksum: null },
      { filename: "002.sql", checksum: "changed" },
      { filename: "999_missing.sql", checksum: "orphan" },
    ]);

    expect(result.pending.map(({ filename }) => filename)).toEqual(["003.sql"]);
    expect(result.drift).toEqual([
      {
        filename: "002.sql",
        kind: "checksum-mismatch",
        expected: "two",
        actual: "changed",
      },
      { filename: "999_missing.sql", kind: "missing-file" },
    ]);
  });

  it("generates one atomic ledger guard per pending migration", () => {
    const bundle = generateGuardBundle([
      {
        filename: "019_guard's_test.sql",
        checksum: "abc123",
        sql: [
          "CREATE TABLE guarded (id integer);",
          "CREATE FUNCTION guarded_fn() RETURNS void AS $$",
          "BEGIN",
          "  PERFORM 1;",
          "END;",
          "$$ LANGUAGE plpgsql;",
        ].join("\n"),
      },
    ]);

    expect(bundle).toContain("CREATE TABLE IF NOT EXISTS schema_migrations_applied");
    expect(bundle).toContain("IF NOT EXISTS (");
    expect(bundle).toContain("filename = '019_guard''s_test.sql'");
    expect(bundle).toContain("EXECUTE $migration_statement_0_0$");
    expect(bundle).toContain("CREATE TABLE guarded (id integer)");
    expect(bundle).toContain("CREATE FUNCTION guarded_fn()");
    expect(bundle).toContain("PERFORM 1;");
    expect(bundle).toContain(
      "VALUES ('019_guard''s_test.sql', 'abc123', 'migration-runner')",
    );
    expect(bundle.match(/INSERT INTO schema_migrations_applied/g)).toHaveLength(1);
  });
});
