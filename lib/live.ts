"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

// Everything the live page reads, straight from Supabase with the reader's Clerk token.
// No query filters by reader or topic: row-level security decides what comes back, for the
// first load and for every Realtime push.

export type Topic = { id: string; hub_title: string; label: string; blurb: string; sort: number; page_count: number };
export type Edit = {
  rev_id: number;
  title: string;
  topic_ids: string[];
  editor: string;
  is_bot: boolean;
  is_new: boolean;
  size_delta: number;
  comment: string;
  edited_at: string;
};
export type Run = { id: number; started_at: string; finished_at: string; ok: boolean; error: string | null; scanned: number; saved: number };
/** The page's own connection to Realtime, separate from whether the worker is running. */
export type Connection = "connecting" | "live" | "lost";

const FEED_SIZE = 60;
const EDIT_COLUMNS = "rev_id, title, topic_ids, editor, is_bot, is_new, size_delta, comment, edited_at";
const RUN_COLUMNS = "id, started_at, finished_at, ok, error, scanned, saved";

const newestFirst = (a: Edit, b: Edit) => b.edited_at.localeCompare(a.edited_at) || b.rev_id - a.rev_id;

// One client for the page. Realtime asks for the token on connect and on every heartbeat, so a
// Clerk token that expires (they last about a minute) is replaced on its own.
//
// The client is made during the first render, before any effect runs, and asks for a token
// straight away. So until useAuth's getToken is in place, read the session Clerk has already
// loaded (this page only renders once the reader is signed in). Without it, Realtime joined as
// anonymous and every push came back "Error 401: Unauthorized".
type ClerkGlobal = { Clerk?: { session?: { getToken(): Promise<string | null> } | null } };
let getToken: () => Promise<string | null> = async () => (await (globalThis as ClerkGlobal).Clerk?.session?.getToken()) ?? null;
let client: SupabaseClient | null = null;
function supabase() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: () => getToken(),
  });
  return client;
}

