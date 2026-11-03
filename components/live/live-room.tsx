"use client";

import { useAuth } from "@clerk/nextjs";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { freshness } from "@/lib/freshness";
import { useLive, useNow } from "@/lib/live";
import { EditFeed } from "./edit-feed";
import { FreshnessBar } from "./freshness-bar";
import { TopicPicker } from "./topic-picker";

/** Signed in: the live room. Signed out: what it is, and a way in. */
export function LiveGate() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Skeleton lines={6} className="mt-8" />;
  if (!isSignedIn) return <SignedOut />;
  return <LiveRoom />;
}

function LiveRoom() {
  const live = useLive();
  const now = useNow();

  if (live.loadError) {
    return (
      <div role="alert" className="mt-8 rounded-md border border-danger bg-surface px-4 py-4">
        <p className="font-semibold">We couldn&apos;t load your topics and edits.</p>
        <p className="mt-1 text-[0.9375rem]">Check your connection, then try again.</p>
        <Button variant="secondary" className="mt-3" onClick={() => void live.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6">
        <FreshnessBar fresh={freshness(live.run, now)} connection={live.connection} />
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[20rem_1fr]">
        <TopicPicker topics={live.topics} following={live.following} failed={live.followError} onChange={live.setFollow} onFollowAll={() => void live.followAll()} />
        <EditFeed edits={live.edits} arrived={live.arrived} topics={live.topics} followingCount={live.following?.size ?? null} now={now} />
      </div>
    </>
  );
}

function SignedOut() {
  return (
    <div className="mt-8 max-w-[38rem]">
      <ul className="space-y-2 text-[1.0625rem] leading-relaxed">
        <li>Choose topics from the novel: the book itself, Jane Austen, the Regency, the Napoleonic Wars, Bath, Derbyshire…</li>
        <li>Every 10 seconds, we check what&apos;s just been edited on Wikipedia.</li>
        <li>Edits to pages in your topics appear here as they happen, without refreshing.</li>
      </ul>
      <LinkButton href="/sign-in" className="mt-6">
        Sign in to choose topics
      </LinkButton>
    </div>
  );
}
