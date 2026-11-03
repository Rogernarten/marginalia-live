// The wiki-worker's logic, with no Deno or npm imports, so `npm run test:worker` can run it on
// Node against saved Wikipedia responses. index.ts wires it to fetch and the database.
//
// One run: maybe refresh one topic's pages → read Wikipedia's recent changes since the cursor →
// keep the edits to pages in a topic → insert the ones not saved yet → record the run.

export const API = "https://en.wikipedia.org/w/api.php";
/** At most this many requests of 500 changes per run: about 19 minutes of English Wikipedia. */
export const MAX_PAGES = 3;
/** After a long outage, skip ahead instead of reading hours of backlog. */
export const MAX_GAP_MS = 10 * 60 * 1000;
/** A topic's linked pages are fetched again after this long. */
export const TOPIC_REFRESH_MS = 6 * 60 * 60 * 1000;
export const COMMENT_MAX = 500;

export type Cursor = { at: string; rcId: number };

/** One entry of `list=recentchanges`, with the fields we ask for. */
export type RecentChange = {
  type: "edit" | "new";
  title: string;
  revid: number;
  rcid: number;
  timestamp: string;
  user?: string;
  bot?: boolean;
  new?: boolean;
  oldlen?: number;
  newlen?: number;
  comment?: string;
};

export type EditRow = {
  rev_id: number;
  rc_id: number;
  title: string;
  topic_ids: string[];
  editor: string;
  is_bot: boolean;
  is_new: boolean;
  size_delta: number;
  comment: string;
  edited_at: string;
};

export type RunRow = {
  started_at: string;
  finished_at: string;
  ok: boolean;
  error: string | null;
  scanned: number;
  saved: number;
  pages_changed: number;
  cursor_at: string | null;
  cursor_rc_id: number | null;
  ms: number;
};

/** What the worker needs from the database. index.ts implements it with supabase-js. */
export interface Store {
  /** Where the last run stopped, or null before the first run. */
  lastCursor(): Promise<Cursor | null>;
  /** The topics each of these titles belongs to; titles in no topic are left out. */
  topicsFor(titles: string[]): Promise<Map<string, string[]>>;
  /** Inserts rows whose rev_id isn't saved yet and returns how many it inserted. */
  saveEdits(rows: EditRow[]): Promise<number>;
  /** The topic whose pages were refreshed longest ago, if that's before `before`. */
  staleTopic(before: Date): Promise<{ id: string; hubTitle: string } | null>;
  /** Makes the topic's pages exactly `titles` and returns how many rows changed. */
  replaceTopicPages(topicId: string, titles: string[]): Promise<number>;
  recordRun(run: RunRow): Promise<void>;
}

export type Deps = {
  store: Store;
  fetchJson: (url: string) => Promise<unknown>;
  now?: () => Date;
  log?: (line: string) => void;
};

export function recentChangesUrl(from: string, rccontinue?: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "recentchanges",
    rcdir: "newer",
    rcstart: from,
    rcnamespace: "0",
    rctype: "edit|new",
    rclimit: "500",
    rcprop: "title|ids|sizes|timestamp|user|comment|flags",
  });
  if (rccontinue) params.set("rccontinue", rccontinue);
  return `${API}?${params}`;
}

export function linksUrl(hubTitle: string, gplcontinue?: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: hubTitle,
    generator: "links",
    gplnamespace: "0",
    gpllimit: "max",
    redirects: "1",
  });
  if (gplcontinue) params.set("gplcontinue", gplcontinue);
  return `${API}?${params}`;
}

/** Checks the shape of a recent-changes response. Throws if Wikipedia sent something else. */
export function parseRecentChanges(body: unknown): { changes: RecentChange[]; next?: string } {
  const b = body as { error?: { info?: string }; query?: { recentchanges?: unknown }; continue?: { rccontinue?: unknown } };
  if (b?.error) throw new Error(`Wikipedia refused the request: ${b.error.info ?? "no reason given"}`);
  const list = b?.query?.recentchanges;
  if (!Array.isArray(list)) throw new Error("Wikipedia's answer has no query.recentchanges list");
  for (const c of list) {
    if (typeof c?.title !== "string" || !Number.isInteger(c?.revid) || !Number.isInteger(c?.rcid) || typeof c?.timestamp !== "string") {
      throw new Error("A recent change is missing title, revid, rcid or timestamp");
    }
  }
  const next = b.continue?.rccontinue;
  return { changes: list as RecentChange[], next: typeof next === "string" ? next : undefined };
}

