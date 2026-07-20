# Theme sweep — 2f016ab-dirty

Captured 36 full-page screenshots (0 skipped) across
desktop + mobile × light/dark themes.

Filename: `<viewport>-<theme>-<page>.png`. Theme is set via `<html data-theme>`,
the app's single switch (globals.css). Pages still on hardcoded hex won't change
between light/dark — that visible non-response is exactly the migration signal.

Regenerate: `bun run scripts/theme-sweep.ts` (needs dev :3001 + supabase local + chromium).
Coach pages auth as Roberto; portal pages use a self-provisioned throwaway (torn down).
