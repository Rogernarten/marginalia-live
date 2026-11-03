import type { Run } from "./live";

/** How often Supabase Cron runs the worker. */
export const CHECK_EVERY_S = 10;
/** Three missed runs, with a little slack for a slow one. */
export const STALE_AFTER_MS = 35_000;

export type Freshness =
  | { state: "loading" }
  | { state: "never" }
  | { state: "down"; run: Run; ageMs: number }
  | { state: "stale"; run: Run; ageMs: number }
  | { state: "fresh"; run: Run; ageMs: number };

/** How current the page is, from the newest worker run. */
export function freshness(run: Run | null | undefined, now: number): Freshness {
  if (run === undefined) return { state: "loading" };
  if (run === null) return { state: "never" };
  const ageMs = Math.max(0, now - new Date(run.finished_at).getTime());
  if (!run.ok) return { state: "down", run, ageMs };
  if (ageMs >= STALE_AFTER_MS) return { state: "stale", run, ageMs };
  return { state: "fresh", run, ageMs };
}
