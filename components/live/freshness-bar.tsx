import { Skeleton } from "@/components/ui/skeleton";
import { CHECK_EVERY_S, type Freshness } from "@/lib/freshness";
import type { Connection } from "@/lib/live";
import { ago, clock } from "@/lib/time";
import { cx } from "@/components/ui/cx";

/**
 * How current the page is: fresh, stale, down, or not started, from the newest worker run.
 * The seconds count up on their own. Screen readers hear only when the state changes.
 */
export function FreshnessBar({ fresh, connection }: { fresh: Freshness; connection: Connection }) {
  if (fresh.state === "loading") return <Skeleton lines={1} className="max-w-md" />;

  const said = {
    never: "The worker hasn't run yet.",
    fresh: "Live: checking Wikipedia every 10 seconds.",
    stale: "Not up to date: the worker may be paused.",
    down: "The last check of Wikipedia failed.",
  }[fresh.state];

  return (
    <div className="space-y-2">
      <p role="status" className="sr-only">
        {said}
      </p>
      {fresh.state === "fresh" && (
        <div aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem]">
          <span className="flex items-center gap-2 font-semibold text-accent">
            <span className="pulse size-2.5 rounded-full bg-accent" />
            Live
          </span>
          <span>Checked Wikipedia {ago(fresh.ageMs)}</span>
          <span className="text-muted">
            {fresh.run.scanned.toLocaleString()} {fresh.run.scanned === 1 ? "edit" : "edits"} on Wikipedia since the check before,{" "}
            {fresh.run.saved} in these topics
          </span>
        </div>
      )}
      {fresh.state === "stale" && (
        <Banner tone="stale" title={`Not updated for ${ago(fresh.ageMs).replace(" ago", "")}`}>
          Wikipedia is normally checked every {CHECK_EVERY_S} seconds, so the worker may be paused. The edits below are from{" "}
          {clock(fresh.run.finished_at)} and earlier. This page updates on its own when checks start again.
        </Banner>
      )}
      {fresh.state === "down" && (
        <Banner tone="down" title={`The last check failed, ${ago(fresh.ageMs)}`}>
          {fresh.run.error ?? "No reason was recorded."} It tries again every {CHECK_EVERY_S} seconds; the edits below are from
          before it failed.
        </Banner>
      )}
      {fresh.state === "never" && (
        <Banner tone="stale" title="The worker hasn't run yet">
          Once it starts, it checks Wikipedia every {CHECK_EVERY_S} seconds and edits appear here on their own.
        </Banner>
      )}
      {connection === "lost" && (
        <Banner tone="stale" title="Live updates paused">
          The page lost its connection and is reconnecting. Edits saved in the meantime will appear when it&apos;s back.
        </Banner>
      )}
    </div>
  );
}

function Banner({ tone, title, children }: { tone: "stale" | "down"; title: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-md border-l-4 bg-surface px-4 py-3 text-[0.9375rem]", tone === "down" ? "border-danger" : "border-context")}>
      <p className={cx("font-semibold", tone === "down" ? "text-danger" : "text-context")}>{title}</p>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