export function useLive() {
  const { getToken: clerkToken } = useAuth();
  useEffect(() => {
    getToken = async () => (await clerkToken()) ?? null;
  }, [clerkToken]);
  const [db] = useState(supabase);

  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [following, setFollowing] = useState<Set<string> | null>(null);
  const [edits, setEdits] = useState<Edit[] | null>(null);
  /** undefined while loading; null if the worker has never run. */
  const [run, setRun] = useState<Run | null | undefined>(undefined);
  /** Edits pushed by Realtime since the page opened, newest last: highlighted and announced. */
  const [arrived, setArrived] = useState<Edit[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [loadError, setLoadError] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const loadEdits = useCallback(async () => {
    const { data, error } = await db.from("edits").select(EDIT_COLUMNS).order("edited_at", { ascending: false }).limit(FEED_SIZE);
    if (error) throw error;
    setEdits(data as Edit[]);
  }, [db]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [t, f, r] = await Promise.all([
        db.from("topics").select("id, hub_title, label, blurb, sort, page_count").order("sort"),
        db.from("follows").select("topic_id"),
        db.from("worker_runs").select(RUN_COLUMNS).order("id", { ascending: false }).limit(1).maybeSingle(),
        loadEdits(),
      ]);
      const error = t.error ?? f.error ?? r.error;
      if (error) throw error;
      setTopics(t.data as Topic[]);
      setFollowing(new Set((f.data as { topic_id: string }[]).map((x) => x.topic_id)));
      setRun((r.data as Run | null) ?? null);
    } catch (e) {
      console.error("[live] couldn't load:", (e as Error).message);
      setLoadError(true);
    }
  }, [db, loadEdits]);

  useEffect(() => {
    // The first load, as soon as the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let wasLost = false;
    let mounted = true;
    let channel: RealtimeChannel | null = null;
    let retry: number | undefined;

    // realtime-js rejoins by itself after an error or a timeout, but not when the server closes
    // the channel (phx_close, seen once in testing). Then join again on a new channel.
    // When the socket comes back (after sleep, or a dropped network), realtime-js rejoins with the
    // token it last had, expired by then ("InvalidJWTToken: Token has expired 516 seconds ago"),
    // and only asks for a new one at the next heartbeat. So when the server refuses the token,
    // ask now; the library's next rejoin carries it. (Not a new channel per error: while the
    // socket is down, old channels can't be removed and all of them rejoin at once later.)
    function joinAgain(after: number) {
      window.clearTimeout(retry);
      retry = window.setTimeout(() => {
        const old = channel;
        channel = null;
        if (old) void db.removeChannel(old);
        void join();
      }, after);
    }

    async function join() {
      try {
        // Join as the reader: Realtime checks every push against the token sent when joining.
        await db.realtime.setAuth();
      } catch (e) {
        console.error("[live] couldn't get a token for Realtime:", (e as Error).message);
        return joinAgain(5000);
      }
      if (!mounted) return;
      // A new name each time: db.channel() hands back an existing channel with the same name,
      // even one still closing from the last mount (React runs effects twice in development).
      const ch = db
        .channel(`live:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "edits" }, (payload) => {
          if (payload.errors) return console.error("[live] realtime edit refused:", payload.errors);
          const edit = payload.new as Edit;
          setEdits((list) => (list && !list.some((e) => e.rev_id === edit.rev_id) ? [edit, ...list].sort(newestFirst).slice(0, FEED_SIZE) : list));
          setArrived((list) => [...list.slice(-19), edit]);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
          if (payload.errors) return console.error("[live] realtime run refused:", payload.errors);
          setRun(payload.new as Run);
        });
      channel = ch;
      ch.subscribe((status, err) => {
        if (err) console.error(`[live] realtime ${status}: ${err.message}`);
        // A channel we closed ourselves (on unmount, or to join again) isn't a lost connection.
        if (!mounted || ch !== channel) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Back after a drop: fetch what was pushed while we weren't listening.
          if (wasLost) void load();
          wasLost = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("lost");
          wasLost = true;
          if (status === "CLOSED") joinAgain(2000);
          if (status === "CHANNEL_ERROR" && /token|jwt/i.test(err?.message ?? "")) {
            db.realtime.setAuth().catch((e) => console.error("[live] couldn't get a new token for Realtime:", (e as Error).message));
          }
        }
      });
    }

    void join();
    return () => {
      mounted = false;
      window.clearTimeout(retry);
      if (channel) void db.removeChannel(channel);
    };
  }, [db, load]);

  async function setFollow(topicId: string, follow: boolean) {
    setFollowError(null);
    setFollowing((s) => {
      const next = new Set(s);
      if (follow) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
    // No user filter on delete either: RLS only lets a reader remove their own row.
    const { error } = follow ? await db.from("follows").insert({ topic_id: topicId }) : await db.from("follows").delete().eq("topic_id", topicId);
    if (error) {
      console.error("[live] couldn't change follow:", error.message);
      setFollowing((s) => {
        const next = new Set(s);
        if (follow) next.delete(topicId);
        else next.add(topicId);
        return next;
      });
      setFollowError(topicId);
      return;
    }
    // What RLS lets this reader see just changed.
    await loadEdits().catch(() => setLoadError(true));
  }

  /** Follows every topic not followed yet, in one insert. */
  async function followAll() {
    const missing = (topics ?? []).map((t) => t.id).filter((id) => !following?.has(id));
    if (!missing.length) return;
    setFollowError(null);
    setFollowing((s) => new Set([...(s ?? []), ...missing]));
    const { error } = await db.from("follows").insert(missing.map((topic_id) => ({ topic_id })));
    if (error) {
      console.error("[live] couldn't follow all:", error.message);
      setFollowing((s) => new Set([...(s ?? [])].filter((id) => !missing.includes(id))));
      setFollowError("all");
      return;
    }
    await loadEdits().catch(() => setLoadError(true));
  }

  return { topics, following, edits, run, arrived, connection, loadError, followError, reload: load, setFollow, followAll };
}

/** The current time, updated every second, so "4 seconds ago" counts up on its own. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
