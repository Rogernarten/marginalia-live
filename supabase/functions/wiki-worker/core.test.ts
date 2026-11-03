// Runs the worker on real Wikipedia responses saved on 3 November 2026, with an in-memory
// database that behaves like ours: rev_id is unique and repeats are ignored.
// Run: npm run test:worker

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runOnce, toEditRow, type Cursor, type EditRow, type RecentChange, type RunRow, type Store } from "./core.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const RECENT = fixture("recentchanges.json"); // 500 changes, 18:40:40Z to 18:46:53Z, with a continue token
const TOPIC_PAGES: Record<string, string[]> = fixture("topic-pages.json"); // brighton, georgian-era
const LINKS = fixture("links-pride-and-prejudice.json");

// Just before the first change in the saved response, as the previous run would have left it.
const BEFORE = { at: "2026-11-03T18:40:40Z", rcId: 2086393096 };
// The last change in the saved response.
const LAST = { at: "2026-11-03T18:46:53Z", rcId: 2086394524 };
const NOW = new Date("2026-11-03T18:47:00Z");

class MemoryStore implements Store {
  edits = new Map<number, EditRow>();
  runs: RunRow[] = [];
  pages = new Map<string, Set<string>>();
  refreshedAt = new Map<string, Date | null>();
  hubs = new Map<string, string>();

  constructor(cursor: Cursor | null, topics: Record<string, { hub: string; pages?: string[]; refreshedAt?: Date | null }>) {
    for (const [id, t] of Object.entries(topics)) {
      this.hubs.set(id, t.hub);
      this.pages.set(id, new Set(t.pages ?? []));
      this.refreshedAt.set(id, t.refreshedAt ?? null);
    }
    if (cursor) this.runs.push({ ...emptyRun, cursor_at: cursor.at, cursor_rc_id: cursor.rcId });
  }
  async lastCursor() {
    const run = this.runs.findLast((r) => r.cursor_rc_id !== null);
    return run ? { at: run.cursor_at!, rcId: run.cursor_rc_id! } : null;
  }
  async topicsFor(titles: string[]) {
    const found = new Map<string, string[]>();
    for (const title of titles) {
      const ids = [...this.pages].filter(([, set]) => set.has(title)).map(([id]) => id);
      if (ids.length) found.set(title, ids);
    }
    return found;
  }
  async saveEdits(rows: EditRow[]) {
    let inserted = 0;
    for (const row of rows) {
      if (this.edits.has(row.rev_id)) continue; // on conflict (rev_id) do nothing
      this.edits.set(row.rev_id, row);
      inserted++;
    }
    return inserted;
  }
  async staleTopic(before: Date) {
    const stale = [...this.refreshedAt].filter(([, at]) => !at || at < before);
    return stale.length ? { id: stale[0][0], hubTitle: this.hubs.get(stale[0][0])! } : null;
  }
  async replaceTopicPages(topicId: string, titles: string[]) {
    const old = this.pages.get(topicId) ?? new Set();
    const next = new Set(titles);
    const changed = [...next].filter((t) => !old.has(t)).length + [...old].filter((t) => !next.has(t)).length;
    this.pages.set(topicId, next);
    this.refreshedAt.set(topicId, NOW);
    return changed;
  }
  async recordRun(run: RunRow) {
    this.runs.push(run);
  }
}

const emptyRun: RunRow = {
  started_at: "", finished_at: "", ok: true, error: null, scanned: 0, saved: 0,
  pages_changed: 0, cursor_at: null, cursor_rc_id: null, ms: 0,
};

/** Two topics whose pages are already known, so runs go straight to recent changes. */
const knownTopics = () => ({
  brighton: { hub: "Brighton", pages: TOPIC_PAGES.brighton, refreshedAt: NOW },
  "georgian-era": { hub: "Georgian era", pages: TOPIC_PAGES["georgian-era"], refreshedAt: NOW },
});

/** Wikipedia as recorded: the saved page, then an empty page for the continue token. */
function recordedWikipedia() {
  const urls: string[] = [];
  const fetchJson = async (url: string) => {
    urls.push(url);
    if (url.includes("generator=links")) return LINKS;
    if (new URL(url).searchParams.has("rccontinue")) return { batchcomplete: true, query: { recentchanges: [] } };
    return RECENT;
  };
  return { urls, fetchJson };
}

test("saves only the edits to pages in a followed topic, with the fields the page shows", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const wiki = recordedWikipedia();

  const run = await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });

  assert.equal(run.ok, true);
  assert.equal(run.scanned, 500, "every change in the response is looked at");
  assert.equal(run.saved, 2, "only the 2 changes to pages in a topic are saved");
  assert.deepEqual([...store.edits.keys()].sort(), [1383617367, 1383617412]);
  assert.deepEqual(store.edits.get(1383617367), {
    rev_id: 1383617367,
    rc_id: 2086393699,
    title: "David Walliams",
    topic_ids: ["brighton"],
    editor: "Theroadislong",
    is_bot: false,
    is_new: false,
    size_delta: -130,
    comment: store.edits.get(1383617367)!.comment,
    edited_at: "2026-11-03T18:42:53Z",
  });
  assert.equal(store.edits.get(1383617412)!.topic_ids[0], "georgian-era");
  assert.equal(store.edits.get(1383617412)!.size_delta, 11);
});

