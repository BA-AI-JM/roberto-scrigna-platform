/**
 * Simple migration runner for local development.
 * Reads SQL files from supabase/migrations/ in order and executes them
 * against the Supabase database.
 *
 * Usage: bun run supabase/migrate.ts
 *
 * For production, use Supabase CLI: supabase db push
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

async function migrate() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("⚠️  No Supabase credentials found. Validating migration files only...\n");

    // Dry-run: just verify SQL files can be read
    const files = await readdir(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    for (const file of sqlFiles) {
      const path = join(MIGRATIONS_DIR, file);
      const content = await Bun.file(path).text();
      const lineCount = content.split("\n").length;
      const tableMatches = content.match(/CREATE TABLE (\w+)/g) ?? [];
      console.log(`✓ ${file} (${lineCount} lines, ${tableMatches.length} tables)`);
    }

    console.log(`\n✅ ${sqlFiles.length} migration file(s) validated successfully.`);
    console.log("   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run against a real database.");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  console.log(`Found ${sqlFiles.length} migration(s) to run.\n`);

  for (const file of sqlFiles) {
    const path = join(MIGRATIONS_DIR, file);
    const sql = await Bun.file(path).text();

    console.log(`Running: ${file}...`);
    const { error } = await supabase.rpc("exec_sql", { sql_text: sql });

    if (error) {
      console.error(`❌ Failed: ${file}`);
      console.error(error.message);
      process.exit(1);
    }

    console.log(`✓ ${file} applied successfully.`);
  }

  console.log("\n✅ All migrations applied.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
