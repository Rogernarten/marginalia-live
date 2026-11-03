import { Skeleton } from "@/components/ui/skeleton";
import { cx, FOCUS } from "@/components/ui/cx";
import type { Topic } from "@/lib/live";

/** The ten topics, each a toggle. Saved to the reader's own `follows` rows. */
export function TopicPicker({
  topics,
  following,
  failed,
  onChange,
}: {
  topics: Topic[] | null;
  following: Set<string> | null;
  failed: string | null;
  onChange: (topicId: string, follow: boolean) => void;
}) {
  return (
    <section aria-labelledby="topics-heading">
      <h2 id="topics-heading" className="font-serif text-xl">
        Your topics
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">Each topic is a Wikipedia article and every article it links to.</p>
      {!topics || !following ? (
        <Skeleton lines={6} className="mt-4" />
      ) : (
        <ul className="mt-4 space-y-2">
          {topics.map((t) => {
            const on = following.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-describedby={failed === t.id ? `${t.id}-error` : undefined}
                  onClick={() => onChange(t.id, !on)}
                  className={cx(
                    "flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    on ? "border-accent bg-surface" : "border-edge bg-paper hover:bg-surface",
                    FOCUS,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs",
                      on ? "border-accent bg-accent text-white" : "border-edge bg-surface",
                    )}
                  >
                    {on && "✓"}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{t.label}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted">{t.blurb}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {t.page_count > 0 ? `${t.page_count.toLocaleString()} pages, from “${t.hub_title}”` : `From “${t.hub_title}”`}
                    </span>
                  </span>
                </button>
                {failed === t.id && (
                  <p id={`${t.id}-error`} className="mt-1 text-sm text-danger">
                    That didn&apos;t save. Check your connection, then try again.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