/** Article titles in a links response: redirects already followed, missing pages left out. */
export function parseLinks(body: unknown): { titles: string[]; next?: string } {
  const b = body as { error?: { info?: string }; query?: { pages?: { title?: unknown; missing?: boolean }[] }; continue?: { gplcontinue?: unknown } };
  if (b?.error) throw new Error(`Wikipedia refused the request: ${b.error.info ?? "no reason given"}`);
  const pages = b?.query?.pages ?? [];
  const titles = pages.filter((p) => !p.missing && typeof p.title === "string").map((p) => p.title as string);
  const next = b.continue?.gplcontinue;
  return { titles, next: typeof next === "string" ? next : undefined };
}

export function toEditRow(c: RecentChange, topicIds: string[]): EditRow {
  const comment = (c.comment ?? "").trim();
  return {
    rev_id: c.revid,
    rc_id: c.rcid,
    title: c.title,
    topic_ids: [...topicIds].sort(),
    // Wikipedia leaves `user` out when an editor's name has been hidden.
    editor: c.user ?? "(name hidden)",
    is_bot: c.bot === true,
    is_new: c.new === true || c.type === "new",
    size_delta: (c.newlen ?? 0) - (c.oldlen ?? 0),
    comment: comment.length > COMMENT_MAX ? `${comment.slice(0, COMMENT_MAX - 1)}…` : comment,
    edited_at: c.timestamp,
  };
}

/** Where to start reading: the last cursor, unless it's missing or too old. */
export function startFrom(cursor: Cursor | null, now: Date): Cursor {
  const floor = new Date(now.getTime() - MAX_GAP_MS);
  if (!cursor || new Date(cursor.at) < floor) {
    // First run, or back after a long outage: start a minute ago.
    return { at: new Date(now.getTime() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"), rcId: 0 };
  }
  return cursor;
}

async function refreshOneTopic({ store, fetchJson, log }: Required<Pick<Deps, "store" | "fetchJson" | "log">>, now: Date) {
  const topic = await store.staleTopic(new Date(now.getTime() - TOPIC_REFRESH_MS));
  if (!topic) return 0;
  const titles = new Set<string>([topic.hubTitle]);
  let next: string | undefined;
  let requests = 0;
  do {
    const page = parseLinks(await fetchJson(linksUrl(topic.hubTitle, next)));
    page.titles.forEach((t) => titles.add(t));
    next = page.next;
    requests++;
  } while (next && requests < 10);
  const changed = await store.replaceTopicPages(topic.id, [...titles]);
  log(`topic ${topic.id}: ${titles.size} pages linked from "${topic.hubTitle}", ${changed} rows changed`);
  return changed;
}

export async function runOnce({ store, fetchJson, now = () => new Date(), log = () => {} }: Deps): Promise<RunRow> {
  const started = now();
  const previous = await store.lastCursor().catch(() => null);
  let scanned = 0;
  let saved = 0;
  let pagesChanged = 0;
  let cursor = previous;

  try {
    pagesChanged = await refreshOneTopic({ store, fetchJson, log }, started);

    const from = startFrom(previous, started);
    log(`reading changes from ${from.at} after rc ${from.rcId}`);
    const changes: RecentChange[] = [];
    let next: string | undefined;
    let requests = 0;
    do {
      const page = parseRecentChanges(await fetchJson(recentChangesUrl(from.at, next)));
      changes.push(...page.changes);
      next = page.next;
      requests++;
    } while (next && requests < MAX_PAGES);

    // rcstart includes changes at that exact second, which the last run may already have read.
    const fresh = changes.filter((c) => c.timestamp > from.at || c.rcid > from.rcId);
    scanned = fresh.length;
    const topics = fresh.length ? await store.topicsFor([...new Set(fresh.map((c) => c.title))]) : new Map();
    const rows = fresh.filter((c) => topics.has(c.title)).map((c) => toEditRow(c, topics.get(c.title)!));
    saved = rows.length ? await store.saveEdits(rows) : 0;

    const last = fresh.at(-1);
    cursor = last ? { at: last.timestamp, rcId: last.rcid } : from;
    log(`wikipedia: ${scanned} changes in ${requests} request${requests === 1 ? "" : "s"}${next ? " (more left for the next run)" : ""}; ${rows.length} in a topic; ${saved} new`);

    return await finish(true, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`failed: ${message}`);
    // Keep the previous cursor, so the next run reads what this one missed.
    cursor = previous;
    return await finish(false, message.slice(0, 500));
  }

  async function finish(ok: boolean, error: string | null): Promise<RunRow> {
    const finished = now();
    const run: RunRow = {
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      ok,
      error,
      scanned,
      saved,
      pages_changed: pagesChanged,
      cursor_at: cursor?.at ?? null,
      cursor_rc_id: cursor?.rcId ?? null,
      ms: finished.getTime() - started.getTime(),
    };
    await store.recordRun(run);
    return run;
  }
}
