import { ExternalLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/cx";
import type { Edit, Topic } from "@/lib/live";
import { ago, bytes, clock, readableSummary } from "@/lib/time";

/** Edits in the reader's topics, newest first. RLS already left out every other topic. */
export function EditFeed({
  edits,
  arrived,
  topics,
  followingCount,
  now,
}: {
  edits: Edit[] | null;
  arrived: Edit[];
  topics: Topic[] | null;
  followingCount: number | null;
  now: number;
}) {
  const labels = new Map(topics?.map((t) => [t.id, t.label]));
  const fresh = new Set(arrived.map((e) => e.rev_id));
  const latest = arrived.at(-1);

  return (
    <section aria-labelledby="feed-heading">
      <h2 id="feed-heading" className="font-serif text-xl">
        Edits in your topics
      </h2>
      {/* Announce each arrival once, not the whole list. */}
      <p role="status" className="sr-only">
        {latest ? `New edit to ${latest.title}.` : ""}
      </p>

      {edits === null || followingCount === null ? (
        <Skeleton lines={8} className="mt-4" />
      ) : followingCount === 0 ? (
        <Empty title="Follow a topic to start">Choose one or more topics, and edits to their pages will appear here as they happen.</Empty>
      ) : edits.length === 0 ? (
        <Empty title="No edits in your topics yet">
          Wikipedia is checked every 10 seconds. New edits will appear here on their own, usually within a few minutes. Following
          more topics brings more.
        </Empty>
      ) : (
        <ol className="mt-4 divide-y divide-rule border-y border-rule">
          {edits.map((e) => (
            <li key={e.rev_id} className={cx("px-1 py-3", fresh.has(e.rev_id) && "arrive")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <ExternalLink href={`https://en.wikipedia.org/w/index.php?diff=${e.rev_id}`} className="font-serif text-lg leading-snug">
                  {e.title}
                </ExternalLink>
                <time dateTime={e.edited_at} title={clock(e.edited_at)} className="shrink-0 text-sm text-muted">
                  {ago(now - new Date(e.edited_at).getTime())}
                </time>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-2 text-sm">
                <span className={cx("font-medium", e.size_delta > 0 ? "text-accent" : e.size_delta < 0 ? "text-danger" : "text-muted")}>
                  {bytes(e.size_delta)}
                </span>
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <span>{e.editor}</span>
                {e.is_bot && <Tag>bot</Tag>}
                {e.is_new && <Tag>new page</Tag>}
              </p>
              {e.comment && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{readableSummary(e.comment)}</p>}
              <p className="mt-1.5 text-xs text-muted">
                In {e.topic_ids.map((id) => labels.get(id) ?? id).join(", ")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-edge px-1.5 text-xs leading-5 text-muted">{children}</span>;
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-rule bg-surface px-4 py-5">
      <p className="font-serif text-lg">{title}</p>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