test("reads from where the last run stopped, follows the continue token, and moves the cursor", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const wiki = recordedWikipedia();

  const run = await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });

  const first = new URL(wiki.urls[0]).searchParams;
  assert.equal(first.get("rcstart"), BEFORE.at);
  assert.equal(first.get("rcdir"), "newer");
  assert.equal(new URL(wiki.urls[1]).searchParams.get("rccontinue"), RECENT.continue.rccontinue);
  assert.deepEqual({ at: run.cursor_at, rcId: run.cursor_rc_id }, LAST);
  assert.deepEqual(await store.lastCursor(), LAST, "the run row carries the cursor for the next run");
});

test("a second run over the same changes saves nothing", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const wiki = recordedWikipedia();
  await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });
  const before = structuredClone([...store.edits]);

  // Wikipedia answers with the same changes again (nothing new happened).
  const again = await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });

  assert.equal(again.ok, true);
  assert.equal(again.scanned, 0, "changes up to the cursor were already read");
  assert.equal(again.saved, 0);
  assert.deepEqual([...store.edits], before, "no row was rewritten");
});

test("re-reading changes after a lost cursor still doesn't save duplicates", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const wiki = recordedWikipedia();
  await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });
  store.runs.push({ ...emptyRun, cursor_at: BEFORE.at, cursor_rc_id: BEFORE.rcId }); // cursor goes back

  const again = await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });

  assert.equal(again.scanned, 500);
  assert.equal(again.saved, 0, "the same rev_ids are ignored, not inserted twice");
  assert.equal(store.edits.size, 2);
});

test("when Wikipedia is down, the run is recorded as failed and the cursor stays", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const fetchJson = async () => {
    throw new Error("Wikipedia answered 503");
  };

  const run = await runOnce({ store, fetchJson, now: () => NOW });

  assert.equal(run.ok, false);
  assert.equal(run.error, "Wikipedia answered 503");
  assert.equal(run.saved, 0);
  assert.deepEqual({ at: run.cursor_at, rcId: run.cursor_rc_id }, BEFORE, "the next run reads what this one missed");
  assert.equal(store.runs.at(-1), run, "the failure is in worker_runs, so the page can show it");
  assert.equal(store.edits.size, 0);
});

test("when Wikipedia's answer changes shape, nothing is saved", async () => {
  const store = new MemoryStore(BEFORE, knownTopics());
  const renamed = structuredClone(RECENT);
  for (const c of renamed.query.recentchanges) {
    c.revision = c.revid;
    delete c.revid;
  }

  const run = await runOnce({ store, fetchJson: async () => renamed, now: () => NOW });

  assert.equal(run.ok, false);
  assert.match(run.error ?? "", /missing title, revid, rcid or timestamp/);
  assert.equal(store.edits.size, 0);
});

test("the first run starts a minute ago, and a cursor older than 10 minutes is skipped ahead", async () => {
  for (const cursor of [null, { at: "2026-11-03T17:00:00Z", rcId: 1 }]) {
    const store = new MemoryStore(cursor, knownTopics());
    const wiki = recordedWikipedia();
    await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });
    assert.equal(new URL(wiki.urls[0]).searchParams.get("rcstart"), "2026-11-03T18:46:00Z");
  }
});

test("a topic not refreshed for 6 hours gets its pages from the hub's links, redirects followed", async () => {
  const store = new MemoryStore(BEFORE, { "pride-and-prejudice": { hub: "Pride and Prejudice" } });
  const wiki = recordedWikipedia();

  const run = await runOnce({ store, fetchJson: wiki.fetchJson, now: () => NOW });

  const pages = store.pages.get("pride-and-prejudice")!;
  assert.equal(new URL(wiki.urls[0]).searchParams.get("generator"), "links");
  assert.equal(pages.size, 282, "281 linked articles that exist, and the hub itself");
  assert.ok(pages.has("Pride and Prejudice"));
  assert.ok(!pages.has("Pride and Prejudice (1952 TV series)"), "a red link (no article yet) is left out");
  assert.ok(pages.has("The New York Times"), "a link to a redirect counts as the page it points to");
  assert.ok(!pages.has("New York Times"));
  assert.equal(run.pages_changed, 282);
  assert.equal(run.ok, true, "the run still reads recent changes afterwards");
});

test("edit rows: a hidden name, a new page, and a long summary", () => {
  const change: RecentChange = {
    type: "new", title: "Kommetjie Library", revid: 1, rcid: 2, timestamp: "2026-11-03T18:40:41Z",
    new: true, oldlen: 0, newlen: 2539, comment: "x".repeat(900),
  };
  const row = toEditRow(change, ["london", "bath"]);
  assert.equal(row.editor, "(name hidden)");
  assert.equal(row.is_new, true);
  assert.equal(row.size_delta, 2539);
  assert.equal(row.comment.length, 500);
  assert.ok(row.comment.endsWith("…"));
  assert.deepEqual(row.topic_ids, ["bath", "london"]);
});
