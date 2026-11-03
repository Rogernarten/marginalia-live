// wiki-worker: called by Supabase Cron every 10 seconds. Reads Wikipedia's recent changes and
// saves the edits to pages in a topic. The logic is in core.ts; this file connects it to fetch
// and the database.
//
// It isn't a user, so it writes with the project's secret key, which Supabase sets in this
// function's environment on its own servers. The key is never in the repository.

import { createClient } from "npm:@supabase/supabase-js@2";
import { runOnce, type EditRow, type RunRow, type Store } from "./core.ts";

const USER_AGENT = "MarginaliaLive/1.0 (https://github.com/Rogernarten/marginalia-live; Design, Build, Ship class project)";
const TIMEOUT_MS = 6000;

const db = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } });

/** The project's default secret key. The legacy service-role key (retired at the end of 2026) only if there isn't one. */
function secretKey() {
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  const key = keys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("No secret key in the function's environment");
  return key;
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => {
    throw new Error(`Wikipedia didn't answer: ${e.name}`);
  });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  return await res.json().catch(() => {
    throw new Error("Wikipedia sent something that isn't JSON");
  });
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T {
  if (error) throw new Error(`Database: couldn't ${what}: ${error.message}`);
  return data;
}

const store: Store = {
  async lastCursor() {
    const row = check(
      await db.from("worker_runs").select("cursor_at, cursor_rc_id").not("cursor_rc_id", "is", null).order("id", { ascending: false }).limit(1).maybeSingle(),
      "read the last cursor",
    );
    return row ? { at: new Date(row.cursor_at).toISOString().replace(/\.\d{3}Z$/, "Z"), rcId: Number(row.cursor_rc_id) } : null;
  },
  async topicsFor(titles) {
    // An RPC, so a few hundred titles go in the request body rather than the URL.
    const rows = check(await db.rpc("topics_for", { p_titles: titles }), "match titles to topics") as { title: string; topic_ids: string[] }[];
    return new Map(rows.map((r) => [r.title, r.topic_ids]));
  },
  async saveEdits(rows: EditRow[]) {
    // on conflict (rev_id) do nothing: only edits not saved yet come back.
    const inserted = check(await db.from("edits").upsert(rows, { onConflict: "rev_id", ignoreDuplicates: true }).select("rev_id"), "save edits");
    return inserted?.length ?? 0;
  },
  async staleTopic(before) {
    const row = check(
      await db
        .from("topics")
        .select("id, hub_title")
        .or(`pages_refreshed_at.is.null,pages_refreshed_at.lt.${before.toISOString()}`)
        .order("pages_refreshed_at", { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle(),
      "find a topic to refresh",
    );
    return row ? { id: row.id, hubTitle: row.hub_title } : null;
  },
  async replaceTopicPages(topicId, titles) {
    return Number(check(await db.rpc("replace_topic_pages", { p_topic_id: topicId, p_titles: titles }), "refresh a topic's pages"));
  },
  async recordRun(run: RunRow) {
    check(await db.from("worker_runs").insert(run), "record the run");
  },
};

Deno.serve(async (req) => {
  // Only the cron job knows this secret. It was generated in the database's Vault.
  const { data: allowed } = await db.rpc("check_worker_secret", { p_secret: req.headers.get("x-worker-secret") ?? "" });
  if (allowed !== true) return new Response("Not allowed", { status: 403 });

  try {
    const run = await runOnce({ store, fetchJson, log: (line) => console.log(line) });
    console.log(`${run.ok ? "ok" : "failed"}: scanned ${run.scanned}, saved ${run.saved}, pages changed ${run.pages_changed}, ${run.ms} ms`);
    return Response.json(run, { status: run.ok ? 200 : 502 });
  } catch (e) {
    // Couldn't even record the run (the database is unreachable).
    console.error(`couldn't record the run: ${(e as Error).message}`);
    return new Response("Couldn't record the run", { status: 500 });
  }
});
