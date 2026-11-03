"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
let getToken: () => Promise<string | null> = async () => null;
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
    const channel = db
      .channel("live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "edits" }, (payload) => {
        const edit = payload.new as Edit;
        setEdits((list) => (list && !list.some((e) => e.rev_id === edit.rev_id) ? [edit, ...list].sort(newestFirst).slice(0, FEED_SIZE) : list));
        setArrived((list) => [...list.slice(-19), edit]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        setRun(payload.new as Run);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Back after a drop: fetch what was pushed while we weren't listening.
          if (wasLost) void load();
          wasLost = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("lost");
          wasLost = true;
        }
      });
    return () => {
      void db.removeChannel(channel);
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

  return { topics, following, edits, run, arrived, connection, loadError, followError, reload: load, setFollow };
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
